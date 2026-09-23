import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {mkdtemp,rm,mkdir} from "node:fs/promises";
import {buildDurableCustodyReceipt} from "../src/machine-bridge/durable-private-custody.mjs";
import {buildM4ControlledScopeV02} from "../src/investigation/m4-controlled-scope.mjs";
import {openCustodyEnvelope} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {runPortalRelatedDocumentsProbe} from "../scripts/arca-portal-related-documents-live-probe.mjs";

const documentCode="175004000012023NS000917";
const apiKey="synthetic-portal-api-key-0123456789";
const passphrase="synthetic custody passphrase with enough length";
const revision="a6e955b6282f319171654e881ae0d736ce5ed65a";
const sourceRepository="uknwplayer/ARCA";
const vaultRepository="uknwplayer/arca-private-vault";
const sha256=value=>createHash("sha256").update(value).digest("hex");
function stableStringify(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableStringify(value[key])).join(",")+"}";
}
function validEnv(overrides={}){
  const scope=buildM4ControlledScopeV02({source:"PORTAL",confirmation:"PORTAL_DOCUMENT_GET_ONLY",
    revision,documentCode,maxBytes:65536,timeoutMs:30000});
  return {
    ARCA_PORTAL_CONFIRMATION:"PORTAL_DOCUMENT_GET_ONLY",
    ARCA_PORTAL_DOCUMENT_CODE:documentCode,
    ARCA_PORTAL_API_KEY:apiKey,
    ARCA_PORTAL_TOKEN_PROVENANCE:"OFFICIAL_EMAIL_REGISTRATION",
    ARCA_PORTAL_TOKEN_RECEIVED_AT:"2026-09-23T11:00:00.000Z",
    ARCA_PORTAL_CUSTODY_PASSPHRASE:passphrase,
    ARCA_PORTAL_SCOPE_SHA256:scope.scopeSha256,
    ARCA_CUSTODY_VAULT_REPOSITORY:vaultRepository,
    ARCA_CUSTODY_VAULT_TOKEN:"synthetic-vault-token-0123456789",
    ARCA_CUSTODY_VAULT_BRANCH:"main",
    GITHUB_REPOSITORY:sourceRepository,
    GITHUB_SHA:revision,
    ...overrides
  };
}
function portalResponse(body,{status=200,contentType="application/json"}={}){
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(typeof body==="string"?body:JSON.stringify(body));
  return new Response(bytes,{status,headers:{"content-type":contentType}});
}
function fakeCustodyBackend({preflight={ready:true,private:true},failPersist=false,failStatus=false,badReceipt=false}={}){
  const calls=[];
  return {
    calls,
    async preflight(){calls.push({type:"preflight"});return preflight},
    async persist({envelope,proof}){
      calls.push({type:"persist",envelope,proof});
      if(failPersist)throw new Error("ARCA_DURABLE_CUSTODY_GITHUB_HTTP_500");
      const receipt=buildDurableCustodyReceipt({envelope,proof,vaultRepository});
      calls.at(-1).receipt=receipt;
      if(badReceipt)return {status:"STORED",receipt:{...receipt,receiptHash:"9".repeat(64)},
        receiptHash:receipt.receiptHash,envelopeHash:receipt.envelopeHash,
        captureProofHash:receipt.captureProofHash,vaultCommitSha:"d".repeat(40)};
      return {status:"STORED",receipt,receiptHash:receipt.receiptHash,
        envelopeHash:receipt.envelopeHash,captureProofHash:receipt.captureProofHash,vaultCommitSha:"d".repeat(40)};
    },
    async persistStatusProof({envelope,proof}){
      calls.push({type:"status",envelope,proof});
      if(failStatus)throw new Error("ARCA_DURABLE_CUSTODY_POST_WRITE_VERIFY_FAILED");
      return {status:"STORED_PRIVATE",proofHash:sha256(stableStringify(proof)),
        vaultCommitSha:"e".repeat(40)};
    }
  };
}
async function tempContext(t){
  const root=await mkdtemp(path.join(os.tmpdir(),"arca-portal-probe-test-"));
  const outputDir=path.join(root,"output");
  const temporaryParent=path.join(root,"temporary");
  await mkdir(outputDir,{recursive:true});
  await mkdir(temporaryParent,{recursive:true});
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,outputDir,temporaryParent};
}
function fetchSpy(body,{status=200,contentType="application/json"}={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),options});
    return portalResponse(body,{status,contentType});
  };
  return {calls,fetchImpl};
}

