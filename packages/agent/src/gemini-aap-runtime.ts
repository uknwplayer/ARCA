import {ARCA_AGENT_DESCRIPTOR_FORMAT,ARCA_AGENT_RESULT_FORMAT} from "./gateway.ts";
import {ARCA_GEMINI_PROVIDER_ID,createGeminiProviderClient} from "./gemini-provider.ts";

export const ARCA_GEMINI_AAP_RUNTIME_FORMAT="arca-gemini-aap-runtime-v1";

const ID=/^[A-Za-z0-9._-]{1,80}$/;
const MAX_TASK_CHARS=100000;
const MAX_CONTEXT_CHARS=16000;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function bounded(value,label,max){
  const text=String(value??"").trim();
  if(!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function normalizeId(value){
  const id=bounded(value??"gemini-aap","Gemini AAP agent id",80);
  if(!ID.test(id))throw new TypeError("invalid Gemini AAP agent id");
  return id;
}
function normalizeContext(value){
  if(value===undefined)return {};
  if(!plain(value))throw new TypeError("AAP task context must be object");
  const serialized=JSON.stringify(value);
  if(serialized.length>MAX_CONTEXT_CHARS)throw new RangeError("AAP task context too large");
  return JSON.parse(serialized);
}
function synthetic(context){return context?.synthetic===true||context?.arcaSynthetic===true}
function buildPrompt(task,context){
  const publicContext={...context};
  delete publicContext.synthetic;
  delete publicContext.arcaSynthetic;
  return [
    "ARCA synthetic validation request.",
    "Use only the supplied task and context.",
    "Do not claim access to private files, accounts, tools, or external systems.",
    "",
    "Task:",
    bounded(task,"AAP task",MAX_TASK_CHARS),
    "",
    "Context:",
    JSON.stringify(publicContext)
  ].join("\n");
}

export function createGeminiAapRuntime({
  id="gemini-aap",
  name="ARCA Gemini AAP Runtime",
  model,
  apiKey,
  providerClient=null,
  syntheticOnly=true,
  maxOutputTokens=1024,
  thinkingLevel="low",
  fetchImpl=globalThis.fetch
}={}){
  const runtimeId=normalizeId(id);
  const client=providerClient??createGeminiProviderClient({apiKey,model,maxOutputTokens,thinkingLevel,fetchImpl});
  if(typeof client?.generateText!=="function")throw new TypeError("Gemini provider client required");
  const descriptor=Object.freeze({
    format:ARCA_AGENT_DESCRIPTOR_FORMAT,
    id:runtimeId,
    name:bounded(name,"Gemini AAP name",160),
    provider:ARCA_GEMINI_PROVIDER_ID,
    capabilities:Object.freeze(["reasoning","research"])
  });
  return Object.freeze({
    format:ARCA_GEMINI_AAP_RUNTIME_FORMAT,
    version:1,
    descriptor,
    syntheticOnly:syntheticOnly!==false,
    async runTask(input){
      if(!plain(input))throw new TypeError("AAP task object required");
      const taskId=bounded(input.taskId,"AAP taskId",120);
      const context=normalizeContext(input.context);
      if(syntheticOnly!==false&&!synthetic(context)){
        const error=new Error("Gemini AAP v0.1 accepts synthetic tasks only");
        error.code="ARCA_GEMINI_SYNTHETIC_ONLY";
        throw error;
      }
      const generated=await client.generateText({prompt:buildPrompt(input.task,context)});
      return Object.freeze({
        format:ARCA_AGENT_RESULT_FORMAT,
        taskId,
        status:"completed",
        output:Object.freeze({
          requestId:String(context.requestId??taskId),
          status:"completed",
          provider:generated.provider,
          model:generated.model,
          text:generated.text,
          finishReason:generated.finishReason,
          usage:generated.usage
        }),
        humanReviewRequired:true
      });
    }
  });
}
