import http from "node:http";
import {createGeminiAapRuntime} from "../packages/agent/src/gemini-aap-runtime.ts";

const apiKey=process.env.ARCA_GEMINI_API_KEY??process.env.GEMINI_API_KEY;
if(!apiKey)throw new Error("ARCA_GEMINI_API_KEY or GEMINI_API_KEY is required");

const runtime=createGeminiAapRuntime({
  id:process.env.ARCA_GEMINI_AGENT_ID??"gemini-aap",
  model:process.env.ARCA_GEMINI_MODEL??undefined,
  apiKey,
  syntheticOnly:process.env.ARCA_GEMINI_ALLOW_NON_SYNTHETIC!=="true",
  maxOutputTokens:Number(process.env.ARCA_GEMINI_MAX_OUTPUT_TOKENS??1024),
  thinkingLevel:process.env.ARCA_GEMINI_THINKING_LEVEL??"low"
});

function json(response,status,value){
  const body=JSON.stringify(value);
  response.writeHead(status,{"content-type":"application/json","content-length":Buffer.byteLength(body)});
  response.end(body);
}
async function parseBody(request){
  const chunks=[];
  let bytes=0;
  for await(const chunk of request){
    bytes+=chunk.length;
    if(bytes>256*1024)throw new RangeError("AAP request too large");
    chunks.push(chunk);
  }
  return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):null;
}
const server=http.createServer(async(request,response)=>{
  try{
    if(request.method==="GET"&&request.url==="/arca/agent"){
      json(response,200,runtime.descriptor);
      return;
    }
    if(request.method==="GET"&&request.url==="/health"){
      json(response,200,{ok:true,agentId:runtime.descriptor.id,provider:runtime.descriptor.provider,syntheticOnly:runtime.syntheticOnly});
      return;
    }
    if(request.method==="POST"&&request.url==="/arca/jobs"){
      json(response,200,await runtime.runTask(await parseBody(request)));
      return;
    }
    json(response,404,{error:"not-found"});
  }catch(error){
    const diagnostic={
      event:"gemini-aap-error",
      error:error?.code??"ARCA_GEMINI_AAP_ERROR",
      httpStatus:Number.isSafeInteger(error?.httpStatus)?error.httpStatus:null,
      providerStatus:typeof error?.providerStatus==="string"?error.providerStatus:null,
      finishReason:typeof error?.finishReason==="string"?error.finishReason:null,
      totalTokenCount:Number.isFinite(Number(error?.usage?.totalTokenCount))?Number(error.usage.totalTokenCount):null,
      thoughtsTokenCount:Number.isFinite(Number(error?.usage?.thoughtsTokenCount))?Number(error.usage.thoughtsTokenCount):null
    };
    process.stderr.write("[ARCA_GEMINI_DIAGNOSTIC] "+JSON.stringify(diagnostic)+"\n");
    json(response,error?.code==="ARCA_GEMINI_SYNTHETIC_ONLY"?400:502,diagnostic);
  }
});

server.listen(Number(process.env.PORT??0),"127.0.0.1",()=>{
  const address=server.address();
  process.stdout.write(JSON.stringify({
    ready:true,
    agentId:runtime.descriptor.id,
    provider:runtime.descriptor.provider,
    port:address.port,
    syntheticOnly:runtime.syntheticOnly
  })+"\n");
});

function shutdown(){
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(1),2000).unref();
}
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