test("Portal probe refuses invalid authorization and private custody before a Portal request",async t=>{
  const context=await tempContext(t);
  for(const overrides of [
    {ARCA_PORTAL_CONFIRMATION:""},
    {ARCA_PORTAL_API_KEY:""},
    {ARCA_PORTAL_CUSTODY_PASSPHRASE:"short"},
    {ARCA_PORTAL_SCOPE_SHA256:"0".repeat(64)},
    {GITHUB_SHA:"not-a-revision"},
    {ARCA_PORTAL_TOKEN_PROVENANCE:""},
    {ARCA_PORTAL_TOKEN_PROVENANCE:"GOVBR_LOGIN"},
    {ARCA_PORTAL_TOKEN_RECEIVED_AT:""}
  ]){
    const spy=fetchSpy([]);
    await assert.rejects(()=>runPortalRelatedDocumentsProbe({
      env:validEnv(overrides),fetchImpl:spy.fetchImpl,durableCustodyBackend:fakeCustodyBackend(),
      outputDir:context.outputDir,temporaryParent:context.temporaryParent
    }));
    assert.equal(spy.calls.length,0);
  }
  const spy=fetchSpy([]);
  const notPrivate=fakeCustodyBackend({preflight:{ready:false,private:false}});
  await assert.rejects(()=>runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:notPrivate,
    outputDir:context.outputDir,temporaryParent:context.temporaryParent
  }),/PREFLIGHT/);
  assert.equal(spy.calls.length,0);
});

test("Portal probe preflight validates scope and private custody without creating a capture",async t=>{
  const context=await tempContext(t);
  const spy=fetchSpy([]);
  const backend=fakeCustodyBackend();
  const result=await runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
    outputDir:context.outputDir,temporaryParent:context.temporaryParent,preflightOnly:true
  });
  assert.equal(result.status,"PREFLIGHT_READY");
  assert.equal(result.scopeHash,validEnv().ARCA_PORTAL_SCOPE_SHA256);
  assert.equal(result.credentialReadiness.activeState,"ACTIVE_UNKNOWN");
  assert.equal(result.credentialReadiness.activeVerified,false);
  assert.equal(result.credentialReadiness.networkUsed,false);
  assert.equal(result.credentialReadiness.tokenIncluded,false);
  assert.equal(JSON.stringify(result).includes(apiKey),false);
  assert.deepEqual(backend.calls.map(call=>call.type),["preflight"]);
  assert.equal(spy.calls.length,0);
  assert.deepEqual(fs.readdirSync(context.outputDir),[]);
  assert.deepEqual(fs.readdirSync(context.temporaryParent),[]);
});

test("Portal probe persists, seals exact original bytes and emits only a sanitized success proof",async t=>{
  const context=await tempContext(t);
  const responseBody=Buffer.from(JSON.stringify([{documento:"DOC-SYNTHETIC-1",fase:"3",valor:"10,00"}]));
  const spy=fetchSpy(responseBody);
  const backend=fakeCustodyBackend();
  const result=await runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
    outputDir:context.outputDir,temporaryParent:context.temporaryParent
  });
  assert.equal(spy.calls.length,1);
  const requestUrl=new URL(spy.calls[0].url);
  assert.equal(requestUrl.origin,"https://api.portaldatransparencia.gov.br");
  assert.equal(requestUrl.pathname,"/api-de-dados/despesas/documentos-relacionados");
  assert.deepEqual([...requestUrl.searchParams.entries()],[["codigoDocumento",documentCode],["fase","3"]]);
  assert.equal(spy.calls[0].options.headers["chave-api-dados"],apiKey);
  assert.deepEqual(backend.calls.map(call=>call.type),["preflight","persist","status"]);
  assert.equal(result.proof.probeStatus,"SUCCEEDED");
  assert.equal(result.proof.credentialObservation.observationState,"ACCEPTED_ON_OBSERVED_REQUEST");
  assert.equal(result.proof.credentialObservation.activeVerified,true);
  assert.equal(result.proof.credentialReadiness.activeState,"ACTIVE_UNKNOWN");
  assert.equal(JSON.stringify(result.proof).includes(apiKey),false);
  assert.equal(result.proof.captureStatus,"CAPTURED_AND_SEALED");
  assert.equal(result.proof.validationStatus,"VALIDATED");
  assert.equal(result.proof.recordCount,1);
  assert.equal(result.proof.schemaObservation.observationState,"SCHEMA_OBSERVED");
  assert.equal(result.proof.schemaObservation.structure.recordCount,1);
  assert.deepEqual(result.proof.schemaObservation.structure.fields.map(item=>item.name),["documento","fase","valor"]);
  assert.equal(result.proof.schemaObservation.valuesIncluded,false);
  assert.equal(result.proof.schemaObservation.normalizationPerformed,false);
  assert.equal(result.proof.durableCustody.receiptHash,backend.calls[1].receipt.receiptHash);
  assert.equal(JSON.stringify(result.proof).includes(documentCode),false);
  assert.equal(JSON.stringify(result.proof).includes(apiKey),false);
  assert.equal(fs.readdirSync(context.temporaryParent).length,0);
  const envelope=JSON.parse(fs.readFileSync(result.envelopePath,"utf8"));
  const opened=openCustodyEnvelope({envelope,passphrase});
  const original=Buffer.from(opened.files[0].data,"base64");
  assert.equal(opened.files[0].path,"response.bin");
  assert.deepEqual(original,responseBody);
  const proofText=fs.readFileSync(result.proofPath,"utf8");
  assert.equal(proofText.includes(documentCode),false);
  assert.equal(proofText.includes(apiKey),false);
  assert.equal(proofText.includes("DOC-SYNTHETIC-1"),false);
});

