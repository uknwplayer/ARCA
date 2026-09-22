import {createHash} from "node:crypto";

export const PORTAL_RELATED_DOCUMENTS_ORIGIN="https://api.portaldatransparencia.gov.br";
export const PORTAL_RELATED_DOCUMENTS_PATH="/api-de-dados/despesas/documentos-relacionados";
const MAX_RESPONSE_BYTES=65536;
const MAX_API_KEY_LENGTH=4096;

function sha256(bytes){
  return createHash("sha256").update(bytes).digest("hex");
}

function exactOptions(options){
  const allowed=["fetchImpl","apiKey","timeoutMs","maxBytes"];
  if(!options||typeof options!=="object"||Array.isArray(options)||
     Object.keys(options).some(key=>!allowed.includes(key)))
    throw new Error("ARCA_PORTAL_TRANSPORT_UNEXPECTED_OPTION");
}

function validateApiKey(value){
  if(typeof value!=="string"||value.length<20||value.length>MAX_API_KEY_LENGTH||
     value.trim()!==value||/[\s\u0000-\u001f\u007f]/u.test(value))
    throw new Error("ARCA_PORTAL_TRANSPORT_API_KEY_INVALID");
  return value;
}

function validateDocumentCode(value){
  if(typeof value!=="string"||value.length<1||value.length>80||
     value.trim()!==value||/[\s\u0000-\u001f\u007f]/u.test(value))
    throw new Error("ARCA_PORTAL_TRANSPORT_DOCUMENT_CODE_INVALID");
  return value;
}

function statusError(status){
  if(status===400)return "ARCA_PORTAL_HTTP_BAD_REQUEST";
  if(status===401)return "ARCA_PORTAL_HTTP_UNAUTHORIZED";
  if(status===429)return "ARCA_PORTAL_HTTP_RATE_LIMITED";
  if(status>=500&&status<=599)return "ARCA_PORTAL_HTTP_SERVER_ERROR";
  return "ARCA_PORTAL_HTTP_ERROR";
}

function jsonContentType(response){
  const header=response?.headers?.get?.("content-type");
  if(typeof header!=="string")return null;
  const mediaType=header.split(";",1)[0].trim().toLowerCase();
  return mediaType==="application/json"?header:null;
}

export function createPortalRelatedDocumentsTransport(options={}){
  exactOptions(options);
  const fetchImpl=options.fetchImpl??globalThis.fetch;
  if(typeof fetchImpl!=="function")throw new Error("ARCA_PORTAL_TRANSPORT_FETCH_UNAVAILABLE");
  const apiKey=validateApiKey(options.apiKey);
  const timeoutMs=options.timeoutMs??30000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
    throw new Error("ARCA_PORTAL_TRANSPORT_TIMEOUT_INVALID");
  const maxBytes=options.maxBytes??MAX_RESPONSE_BYTES;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_RESPONSE_BYTES)
    throw new Error("ARCA_PORTAL_TRANSPORT_BYTE_BUDGET_INVALID");

  let requestStarted=false;
  return Object.freeze({
    async fetchRelatedDocuments({documentCode}={}){
      const code=validateDocumentCode(documentCode);
      if(requestStarted)throw new Error("ARCA_PORTAL_TRANSPORT_REQUEST_BUDGET_EXCEEDED");
      requestStarted=true;

      const url=new URL(PORTAL_RELATED_DOCUMENTS_PATH,PORTAL_RELATED_DOCUMENTS_ORIGIN);
      url.searchParams.set("codigoDocumento",code);
      url.searchParams.set("fase","3");
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        let response;
        try{
          response=await fetchImpl(url.toString(),{
            method:"GET",
            headers:{accept:"application/json","chave-api-dados":apiKey},
            redirect:"error",
            signal:controller.signal
          });
        }catch{
          if(controller.signal.aborted)throw new Error("ARCA_PORTAL_TRANSPORT_TIMEOUT");
          throw new Error("ARCA_PORTAL_TRANSPORT_NETWORK_ERROR");
        }

        if(Number.isInteger(response?.status)&&response.status>=300&&response.status<400)
          throw new Error("ARCA_PORTAL_TRANSPORT_REDIRECT_FORBIDDEN");
        if(!Number.isInteger(response?.status)||response.status<100||response.status>599)
          throw new Error("ARCA_PORTAL_TRANSPORT_RESPONSE_INVALID");
        if(!response.ok)throw new Error(statusError(response.status));
        const contentType=jsonContentType(response);
        if(!contentType)throw new Error("ARCA_PORTAL_TRANSPORT_CONTENT_TYPE_INVALID");
        const reader=response.body?.getReader?.();
        if(!reader)throw new Error("ARCA_PORTAL_TRANSPORT_BODY_UNAVAILABLE");

        const contentLength=response.headers?.get?.("content-length");
        if(typeof contentLength==="string"&&/^\d+$/.test(contentLength)&&Number(contentLength)>maxBytes){
          controller.abort();
          await reader.cancel().catch(()=>{});
          throw new Error("ARCA_PORTAL_RESPONSE_TOO_LARGE");
        }

        const chunks=[];
        const hash=createHash("sha256");
        let total=0;
        try{
          while(true){
            const {done,value}=await reader.read();
            if(controller.signal.aborted)throw new Error("ARCA_PORTAL_TRANSPORT_TIMEOUT");
            if(done)break;
            if(!(value instanceof Uint8Array))throw new Error("ARCA_PORTAL_TRANSPORT_CHUNK_INVALID");
            total+=value.byteLength;
            if(total>maxBytes){
              controller.abort();
              await reader.cancel().catch(()=>{});
              throw new Error("ARCA_PORTAL_RESPONSE_TOO_LARGE");
            }
            const chunk=Buffer.from(value);
            chunks.push(chunk);
            hash.update(chunk);
          }
        }catch(error){
          if(error?.message==="ARCA_PORTAL_RESPONSE_TOO_LARGE"||
             error?.message==="ARCA_PORTAL_TRANSPORT_CHUNK_INVALID"||
             error?.message==="ARCA_PORTAL_TRANSPORT_TIMEOUT")throw error;
          if(controller.signal.aborted)throw new Error("ARCA_PORTAL_TRANSPORT_TIMEOUT");
          throw new Error("ARCA_PORTAL_TRANSPORT_BODY_READ_FAILED");
        }
        if(controller.signal.aborted)throw new Error("ARCA_PORTAL_TRANSPORT_TIMEOUT");
        const bodyBytes=Buffer.concat(chunks,total);
        return Object.freeze({
          status:response.status,
          contentType,
          bodyBytes,
          responseBytesSha256:hash.digest("hex")
        });
      }finally{
        clearTimeout(timeout);
      }
    }
  });
}
