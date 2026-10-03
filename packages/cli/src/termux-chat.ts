import {
  createGeminiTermuxChatSession,
  createOfflineTermuxChatSession,
  createOpenAITermuxChatSession,
  listTermuxChatProviders,
  resolveTermuxChatProvider
} from "../../agent/src/index.ts";
import {prettyJson} from "../../core/src/index.ts";

function parseOptions(argv:string[]):Record<string,string|boolean>{
  const options:Record<string,string|boolean>={};
  for(let index=0;index<argv.length;index+=1){
    const token=argv[index];
    if(!token.startsWith("--"))continue;
    const equal=token.indexOf("=");
    if(equal>2){
      options[token.slice(2,equal)]=token.slice(equal+1);
      continue;
    }
    const key=token.slice(2);
    const next=argv[index+1];
    if(next!==undefined&&!next.startsWith("--")){
      options[key]=next;
      index+=1;
    }else options[key]=true;
  }
  return options;
}

function textOption(options:Record<string,string|boolean>,key:string):string|undefined{
  const value=options[key];
  return typeof value==="string"&&value.trim()?value.trim():undefined;
}

function enabled(options:Record<string,string|boolean>,key:string):boolean{
  return options[key]===true||options[key]==="true";
}

function positiveNumber(value:string|undefined,label:string):number{
  if(value===undefined)throw new Error(`--${label} é obrigatório para este provedor`);
  const number=Number(value);
  if(!Number.isFinite(number)||number<=0)throw new Error(`--${label} deve ser maior que zero`);
  return number;
}

function providerLines():string{
  return listTermuxChatProviders().map(provider=>{
    if(provider.id==="offline")return "offline  local; sem rede; sem API key; sem custo de API";
    if(provider.id==="gemini")return "gemini   externo; GEMINI_API_KEY; elegível a free tier, sem garantia de gratuidade";
    return "openai   externo; OPENAI_API_KEY; exige autorização paga e budget da sessão";
  }).join("\n")+"\n";
}

export async function runTermuxChat(argv:string[]=[]):Promise<void>{
  const options=parseOptions(argv);
  if(enabled(options,"json"))throw new Error("arca chat é interativo e não aceita --json nesta versão");
  const selected=resolveTermuxChatProvider(textOption(options,"provider")??process.env.ARCA_CHAT_PROVIDER??"offline");
  const maxOutputTokens=Number(textOption(options,"max-output-tokens")??"800");
  const timeoutMs=Number(textOption(options,"timeout-ms")??"30000");

  let model:string|null=selected.defaultModel;
  let session:any;
  if(selected.id==="offline"){
    model=null;
    session=createOfflineTermuxChatSession();
  }else if(selected.id==="gemini"){
    const apiKey=String(process.env.GEMINI_API_KEY??"").trim();
    if(!apiKey)throw new Error("GEMINI_API_KEY é obrigatório para --provider gemini");
    model=textOption(options,"model")??(String(process.env.ARCA_GEMINI_MODEL??"").trim()||selected.defaultModel);
    session=createGeminiTermuxChatSession({
      apiKey,
      model,
      allowExternal:enabled(options,"allow-external"),
      maxOutputTokens,
      timeoutMs
    });
  }else{
    const apiKey=String(process.env.OPENAI_API_KEY??"").trim();
    if(!apiKey)throw new Error("OPENAI_API_KEY é obrigatório para --provider openai");
    model=textOption(options,"model")??(String(process.env.ARCA_OPENAI_MODEL??"").trim()||selected.defaultModel);
    session=createOpenAITermuxChatSession({
      apiKey,
      model,
      allowExternal:enabled(options,"allow-external"),
      allowPaidApi:enabled(options,"allow-paid-api"),
      sessionBudgetUsd:positiveNumber(textOption(options,"session-budget-usd"),"session-budget-usd"),
      maxOutputTokens,
      timeoutMs
    });
  }

  const {createInterface}=await import("node:readline/promises");
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const banner=[
    "ARCA Chat — sessão Termux em memória",
    `Provider: ${selected.id}`,
    `Modelo: ${model??"nenhum (offline)"}`
  ];
  if(selected.monetaryBudgetRequired)banner.push(`Budget estimado da sessão: US$ ${session.status.sessionBudgetUsd}`);
  banner.push("Comandos: /status /context /providers /clear /help /exit","");
  process.stdout.write(banner.join("\n"));

  try{
    while(true){
      const line=String(await rl.question("> ")).trim();
      if(!line)continue;
      if(line==="/exit"||line==="/quit")break;
      if(line==="/help"){
        process.stdout.write("/status estado da sessão\n/context contexto ativo\n/providers provedores disponíveis\n/clear limpa histórico em memória\n/exit encerra\n");
        continue;
      }
      if(line==="/providers"){
        process.stdout.write(providerLines());
        continue;
      }
      if(line==="/status"){
        process.stdout.write(prettyJson(session.status));
        continue;
      }
      if(line==="/context"){
        process.stdout.write(`Contexto: histórico desta sessão somente em memória (${session.status.historyMessages} mensagens). Contexto automático do projeto ARCA ainda está desligado.\n`);
        continue;
      }
      if(line==="/clear"){
        session.clear();
        process.stdout.write(selected.id==="openai"
          ?"Histórico da conversa limpo; budget consumido não foi restaurado.\n"
          :"Histórico da conversa limpo.\n");
        continue;
      }
      try{
        const answer=await session.ask(line);
        process.stdout.write(String(answer.text??"")+"\n");
      }catch(error:any){
        process.stderr.write(`Erro: ${error?.message??error}\n`);
        if(error?.code==="ARCA_TERMUX_CHAT_BUDGET_EXHAUSTED")break;
      }
    }
  }finally{
    rl.close();
  }
}
