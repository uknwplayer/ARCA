export const ARCA_GEMINI_PROVIDER_ID="google-gemini";
export const ARCA_GEMINI_DEFAULT_MODEL="gemini-3.8-flash";
export const ARCA_GEMINI_API_ORIGIN="https://generativelanguage.googleapis.com";
export const ARCA_GEMINI_PROVIDER_RESULT_FORMAT="arca-gemini-provider-result-v1";

const MODEL=/^[A-Za-z0-9._-]{1,120}$/;
const MAX_RESPONSE_BYTES=2*1024*1024;
const MAX_PROMPT_CHARS=32000;
const THINKING_LEVELS=new Set(["minimal","low","medium","high"]);

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function bounded(value,label,max){
  const text=String(value??"").trim();
  if(!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function int(value,{label,min,max}){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new RangeError("invalid "+label);
  return n;
}
function normalizeModel(value){
  const model=bounded(value??ARCA_GEMINI_DEFAULT_MODEL,"Gemini model",120);
  if(!MODEL.test(model))throw new TypeError("invalid Gemini model id");
  return model;
}
function normalizeThinkingLevel(value){
  if(value===null||value===false)return null;
  const level=bounded(value??"low","Gemini thinkingLevel",16).toLowerCase();
  if(!THINKING_LEVELS.has(level))throw new TypeError("invalid Gemini thinkingLevel");
  return level;
}
async function readJson(response,maxBytes){
  const length=Number(response.headers?.get?.("content-length")??0);
  if(Number.isFinite(length)&&length>maxBytes)throw new RangeError("Gemini response too large");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw new RangeError("Gemini response too large");
  if(!bytes.byteLength)return null;
  return JSON.parse(new TextDecoder().decode(bytes));
}
function extractText(body){
  const parts=body?.candidates?.[0]?.content?.parts;
  if(!Array.isArray(parts))return "";
  return parts.map(part=>typeof part?.text==="string"?part.text:"").join("").trim();
}
function usage(body){
  const source=body?.usageMetadata;
  if(!plain(source))return null;
  const out={};
  for(const key of ["promptTokenCount","candidatesTokenCount","totalTokenCount","thoughtsTokenCount"]){
    if(Number.isFinite(Number(source[key])))out[key]=Number(source[key]);
  }
  return Object.keys(out).length?Object.freeze(out):null;
}
function providerError(status,body){
  const providerStatus=typeof body?.error?.status==="string"?body.error.status:null;
  const error=new Error("Gemini provider request failed"+(providerStatus?": "+providerStatus:"")+" (HTTP "+status+")");
  error.code="ARCA_GEMINI_PROVIDER_HTTP_ERROR";
  error.httpStatus=status;
  error.providerStatus=providerStatus;
  return error;
}

export function createGeminiProviderClient({
  apiKey,
  model=ARCA_GEMINI_DEFAULT_MODEL,
  fetchImpl=globalThis.fetch,
  timeoutMs=30000,
  maxResponseBytes=MAX_RESPONSE_BYTES,
  maxOutputTokens=1024,
  thinkingLevel="low"
}={}){
  const secret=bounded(apiKey,"Gemini API key",4096);
  const selectedModel=normalizeModel(model);
  if(typeof fetchImpl!=="function")throw new TypeError("fetch unavailable");
  const timeout=int(timeoutMs,{label:"Gemini timeoutMs",min:1000,max:120000});
  const responseLimit=int(maxResponseBytes,{label:"Gemini maxResponseBytes",min:1024,max:MAX_RESPONSE_BYTES});
  const outputLimit=int(maxOutputTokens,{label:"Gemini maxOutputTokens",min:16,max:8192});
  const selectedThinkingLevel=normalizeThinkingLevel(thinkingLevel);
  const endpoint=ARCA_GEMINI_API_ORIGIN+"/v1beta/models/"+encodeURIComponent(selectedModel)+":generateContent";

  return Object.freeze({
    provider:ARCA_GEMINI_PROVIDER_ID,
    model:selectedModel,
    endpointOrigin:ARCA_GEMINI_API_ORIGIN,
    async generateText({prompt}={}){
      const text=bounded(prompt,"Gemini prompt",MAX_PROMPT_CHARS);
      const response=await fetchImpl(endpoint,{
        method:"POST",
        redirect:"manual",
        headers:{
          Accept:"application/json",
          "Content-Type":"application/json",
          "x-goog-api-key":secret
        },
        body:JSON.stringify({
          contents:[{role:"user",parts:[{text}]}],
          generationConfig:{
            maxOutputTokens:outputLimit,
            ...(selectedThinkingLevel?{thinkingConfig:{thinkingLevel:selectedThinkingLevel}}:{})
          }
        }),
        signal:AbortSignal.timeout(timeout)
      });
      if(response.status>=300&&response.status<400){
        const error=new Error("Gemini redirect refused");
        error.code="ARCA_GEMINI_PROVIDER_REDIRECT_REFUSED";
        throw error;
      }
      const body=await readJson(response,responseLimit);
      if(!response.ok)throw providerError(response.status,body);
      const output=extractText(body);
      if(!output){
        const error=new Error("Gemini returned no text candidate");
        error.code="ARCA_GEMINI_PROVIDER_EMPTY_OUTPUT";
        error.finishReason=typeof body?.candidates?.[0]?.finishReason==="string"?body.candidates[0].finishReason:null;
        error.usage=usage(body);
        throw error;
      }
      return Object.freeze({
        format:ARCA_GEMINI_PROVIDER_RESULT_FORMAT,
        version:1,
        provider:ARCA_GEMINI_PROVIDER_ID,
        model:selectedModel,
        text:output,
        finishReason:typeof body?.candidates?.[0]?.finishReason==="string"?body.candidates[0].finishReason:null,
        usage:usage(body)
      });
    }
  });
}
