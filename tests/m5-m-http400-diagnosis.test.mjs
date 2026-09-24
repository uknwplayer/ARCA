import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  diagnoseM5MHttp400Body,
  summarizeM5MHttp400Diagnosis
} from "../src/investigation/m5-m-http400-diagnosis.mjs";
import {createM5MCustodyReader} from "../src/investigation/m5-m-custody-reader.mjs";

const h=b=>createHash("sha256").update(b).digest("hex");

test("M5-M diagnóstico classifica erro de parâmetro sem expor mensagem",()=>{
  const body=Buffer.from(JSON.stringify({
    timestamp:"2026-09-24T17:00:00Z",
    status:400,
    error:"Bad Request",
    message:"Parametro sequencialContratacao invalido",
    path:"/api/pncp/v1/orgaos/12345678000199/contratos/contratacao/2026/1"
  }));
  const d=diagnoseM5MHttp400Body({
    bytes:body,expectedResponseSha256:h(body),targetSha256:"a".repeat(64)
  });
  assert.equal(d.jsonKind,"OBJECT");
  assert.equal(d.numericStatus,400);
  assert.equal(d.diagnosis,"PATH_PARAMETER_VALIDATION_ERROR");
  assert.equal(d.rawBodyIncluded,false);
  const message=d.stringFields.find(x=>x.key==="message");
  assert.ok(message);
  assert.equal(Object.hasOwn(message,"value"),false);
  const p=d.stringFields.find(x=>x.key==="path");
  assert.equal(p.expectedPathShape,true);
});

test("M5-M diagnóstico preserva 400 genérico sem inventar causa",()=>{
  const body=Buffer.from(JSON.stringify({status:400,error:"Bad Request",path:"/api/pncp/v1/orgaos/12345678000199/contratos/contratacao/2026/1"}));
  const d=diagnoseM5MHttp400Body({
    bytes:body,expectedResponseSha256:h(body),targetSha256:"b".repeat(64)
  });
  assert.equal(d.diagnosis,"GENERIC_HTTP_400_NO_SAFE_DETAIL");
  assert.equal(d.stringFields.find(x=>x.key==="error").allowlistedValue,"Bad Request");
});

test("M5-M resumo prova zero request de fonte e zero correlação",()=>{
  const mk=(id)=>{
    const body=Buffer.from(JSON.stringify({status:400,error:"Bad Request"}));
    return diagnoseM5MHttp400Body({bytes:body,expectedResponseSha256:h(body),targetSha256:id.repeat(64)});
  };
  const s=summarizeM5MHttp400Diagnosis({items:[mk("a"),mk("b")]});
  assert.equal(s.sourceRequestCount,0);
  assert.equal(s.sourceNetworkUsed,false);
  assert.equal(s.publicationAttempted,false);
  assert.equal(s.correlationAttempted,false);
  assert.equal(s.rawBodiesIncluded,false);
  assert.match(s.diagnosisSha256,/^[a-f0-9]{64}$/);
});

test("M5-M custody reader aceita somente path custody content-addressed exato",async()=>{
  const envelope={schema:"arca.encrypted-custody-envelope.v0.1",status:"SEALED",plaintextIncluded:false};
  const expected=h(JSON.stringify(envelope));
  const calls=[];
  const fetchImpl=async(url)=>{
    calls.push(url);
    if(calls.length===1)return new Response(JSON.stringify({private:true,archived:false}),{status:200});
    return new Response(JSON.stringify({
      type:"file",encoding:"base64",
      content:Buffer.from(JSON.stringify(envelope)).toString("base64")
    }),{status:200});
  };
  const reader=createM5MCustodyReader({
    repository:"owner/private-vault",targetBranch:"main",
    githubToken:"x".repeat(24),fetchImpl
  });
  const out=await reader.readExactEnvelope({
    path:`custody/${expected.slice(0,2)}/${expected}.envelope.json`,
    expectedEnvelopeSha256:expected
  });
  assert.equal(out.envelopeSha256,expected);
  await assert.rejects(()=>reader.readExactEnvelope({
    path:"derived/m5-h/aa/"+"a".repeat(64)+".envelope.json",
    expectedEnvelopeSha256:"a".repeat(64)
  }),/PATH_OR_HASH_INVALID/);
});
