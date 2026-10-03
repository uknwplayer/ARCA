import {createGeminiProviderClient} from "./gemini-provider.ts";
import {runOpenAITermuxAsk} from "./openai-reasoning-bridge.ts";
import {ARCA_TERMUX_GEMINI_DEFAULT_MODEL} from "./termux-chat-providers.ts";

export const ARCA_TERMUX_CHAT_SESSION_FORMAT="arca-termux-chat-session-v1";

function positiveMoney(value,label,max=1000){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||n>max)throw new RangeError(label+" must be > 0 and <= "+max+" USD");
  return n;
}
function text(value,label,max){
  const out=String(value??"").trim();
  if(!out)throw new TypeError(label+" required");
  if(out.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return out;
}
function round(value){return Number(Number(value).toFixed(9))}
function transcript(history,current){
  const lines=[
    "ARCA terminal conversation. Preserve conversational continuity.",
    "Do not claim tool execution or ARCA state mutation without verified host evidence.",
    ""
  ];
  for(const item of history){
    lines.push((item.role==="user"?"User":"Assistant")+": "+item.content);
  }
  lines.push("User: "+current);
  lines.push("Assistant:");
  return lines.join("\n");
}
function trimHistory(history,maxChars){
  const out=[...history];
  while(out.length&&JSON.stringify(out).length>maxChars)out.shift();
  return out;
}
function sessionLimits(maxHistoryChars,maxTurns){
  const historyLimit=Number(maxHistoryChars);
  const turnLimit=Number(maxTurns);
  if(!Number.isSafeInteger(historyLimit)||historyLimit<1000||historyLimit>50000)throw new RangeError("invalid maxHistoryChars");
  if(!Number.isSafeInteger(turnLimit)||turnLimit<1||turnLimit>200)throw new RangeError("invalid maxTurns");
  return {historyLimit,turnLimit};
}
function boundedPrompt(history,current,historyLimit,maxPromptChars){
  let compact=trimHistory(history,historyLimit);
  let prompt=transcript(compact,current);
  while(compact.length&&prompt.length>maxPromptChars){
    compact=compact.slice(1);
    prompt=transcript(compact,current);
  }
  if(prompt.length>maxPromptChars){
    const error=new Error("ARCA chat prompt exceeds safe one-shot limit");
    error.code="ARCA_TERMUX_CHAT_PROMPT_LIMIT";
    throw error;
  }
  return {compact,prompt};
}

export function createOfflineTermuxChatSession(){
  let turns=0;
  return Object.freeze({
    format:ARCA_TERMUX_CHAT_SESSION_FORMAT,
    get status(){
      return Object.freeze({
        provider:"offline",
        model:null,
        turns,
        historyMessages:0,
        estimatedSpentUsd:0,
        persistence:"memory-only",
        toolsAuthorized:false,
        coreMutationAuthorized:false,
        externalNetworkAuthorized:false
      });
    },
    clear(){return this.status},
    async ask(message){
      text(message,"chat message",8000);
      turns+=1;
      return Object.freeze({
        provider:"offline",
        model:null,
        text:"Modo offline ativo. Use /providers para ver os backends disponíveis ou reinicie com --provider gemini/openai para conversar com um modelo externo.",
        monetaryBudgetRequired:false,
        chat:Object.freeze({turn:turns,persistence:"memory-only",historyMessages:0})
      });
    }
  });
}

export function createGeminiTermuxChatSession({
  apiKey,
  model=ARCA_TERMUX_GEMINI_DEFAULT_MODEL,
  allowExternal=false,
  maxOutputTokens=800,
  timeoutMs=30000,
  maxHistoryChars=12000,
  maxTurns=40,
  fetchImpl=globalThis.fetch
}={}){
  const {historyLimit,turnLimit}=sessionLimits(maxHistoryChars,maxTurns);
  const client=createGeminiProviderClient({apiKey,model,fetchImpl,timeoutMs,maxOutputTokens});
  let history=[];
  let turns=0;

  return Object.freeze({
    format:ARCA_TERMUX_CHAT_SESSION_FORMAT,
    get status(){
      return Object.freeze({
        provider:"gemini",
        model:client.model,
        turns,
        maxTurns:turnLimit,
        historyMessages:history.length,
        historyChars:JSON.stringify(history).length,
        estimatedSpentUsd:0,
        monetaryBudgetRequired:false,
        persistence:"memory-only",
        toolsAuthorized:false,
        coreMutationAuthorized:false,
        externalNetworkAuthorized:Boolean(allowExternal)
      });
    },
    clear(){
      history=[];
      return this.status;
    },
    async ask(message){
      if(!allowExternal){
        const error=new Error("Gemini externo não autorizado; use --allow-external");
        error.code="ARCA_TERMUX_CHAT_EXTERNAL_NOT_AUTHORIZED";
        throw error;
      }
      if(turns>=turnLimit){
        const error=new Error("ARCA chat session turn limit reached");
        error.code="ARCA_TERMUX_CHAT_TURN_LIMIT";
        throw error;
      }
      const current=text(message,"chat message",8000);
      const {compact,prompt}=boundedPrompt(history,current,historyLimit,30000);
      const result=await client.generateText({prompt});
      turns+=1;
      history=trimHistory([
        ...compact,
        {role:"user",content:current},
        {role:"assistant",content:result.text}
      ],historyLimit);
      return Object.freeze({
        ...result,
        provider:"gemini",
        monetaryBudgetRequired:false,
        chat:Object.freeze({
          turn:turns,
          historyMessages:history.length,
          persistence:"memory-only"
        })
      });
    }
  });
}

export function createOpenAITermuxChatSession({
  apiKey,
  model,
  allowExternal=false,
  allowPaidApi=false,
  sessionBudgetUsd,
  maxOutputTokens=800,
  timeoutMs=30000,
  maxHistoryChars=12000,
  maxTurns=40,
  fetchImpl=globalThis.fetch,
  now
}={}){
  const budget=positiveMoney(sessionBudgetUsd,"sessionBudgetUsd",100);
  const {historyLimit,turnLimit}=sessionLimits(maxHistoryChars,maxTurns);
  let history=[];
  let spentUsd=0;
  let turns=0;

  return Object.freeze({
    format:ARCA_TERMUX_CHAT_SESSION_FORMAT,
    get status(){
      return Object.freeze({
        provider:"openai",
        model:model??null,
        turns,
        maxTurns:turnLimit,
        historyMessages:history.length,
        historyChars:JSON.stringify(history).length,
        estimatedSpentUsd:round(spentUsd),
        sessionBudgetUsd:round(budget),
        estimatedRemainingUsd:round(Math.max(0,budget-spentUsd)),
        persistence:"memory-only",
        toolsAuthorized:false,
        coreMutationAuthorized:false
      });
    },
    clear(){
      history=[];
      return this.status;
    },
    async ask(message){
      if(turns>=turnLimit){
        const error=new Error("ARCA chat session turn limit reached");
        error.code="ARCA_TERMUX_CHAT_TURN_LIMIT";
        throw error;
      }
      const current=text(message,"chat message",8000);
      const {compact,prompt}=boundedPrompt(history,current,historyLimit,15000);
      const remaining=Math.max(0,budget-spentUsd);
      if(remaining<=0){
        const error=new Error("ARCA chat session budget exhausted");
        error.code="ARCA_TERMUX_CHAT_BUDGET_EXHAUSTED";
        throw error;
      }
      const result=await runOpenAITermuxAsk({
        message:prompt,
        apiKey,
        ...(model?{model}:{}),
        allowExternal,
        allowPaidApi,
        maxRequestUsd:remaining,
        fetchImpl,
        timeoutMs,
        maxOutputTokens,
        now
      });
      const accounted=Number(result.cost?.accountedUsd??result.cost?.conservativeMaxUsd??0);
      spentUsd+=Number.isFinite(accounted)?accounted:0;
      turns+=1;
      history=trimHistory([
        ...compact,
        {role:"user",content:current},
        {role:"assistant",content:result.text}
      ],historyLimit);
      return Object.freeze({
        ...result,
        provider:"openai",
        chat:Object.freeze({
          turn:turns,
          sessionBudgetUsd:round(budget),
          estimatedSpentUsd:round(spentUsd),
          estimatedRemainingUsd:round(Math.max(0,budget-spentUsd)),
          historyMessages:history.length,
          persistence:"memory-only"
        })
      });
    }
  });
}