test("Portal probe records invalid JSON as a sealed failed validation, not an empty result",async t=>{
  const context=await tempContext(t);
  const raw=Buffer.from("not-json synthetic raw body");
  const spy=fetchSpy(raw);
  const backend=fakeCustodyBackend();
  const result=await runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
    outputDir:context.outputDir,temporaryParent:context.temporaryParent
  });
  assert.equal(result.proof.captureStatus,"CAPTURED_AND_SEALED");
  assert.equal(result.proof.probeStatus,"FAILED");
  assert.equal(result.proof.validationStatus,"FAILED");
  assert.equal(result.proof.failureCode,"ARCA_PORTAL_JSON_INVALID");
  assert.equal(Object.hasOwn(result.proof,"recordCount"),false);
  assert.deepEqual(backend.calls.map(call=>call.type),["preflight","persist","status"]);
  assert.equal(backend.calls[2].proof.probeStatus,"FAILED");
  assert.equal(JSON.stringify(result.proof).includes(raw.toString()),false);
  assert.equal(fs.readdirSync(context.temporaryParent).length,0);
});

test("Portal probe rejects schema drift, more than 25 records and invalid UTF-8 after durable capture",async t=>{
  const cases=[
    {body:[{unexpected:"field"}],failureCode:"ARCA_PORTAL_DTO_SCHEMA_INVALID"},
    {body:[{documento:1}],failureCode:"ARCA_PORTAL_DTO_SCHEMA_INVALID"},
    {body:Array.from({length:26},()=>({documento:"SYNTHETIC"})),failureCode:"ARCA_PORTAL_RECORD_BUDGET_EXCEEDED"},
    {body:Buffer.from([0xc3,0x28]),failureCode:"ARCA_PORTAL_UTF8_INVALID"}
  ];
  for(const item of cases){
    const context=await tempContext(t);
    const spy=fetchSpy(item.body);
    const backend=fakeCustodyBackend();
    const result=await runPortalRelatedDocumentsProbe({
      env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
      outputDir:context.outputDir,temporaryParent:context.temporaryParent
    });
    assert.equal(result.proof.failureCode,item.failureCode);
    assert.equal(result.proof.probeStatus,"FAILED");
    assert.equal(Object.hasOwn(result.proof,"recordCount"),false);
    if(item.failureCode==="ARCA_PORTAL_DTO_SCHEMA_INVALID"){
      assert.equal(result.proof.schemaObservation.observationState,"SCHEMA_OBSERVED");
      assert.equal(result.proof.schemaObservation.valuesIncluded,false);
    }
    assert.equal(backend.calls.at(-1).type,"status");
    assert.equal(fs.readdirSync(context.temporaryParent).length,0);
  }
});

