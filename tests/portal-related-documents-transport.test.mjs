import test from "node:test";
import assert from "node:assert/strict";
import {createPortalRelatedDocumentsTransport} from "../src/investigation/portal-related-documents-transport.mjs";

const apiKey="synthetic-portal-api-key-0123456789";
const documentCode="175004000012023NS000917";

function streamedResponse({status=200,contentType="application/json",chunks=[Buffer.from("[]")],holdOpen=false }={}){
  let index=0;
  let cancelled=false;
  const body=new ReadableStream({
    pull(controller){
      if(index<chunks.length){
        controller.enqueue(new Uint8Array(chunks[index++]));
        if(!holdOpen&&index===chunks.length)controller.close();
      }else if(!holdOpen)controller.close();
    },
    cancel(){cancelled=true}
  });
  return {
    status,
    ok:status>=200&&status<300,
    headers:new Headers({"content-type":contentType}),
    body,
    text(){throw new Error("UNBOUNDED_TEXT_READ_FORBIDDEN")},
    json(){throw new Error("UNBOUNDED_JSON_READ_FORBIDDEN")},
    wasCancelled(){return cancelled}
  };
}

test("Portal transport sends one exact related-documents request and returns original bytes",async()=>{
  const calls=[];
  const response=streamedResponse();
  const transport=createPortalRelatedDocumentsTransport({apiKey,fetchImpl:async(url,options)=>{
    calls.push({url:String(url),options});
    return response;
  }});
  const result=await transport.fetchRelatedDocuments({documentCode});
  const requestUrl=new URL(calls[0].url);
  assert.equal(requestUrl.origin,"https://api.portaldatransparencia.gov.br");
  assert.equal(requestUrl.pathname,"/api-de-dados/despesas/documentos-relacionados");
  assert.deepEqual([...requestUrl.searchParams.entries()],[["codigoDocumento",documentCode],["fase","3"]]);
  assert.equal(calls[0].options.method,"GET");
  assert.equal(calls[0].options.headers["chave-api-dados"],apiKey);
  assert.equal(calls[0].options.redirect,"error");
  assert.equal(calls[0].url.includes(apiKey),false);
  assert.equal(result.status,200);
  assert.equal(result.contentType,"application/json");
  assert.equal(result.bodyBytes.toString("utf8"),"[]");
  assert.equal(result.responseBytesSha256,"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
  assert.equal(calls.length,1);
});

test("Portal transport rejects missing or weak credentials and caller-selected routes before fetch",async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return streamedResponse()};
  assert.throws(()=>createPortalRelatedDocumentsTransport({fetchImpl}),/API_KEY/);
  assert.throws(()=>createPortalRelatedDocumentsTransport({apiKey:"short",fetchImpl}),/API_KEY/);
  assert.throws(()=>createPortalRelatedDocumentsTransport({apiKey,fetchImpl,origin:"https://example.invalid"}),/UNEXPECTED_OPTION/);
  assert.equal(calls,0);
});

test("Portal transport maps HTTP failures to fixed errors without leaking body or identifiers",async()=>{
  const response=streamedResponse({status:401,chunks:[Buffer.from(`${apiKey} ${documentCode}`)]});
  const transport=createPortalRelatedDocumentsTransport({apiKey,fetchImpl:async()=>response});
  await assert.rejects(()=>transport.fetchRelatedDocuments({documentCode}),error=>{
    assert.equal(error.message,"ARCA_PORTAL_HTTP_UNAUTHORIZED");
    assert.equal(error.message.includes(apiKey),false);
    assert.equal(error.message.includes(documentCode),false);
    return true;
  });
});

test("Portal transport refuses a second attempt and redirect responses",async()=>{
  let calls=0;
  const transport=createPortalRelatedDocumentsTransport({apiKey,fetchImpl:async()=>{
    calls++;
    return streamedResponse();
  }});
  await transport.fetchRelatedDocuments({documentCode});
  await assert.rejects(()=>transport.fetchRelatedDocuments({documentCode}),/REQUEST_BUDGET_EXCEEDED/);
  assert.equal(calls,1);

  const redirect=createPortalRelatedDocumentsTransport({apiKey,fetchImpl:async()=>streamedResponse({status:302})});
  await assert.rejects(()=>redirect.fetchRelatedDocuments({documentCode}),/REDIRECT_FORBIDDEN/);
});

test("Portal transport accepts exactly 65536 raw response bytes without parsing them",async()=>{
  const bytes=Buffer.alloc(65536,0x61);
  const transport=createPortalRelatedDocumentsTransport({apiKey,fetchImpl:async()=>streamedResponse({chunks:[bytes]})});
  const result=await transport.fetchRelatedDocuments({documentCode});
  assert.equal(result.bodyBytes.byteLength,65536);
  assert.equal(result.bodyBytes[0],0x61);
});

test("Portal transport cancels and aborts when streamed bytes exceed 65536",async()=>{
  const response=streamedResponse({chunks:[Buffer.alloc(65536,0x61),Buffer.from([0x62]),Buffer.from([0x63])],holdOpen:true});
  let options;
  const transport=createPortalRelatedDocumentsTransport({apiKey,fetchImpl:async(_url,requestOptions)=>{
    options=requestOptions;
    return response;
  }});
  await assert.rejects(()=>transport.fetchRelatedDocuments({documentCode}),error=>{
    assert.equal(error.message,"ARCA_PORTAL_RESPONSE_TOO_LARGE");
    return true;
  });
  assert.equal(options.signal.aborted,true);
  assert.equal(response.wasCancelled(),true);
});

test("Portal transport aborts at its configured timeout and never retries",async()=>{
  let calls=0;
  const transport=createPortalRelatedDocumentsTransport({apiKey,timeoutMs:5,fetchImpl:(_url,{signal})=>{
    calls++;
    return new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("synthetic timeout")),{once:true}));
  }});
  await assert.rejects(()=>transport.fetchRelatedDocuments({documentCode}),/TIMEOUT/);
  assert.equal(calls,1);
});
