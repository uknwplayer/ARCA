import {createHash} from "node:crypto";
import {M5_N1_PLAN_SCHEMA} from "./m5-n1-pncp-item-discovery-plan.mjs";

export const M5_N1_ORIGIN="https://pncp.gov.br";
const hash=b=>createHash("sha256").update(b).digest("hex");

function validTarget(t){
  const keys=t?.query&&typeof t.query==="object"&&!Array.isArray(t.query)?Object.keys(t.query).sort():[];
  if(t?.method!=="GET"||
     typeof t?.path!=="string"||
     !/^\/api\/pncp\/v1\/orgaos\/\d{14}\/compras\/\d{4}\/\d{1,9}\/itens$/.test(t.path)||
     JSON.stringify(keys)!==JSON.stringify(["pagina","tamanhoPagina"])||
     t.query.pagina!==1||t.query.tamanhoPagina!==10||
     !/^[a-f0-9]{64}$/.test(t.targetSha256??""))
    throw new Error("ARCA_M5_N1_TARGET_INVALID");
}
function cls(s){return Number.isSafeInteger(s)&&s>=100&&s<=599?`${Math.floor(s/100)}xx`:"INVALID"}

export function createM5N1ItemDiscoveryTransport({
  fetchImpl=globalThis.fetch,timeoutMs=30000,maxBytesPerResponse=524288,maxRequests=2
}={}){
  if(typeof fetchImpl!=="function")throw new Error("ARCA_M5_N1_FETCH_UNAVAILABLE");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error("ARCA_M5_N1_TIMEOUT_INVALID");
  if(!Number.isSafeInteger(maxBytesPerResponse)||maxBytesPerResponse<1||maxBytesPerResponse>524288)
    throw new Error("ARCA_M5_N1_MAX_BYTES_INVALID");
  if(maxRequests!==2)throw new Error("ARCA_M5_N1_REQUEST_BUDGET_INVALID");
  let used=0;
  async function one(t){
    validTarget(t);
    if(used>=2)throw new Error("ARCA_M5_N1_REQUEST_BUDGET_EXCEEDED");
    used+=1;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      let response;
      try{
        const url=new URL(t.path,M5_N1_ORIGIN);
        url.searchParams.set("pagina","1");
        url.searchParams.set("tamanhoPagina","10");
        response=await fetchImpl(url.toString(),{
          method:"GET",headers:{accept:"application/json"},redirect:"error",signal:controller.signal
        });
      }catch{
        if(controller.signal.aborted)throw new Error("ARCA_M5_N1_TIMEOUT");
        throw new Error("ARCA_M5_N1_NETWORK_ERROR");
      }
      if(!Number.isSafeInteger(response?.status)||response.status<100||response.status>599)
        throw new Error("ARCA_M5_N1_RESPONSE_INVALID");
      if(response.status>=300&&response.status<400)throw new Error("ARCA_M5_N1_REDIRECT_FORBIDDEN");
      const reader=response.body?.getReader?.();if(!reader)throw new Error("ARCA_M5_N1_BODY_UNAVAILABLE");
      const chunks=[];let total=0;
      while(true){
        const {done,value}=await reader.read();if(done)break;
        if(!(value instanceof Uint8Array))throw new Error("ARCA_M5_N1_CHUNK_INVALID");
        total+=value.byteLength;
        if(total>maxBytesPerResponse){controller.abort();await reader.cancel().catch(()=>{});throw new Error("ARCA_M5_N1_RESPONSE_TOO_LARGE")}
        chunks.push(Buffer.from(value));
      }
      const bodyBytes=Buffer.concat(chunks,total);
      return Object.freeze({
        targetSha256:t.targetSha256,status:response.status,statusClass:cls(response.status),ok:response.ok,
        contentType:response.headers?.get?.("content-type")??null,
        responseByteCount:bodyBytes.length,responseBytesSha256:hash(bodyBytes),bodyBytes
      });
    }finally{clearTimeout(timer)}
  }
  return Object.freeze({
    async executePlan(plan){
      if(plan?.schema!==M5_N1_PLAN_SCHEMA||plan.targetCount!==2||plan.targets?.length!==2||
         plan.budgets?.maxRequests!==2||plan.budgets?.retries!==0)
        throw new Error("ARCA_M5_N1_PLAN_NOT_EXECUTABLE");
      const results=[];for(const t of plan.targets)results.push(await one(t));
      return Object.freeze({requestCount:used,results:Object.freeze(results)});
    }
  });
}
