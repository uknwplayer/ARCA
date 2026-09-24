import {createHash} from "node:crypto";
import {
  M5_PNCP_CONTRACT_COVERAGE_PLAN_SCHEMA
} from "./m5-pncp-contract-coverage-plan.mjs";

export const M5_PNCP_CONTRACT_COVERAGE_ORIGIN="https://pncp.gov.br";

function sha256Bytes(bytes){
  return createHash("sha256").update(bytes).digest("hex");
}
function validTarget(target){
  if(target?.method!=="GET"||
     typeof target?.path!=="string"||
     !/^\/api\/pncp\/v1\/orgaos\/\d{14}\/contratos\/contratacao\/\d{4}\/\d{1,9}$/.test(target.path)||
     !/^[a-f0-9]{64}$/.test(target?.targetSha256??""))
    throw new Error("ARCA_M5_M_TARGET_INVALID");
}
function statusClass(status){
  return Number.isSafeInteger(status)&&status>=100&&status<=599
    ?`${Math.floor(status/100)}xx`:"INVALID";
}

export function createM5PncpContractCoverageTransport({
  fetchImpl=globalThis.fetch,
  timeoutMs=30000,
  maxBytesPerResponse=65536,
  maxRequests=2
}={}){
  if(typeof fetchImpl!=="function")throw new Error("ARCA_M5_M_FETCH_UNAVAILABLE");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
    throw new Error("ARCA_M5_M_TIMEOUT_INVALID");
  if(!Number.isSafeInteger(maxBytesPerResponse)||maxBytesPerResponse<1||maxBytesPerResponse>65536)
    throw new Error("ARCA_M5_M_MAX_BYTES_INVALID");
  if(maxRequests!==2)throw new Error("ARCA_M5_M_REQUEST_BUDGET_INVALID");

  let used=0;
  async function one(target){
    validTarget(target);
    if(used>=maxRequests)throw new Error("ARCA_M5_M_REQUEST_BUDGET_EXCEEDED");
    used+=1;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      let response;
      try{
        response=await fetchImpl(new URL(target.path,M5_PNCP_CONTRACT_COVERAGE_ORIGIN).toString(),{
          method:"GET",
          headers:{accept:"application/json"},
          redirect:"error",
          signal:controller.signal
        });
      }catch{
        if(controller.signal.aborted)throw new Error("ARCA_M5_M_TIMEOUT");
        throw new Error("ARCA_M5_M_NETWORK_ERROR");
      }
      if(!Number.isSafeInteger(response?.status)||response.status<100||response.status>599)
        throw new Error("ARCA_M5_M_RESPONSE_INVALID");
      if(response.status>=300&&response.status<400)
        throw new Error("ARCA_M5_M_REDIRECT_FORBIDDEN");
      const reader=response.body?.getReader?.();
      if(!reader)throw new Error("ARCA_M5_M_BODY_UNAVAILABLE");
      const chunks=[]; let total=0;
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array))throw new Error("ARCA_M5_M_CHUNK_INVALID");
        total+=value.byteLength;
        if(total>maxBytesPerResponse){
          controller.abort();
          await reader.cancel().catch(()=>{});
          throw new Error("ARCA_M5_M_RESPONSE_TOO_LARGE");
        }
        chunks.push(Buffer.from(value));
      }
      const bodyBytes=Buffer.concat(chunks,total);
      return Object.freeze({
        targetSha256:target.targetSha256,
        status:response.status,
        statusClass:statusClass(response.status),
        ok:response.ok,
        contentType:response.headers?.get?.("content-type")??null,
        responseByteCount:bodyBytes.byteLength,
        responseBytesSha256:sha256Bytes(bodyBytes),
        bodyBytes
      });
    }finally{
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    async executePlan(plan){
      if(!plan||plan.schema!==M5_PNCP_CONTRACT_COVERAGE_PLAN_SCHEMA||
         plan.targetCount!==2||
         plan.targets?.length!==2||
         plan.budgets?.maxRequests!==2||
         plan.budgets?.retries!==0)
        throw new Error("ARCA_M5_M_PLAN_NOT_EXECUTABLE");
      const results=[];
      for(const target of plan.targets)results.push(await one(target));
      return Object.freeze({
        requestCount:used,
        results:Object.freeze(results)
      });
    }
  });
}
