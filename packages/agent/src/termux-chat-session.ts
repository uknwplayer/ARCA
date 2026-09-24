import {runOpenAITermuxAsk} from "./openai-reasoning-bridge.ts";

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
  const historyLimit=Number(maxHistoryChars);
  const turnLimit=Number(maxTurns);
  if(!Number.isSafeInteger(historyLimit)||historyLimit<1000||historyLimit>50000)throw new RangeError("invalid maxHistoryChars");
  if(!Number.isSafeInteger(turnLimit)||turnLimit<1||turnLimit>200)throw new RangeError("invalid maxTurns");
  let history=[];
  let spentUsd=0;
  let turns=0;

  return Object.freeze({
    format:ARCA_TERMUX_CHAT_SESSION_FORMAT,
    get status(){
      return Object.freeze({
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
      let compact=trimHistory(history,historyLimit);
      let prompt=transcript(compact,current);
      while(compact.length&&prompt.length>15000){
        compact=compact.slice(1);
        prompt=transcript(compact,current);
      }
      if(prompt.length>15000){
        const error=new Error("ARCA chat prompt exceeds safe one-shot limit");
        error.code="ARCA_TERMUX_CHAT_PROMPT_LIMIT";
        throw error;
      }
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
