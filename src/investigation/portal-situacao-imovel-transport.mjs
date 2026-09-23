import {createHash} from "node:crypto";
import {PORTAL_SITUACAO_IMOVEL_PATH} from "./portal-situacao-imovel-scope.mjs";

export const PORTAL_API_ORIGIN="https://api.portaldatransparencia.gov.br";

function apiKey(value){
  if(typeof value!=="string"||value.length<20||value.length>4096||
     value.trim()!==value||/[\s\u0000-\u001f\u007f]/u.test(value))
    throw new Error("ARCA_PORTAL_SI_API_KEY_INVALID");
  return value;
}
function statusError(status){
  if(status===400)return "ARCA_PORTAL_HTTP_BAD_REQUEST";
  if(status===401)return "ARCA_PORTAL_HTTP_UNAUTHORIZED";
  if(status===403)return "ARCA_PORTAL_HTTP_FORBIDDEN";
  if(status===429)return "ARCA_PORTAL_HTTP_RATE_LIMITED";
  if(status>=500&&status<=599)return "ARCA_PORTAL_HTTP_SERVER_ERROR";
  return "ARCA_PORTAL_HTTP_ERROR";
}

export function createPortalSituacaoImovelTransport({
  fetchImpl=globalThis.fetch,apiKey:rawKey,timeoutMs=30000,maxBytes=32768
}={}){
  if(typeof fetchImpl!=="function")throw new Error("ARCA_PORTAL_SI_FETCH_UNAVAILABLE");
  const key=apiKey(rawKey);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
    throw new Error("ARCA_PORTAL_SI_TIMEOUT_INVALID");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32768)
    throw new Error("ARCA_PORTAL_SI_MAX_BYTES_INVALID");
  let requestStarted=false;
  return Object.freeze({
    async fetchOnce(){
      if(requestStarted)throw new Error("ARCA_PORTAL_SI_REQUEST_BUDGET_EXCEEDED");
      requestStarted=true;
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        let response;
        try{
          response=await fetchImpl(new URL(PORTAL_SITUACAO_IMOVEL_PATH,PORTAL_API_ORIGIN).toString(),{
            method:"GET",
            headers:{accept:"application/json","chave-api-dados":key},
            redirect:"error",
            signal:controller.signal
          });
        }catch{
          if(controller.signal.aborted)throw new Error("ARCA_PORTAL_SI_TIMEOUT");
          throw new Error("ARCA_PORTAL_SI_NETWORK_ERROR");
        }
        if(Number.isInteger(response?.status)&&response.status>=300&&response.status<400)
          throw new Error("ARCA_PORTAL_SI_REDIRECT_FORBIDDEN");
        if(!Number.isInteger(response?.status)||response.status<100||response.status>599)
          throw new Error("ARCA_PORTAL_SI_RESPONSE_INVALID");
        const reader=response.body?.getReader?.();
        if(!reader)throw new Error("ARCA_PORTAL_SI_BODY_UNAVAILABLE");
        const chunks=[]; let total=0; const hash=createHash("sha256");
        while(true){
          const {done,value}=await reader.read();
          if(done)break;
          if(!(value instanceof Uint8Array))throw new Error("ARCA_PORTAL_SI_CHUNK_INVALID");
          total+=value.byteLength;
          if(total>maxBytes){
            controller.abort();
            await reader.cancel().catch(()=>{});
            throw new Error("ARCA_PORTAL_SI_RESPONSE_TOO_LARGE");
          }
          const chunk=Buffer.from(value); chunks.push(chunk); hash.update(chunk);
        }
        const bodyBytes=Buffer.concat(chunks,total);
        return Object.freeze({
          status:response.status,
          ok:response.ok,
          contentType:response.headers?.get?.("content-type")??null,
          bodyBytes,
          responseBytesSha256:hash.digest("hex"),
          ...(response.ok?{}:{httpErrorCode:statusError(response.status)})
        });
      }finally{clearTimeout(timeout)}
    }
  });
}
