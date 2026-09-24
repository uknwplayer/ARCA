export const ARCA_OPENAI_PROVIDER_ID="openai-responses";
export const ARCA_OPENAI_DEFAULT_MODEL="gpt-6-luna";
export const ARCA_OPENAI_API_ORIGIN="https://api.openai.com";
export const ARCA_OPENAI_PROVIDER_RESULT_FORMAT="arca-openai-provider-result-v1";

const MODEL=/^[A-Za-z0-9._:-]{1,160}$/;
const MAX_RESPONSE_BYTES=2*1024*1024;
const MAX_PROMPT_CHARS=64000;

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
  const model=bounded(value??ARCA_OPENAI_DEFAULT_MODEL,"OpenAI model",160);
  if(!MODEL.test(model))throw new TypeError("invalid OpenAI model id");
  return model;
}
async function readJson(response,maxBytes){
  const length=Number(response.headers?.get?.("content-length")??0);
  if(Number.isFinite(length)&&length>maxBytes)throw new RangeError("OpenAI response too large");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw new RangeError("OpenAI response too large");
  if(!bytes.byteLength)return null;
  return JSON.parse(new TextDecoder().decode(bytes));
}
function extractText(body){
  if(typeof body?.output_text==="string"&&body.output_text.trim())return body.output_text.trim();
  if(!Array.isArray(body?.output))return "";
  const pieces=[];
  for(const item of body.output){
    if(item?.type!=="message"||!Array.isArray(item?.content))continue;
    for(const part of item.content){
      if(part?.type==="output_text"&&typeof part?.text==="string")pieces.push(part.text);
    }
  }
  return pieces.join("").trim();
}
function usage(body){
  const source=body?.usage;
  if(!plain(source))return null;
  const out={};
  for(const key of ["input_tokens","output_tokens","total_tokens"]){
    if(Number.isFinite(Number(source[key])))out[key]=Number(source[key]);
  }
  const cached=source?.input_tokens_details?.cached_tokens;
  if(Number.isFinite(Number(cached)))out.cached_input_tokens=Number(cached);
  return Object.keys(out).length?Object.freeze(out):null;
}
function providerError(status,body){
  const providerType=typeof body?.error?.type==="string"?body.error.type:null;
  const providerCode=typeof body?.error?.code==="string"?body.error.code:null;
  const error=new Error("OpenAI provider request failed"+(providerCode?": "+providerCode:"")+" (HTTP "+status+")");
  error.code="ARCA_OPENAI_PROVIDER_HTTP_ERROR";
  error.httpStatus=status;
  error.providerType=providerType;
  error.providerCode=providerCode;
  return error;
}

export function createOpenAIProviderClient({
  apiKey,
  model=ARCA_OPENAI_DEFAULT_MODEL,
  fetchImpl=globalThis.fetch,
  timeoutMs=30000,
  maxResponseBytes=MAX_RESPONSE_BYTES,
  maxOutputTokens=1200
}={}){
  const secret=bounded(apiKey,"OpenAI API key",4096);
  const selectedModel=normalizeModel(model);
  if(typeof fetchImpl!=="function")throw new TypeError("fetch unavailable");
  const timeout=int(timeoutMs,{label:"OpenAI timeoutMs",min:1000,max:120000});
  const responseLimit=int(maxResponseBytes,{label:"OpenAI maxResponseBytes",min:1024,max:MAX_RESPONSE_BYTES});
  const outputLimit=int(maxOutputTokens,{label:"OpenAI maxOutputTokens",min:16,max:32768});
  const endpoint=ARCA_OPENAI_API_ORIGIN+"/v1/responses";

  return Object.freeze({
    provider:ARCA_OPENAI_PROVIDER_ID,
    model:selectedModel,
    endpointOrigin:ARCA_OPENAI_API_ORIGIN,
    async generateText({prompt,instructions=null}={}){
      const text=bounded(prompt,"OpenAI prompt",MAX_PROMPT_CHARS);
      const system=instructions==null?null:bounded(instructions,"OpenAI instructions",12000);
      const response=await fetchImpl(endpoint,{
        method:"POST",
        redirect:"manual",
        headers:{
          Accept:"application/json",
          "Content-Type":"application/json",
          Authorization:"Bearer "+secret
        },
        body:JSON.stringify({
          model:selectedModel,
          input:text,
          max_output_tokens:outputLimit,
          store:false,
          ...(system?{instructions:system}:{})
        }),
        signal:AbortSignal.timeout(timeout)
      });
      if(response.status>=300&&response.status<400){
        const error=new Error("OpenAI redirect refused");
        error.code="ARCA_OPENAI_PROVIDER_REDIRECT_REFUSED";
        throw error;
      }
      const body=await readJson(response,responseLimit);
      if(!response.ok)throw providerError(response.status,body);
      const output=extractText(body);
      if(!output){
        const error=new Error("OpenAI returned no output text");
        error.code="ARCA_OPENAI_PROVIDER_EMPTY_OUTPUT";
        error.responseStatus=typeof body?.status==="string"?body.status:null;
        error.usage=usage(body);
        throw error;
      }
      return Object.freeze({
        format:ARCA_OPENAI_PROVIDER_RESULT_FORMAT,
        version:1,
        provider:ARCA_OPENAI_PROVIDER_ID,
        model:selectedModel,
        responseId:typeof body?.id==="string"?body.id:null,
        responseStatus:typeof body?.status==="string"?body.status:null,
        text:output,
        usage:usage(body)
      });
    }
  });
}