test("Portal probe seals HTTP operational failures and exposes only sanitized metadata",async t=>{
  const expected=new Map([[400,"ARCA_PORTAL_HTTP_BAD_REQUEST"],[401,"ARCA_PORTAL_HTTP_UNAUTHORIZED"],
    [429,"ARCA_PORTAL_HTTP_RATE_LIMITED"],[500,"ARCA_PORTAL_HTTP_SERVER_ERROR"]]);
  for(const [status,errorCode] of expected){
    const context=await tempContext(t);
    const raw=`${apiKey} ${documentCode} synthetic error body`;
    const spy=fetchSpy(raw,{status,contentType:"application/json"});
    const backend=fakeCustodyBackend();
    const result=await runPortalRelatedDocumentsProbe({
      env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
      outputDir:context.outputDir,temporaryParent:context.temporaryParent
    });
    assert.equal(result.status,"FAILED");
    assert.equal(result.proof.probeStatus,"FAILED");
    assert.equal(result.proof.validationStatus,"NOT_APPLICABLE");
    assert.equal(result.proof.failureCode,errorCode);
    assert.equal(result.proof.httpFailureCode,errorCode);
    assert.equal(result.proof.httpStatus,status);
    assert.equal(result.proof.httpStatusClass,`${Math.floor(status/100)}xx`);
    assert.equal(result.proof.captureStatus,"CAPTURED_AND_SEALED");
    assert.deepEqual(backend.calls.map(call=>call.type),["preflight","persist","status"]);
    assert.equal(JSON.stringify(result.proof).includes(apiKey),false);
    assert.equal(JSON.stringify(result.proof).includes(documentCode),false);
    assert.equal(JSON.stringify(result.proof).includes(raw),false);
    const envelope=JSON.parse(fs.readFileSync(result.envelopePath,"utf8"));
    const opened=openCustodyEnvelope({envelope,passphrase});
    assert.equal(Buffer.from(opened.files[0].data,"base64").toString("utf8"),raw);
    assert.equal(fs.readdirSync(context.temporaryParent).length,0);
  }
});

test("Portal probe never emits success when initial or final custody verification fails",async t=>{
  const context=await tempContext(t);
  const spy=fetchSpy([{documento:"SYNTHETIC"}]);
  const backend=fakeCustodyBackend({failPersist:true});
  await assert.rejects(()=>runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
    outputDir:context.outputDir,temporaryParent:context.temporaryParent
  }),/CUSTODY/);
  assert.equal(fs.readdirSync(context.outputDir).length,0);
  assert.equal(fs.readdirSync(context.temporaryParent).length,0);

  const next=await tempContext(t);
  const finalSpy=fetchSpy([{documento:"SYNTHETIC"}]);
  const finalBackend=fakeCustodyBackend({failStatus:true});
  await assert.rejects(()=>runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:finalSpy.fetchImpl,durableCustodyBackend:finalBackend,
    outputDir:next.outputDir,temporaryParent:next.temporaryParent
  }),/CUSTODY/);
  assert.equal(next.calls,undefined);
  assert.equal(fs.readdirSync(next.outputDir).length,0);
  assert.equal(fs.readdirSync(next.temporaryParent).length,0);
});

test("Portal probe refuses an unverifiable stored receipt before opening or parsing the response",async t=>{
  const context=await tempContext(t);
  const spy=fetchSpy("not-json");
  const backend=fakeCustodyBackend({badReceipt:true});
  await assert.rejects(()=>runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
    outputDir:context.outputDir,temporaryParent:context.temporaryParent
  }),/CUSTODY_RECEIPT_INVALID/);
  assert.deepEqual(backend.calls.map(call=>call.type),["preflight","persist"]);
  assert.equal(fs.readdirSync(context.outputDir).length,0);
  assert.equal(fs.readdirSync(context.temporaryParent).length,0);
});

test("Portal probe removes plaintext staging when sealing fails after the response arrives",async t=>{
  const context=await tempContext(t);
  const spy=fetchSpy([{documento:"SYNTHETIC"}]);
  const backend=fakeCustodyBackend();
  await assert.rejects(()=>runPortalRelatedDocumentsProbe({
    env:validEnv(),fetchImpl:spy.fetchImpl,durableCustodyBackend:backend,
    outputDir:context.outputDir,temporaryParent:context.temporaryParent,
    sealDirectory(){throw new Error("synthetic seal failure")}
  }),/ARCA_PORTAL_CUSTODY_SEAL_FAILED/);
  assert.equal(spy.calls.length,1);
  assert.deepEqual(backend.calls.map(call=>call.type),["preflight"]);
  assert.equal(fs.readdirSync(context.temporaryParent).length,0);
  assert.equal(fs.readdirSync(context.outputDir).length,0);
});
