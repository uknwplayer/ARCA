import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  buildDurableCustodyReceipt,
  createGitHubPrivateCustodyBackend
} from "../src/machine-bridge/durable-private-custody.mjs";

const token="unit-test-token-material-1234567890";
const sourceRevision="48db35a050ac2eaaf6186d1c0f13e5f675d46819";
const portalV02Schema="arca.portal-related-documents-controlled-probe.v0.2";

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function stableStringify(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableStringify(value[key])).join(",")+"}";
}
function gitBlobSha(bytes){
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  return createHash("sha1").update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest("hex");
}
function envelope(){
  return {
    schema:"arca.encrypted-custody-envelope.v0.1",
    status:"SEALED",
    algorithm:"AES-256-GCM",
    kdf:{name:"scrypt",N:16384,r:8,p:1},
    repository:"example/public-control-plane",
    revision:sourceRevision,
    scopeHash:"1".repeat(64),
    sealedAt:"2026-09-21T03:31:30.945Z",
    fileCount:3,
    totalBytes:21854,
    contentRootHash:"2".repeat(64),
    payloadHash:"3".repeat(64),
    salt:"AAAAAAAAAAAAAAAAAAAAAA==",
    iv:"AAAAAAAAAAAAAAAA",
    authTag:"AAAAAAAAAAAAAAAAAAAAAA==",
    ciphertext:"ZW5jcnlwdGVkLWZpeHR1cmU=",
    plaintextIncluded:false
  };
}
function proof(env=envelope()){
  return {
    schema:"arca.pncp-controlled-live-probe.v0.1",
    status:"CAPTURED_AND_SEALED",
    repository:env.repository,
    revision:env.revision,
    resultHash:"4".repeat(64),
    networkUsed:true,
    custody:{
      encrypted:true,
      envelopeHash:sha256(JSON.stringify(env)),
      contentRootHash:env.contentRootHash,
      payloadHash:env.payloadHash,
      fileCount:env.fileCount,
      totalBytes:env.totalBytes,
      plaintextPublished:false
    },
    classifierEmittedSignals:false,
    investigationIngressUsed:false,
    automaticAdversePublication:false,
    humanReviewRequired:true,
    anomalyIsNotIrregularity:true
  };
}
function portalProof(env=envelope(),overrides={}){
  const responseHash="4".repeat(64);
  return {
    schema:portalV02Schema,
    probeStatus:"CAPTURING",
    captureStatus:"CAPTURED_AND_SEALED",
    validationStatus:"PENDING",
    repository:env.repository,
    revision:env.revision,
    scopeHash:env.scopeHash,
    resultHash:responseHash,
    responseBytesSha256:responseHash,
    responseByteCount:2,
    httpStatusClass:"2xx",
    contractId:"PORTAL_EXPENSE_RELATED_DOCUMENTS",
    networkUsed:true,
    custody:{
      encrypted:true,
      envelopeHash:sha256(JSON.stringify(env)),
      contentRootHash:env.contentRootHash,
      payloadHash:env.payloadHash,
      fileCount:env.fileCount,
      totalBytes:env.totalBytes,
      plaintextPublished:false
    },
    classifierEmittedSignals:false,
    investigationIngressUsed:false,
    automaticAdversePublication:false,
    humanReviewRequired:true,
    anomalyIsNotIrregularity:true,
    ...overrides
  };
}
function response(status,body=null){
  return new Response(body===null?"":JSON.stringify(body),{
    status,
    headers:{"content-type":"application/json"}
  });
}

test("durable custody receipt is deterministic and binds encrypted envelope to live proof",()=>{
  const env=envelope();
  const a=buildDurableCustodyReceipt({
    envelope:env,
    proof:proof(env),
    vaultRepository:"example/private-vault",
    vaultBranch:"main"
  });
  const b=buildDurableCustodyReceipt({
    envelope:env,
    proof:proof(env),
    vaultRepository:"example/private-vault",
    vaultBranch:"main"
  });
  assert.deepEqual(a,b);
  assert.match(a.receiptHash,/^[a-f0-9]{64}$/);
  assert.equal(a.envelopeHash,sha256(JSON.stringify(env)));
  assert.equal(a.plaintextStored,false);
  assert.equal(a.automaticAdversePublication,false);
  assert.equal(a.humanReviewRequired,true);
  assert.equal(Object.hasOwn(a,"proofSchema"),false);
});

test("Portal proof can bind to encrypted durable custody without changing PNCP receipt format",()=>{
  const env=envelope();
  const p={...proof(env),schema:"arca.portal-controlled-live-probe.v0.1"};
  const receipt=buildDurableCustodyReceipt({envelope:env,proof:p,vaultRepository:"example/private-vault"});
  assert.equal(receipt.proofSchema,p.schema);
  assert.equal(receipt.envelopeHash,sha256(JSON.stringify(env)));
  assert.equal(receipt.plaintextStored,false);
  assert.equal(receipt.automaticAdversePublication,false);
});

test("Portal proof missing human review or claiming publication fails before a durable receipt",()=>{
  const env=envelope();
  const p={...proof(env),schema:"arca.portal-controlled-live-probe.v0.1"};
  assert.throws(()=>buildDurableCustodyReceipt({envelope:env,
    proof:{...p,humanReviewRequired:false},vaultRepository:"example/private-vault"}),/PROOF_INVALID/);
  assert.throws(()=>buildDurableCustodyReceipt({envelope:env,
    proof:{...p,automaticAdversePublication:true},vaultRepository:"example/private-vault"}),/PROOF_INVALID/);
  assert.throws(()=>buildDurableCustodyReceipt({envelope:env,
    proof:{...p,networkUsed:false},vaultRepository:"example/private-vault"}),/PROOF_INVALID/);
});

test("M4b pending capture proof binds its scope and is recorded in a distinct receipt schema",()=>{
  const env=envelope();
  const p=portalProof(env);
  const receipt=buildDurableCustodyReceipt({envelope:env,proof:p,vaultRepository:"example/private-vault"});
  assert.equal(receipt.proofSchema,portalV02Schema);
  assert.equal(receipt.captureProofHash,sha256(stableStringify(p)));
  assert.equal(receipt.scopeHash,env.scopeHash);
  assert.equal(receipt.plaintextStored,false);
  assert.equal(receipt.humanReviewRequired,true);
  assert.equal(receipt.classifierEmittedSignals,false);
  assert.equal(receipt.investigationIngressUsed,false);
  assert.equal(receipt.automaticAdversePublication,false);
});

test("M4b capture receipt rejects wrong scope, status, and adverse safety flags",()=>{
  const env=envelope();
  const p=portalProof(env);
  assert.throws(()=>buildDurableCustodyReceipt({envelope:env,proof:{...p,scopeHash:"9".repeat(64)},vaultRepository:"example/private-vault"}),/PROOF_INVALID/);
  assert.throws(()=>buildDurableCustodyReceipt({envelope:env,proof:{...p,validationStatus:"SUCCEEDED"},vaultRepository:"example/private-vault"}),/PROOF_INVALID/);
  assert.throws(()=>buildDurableCustodyReceipt({envelope:env,proof:{...p,investigationIngressUsed:true},vaultRepository:"example/private-vault"}),/PROOF_INVALID/);
  assert.throws(()=>buildDurableCustodyReceipt({envelope:env,proof:{...p,documentCode:"synthetic"},vaultRepository:"example/private-vault"}),/PROOF_INVALID/);
});

test("M4b backend stores initial proof atomically and appends idempotent final validation proofs",async()=>{
  const env=envelope();
  const initial=portalProof(env);
  let head="a".repeat(40);
  const files=new Map();
  const blobs=new Map();
  let nextTree=[];
  const calls=[];
  const fakeFetch=async(url,options={})=>{
    const parsed=new URL(url);
    const method=options.method??"GET";
    const body=options.body?JSON.parse(options.body):null;
    calls.push({method,path:parsed.pathname,body});
    if(method==="GET"&&parsed.pathname==="/repos/example/private-vault")return response(200,{private:true,archived:false});
    if(method==="GET"&&parsed.pathname==="/repos/example/private-vault/git/ref/heads/main")return response(200,{object:{sha:head}});
    if(method==="GET"&&parsed.pathname.startsWith("/repos/example/private-vault/contents/")){
      const filePath=parsed.pathname.split("/contents/")[1];
      if(!files.has(filePath))return response(404,{message:"Not Found"});
      const sha=files.get(filePath);
      return response(200,{sha,content:blobs.get(sha).toString("base64"),encoding:"base64"});
    }
    if(method==="GET"&&parsed.pathname===`/repos/example/private-vault/git/commits/${head}`)return response(200,{tree:{sha:"b".repeat(40)} });
    if(method==="POST"&&parsed.pathname==="/repos/example/private-vault/git/blobs"){
      const bytes=Buffer.from(body.content,"base64");
      const sha=gitBlobSha(bytes);
      blobs.set(sha,bytes);
      return response(201,{sha});
    }
    if(method==="POST"&&parsed.pathname==="/repos/example/private-vault/git/trees"){
      nextTree=[...body.tree];
      return response(201,{sha:"c".repeat(40)});
    }
    if(method==="POST"&&parsed.pathname==="/repos/example/private-vault/git/commits")return response(201,{sha:"d".repeat(40)});
    if(method==="PATCH"&&parsed.pathname==="/repos/example/private-vault/git/refs/heads/main"){
      for(const entry of nextTree)files.set(entry.path,entry.sha);
      head=body.sha;
      return response(200,{object:{sha:head}});
    }
    throw new Error(`unexpected request ${method} ${parsed.pathname}`);
  };
  const backend=createGitHubPrivateCustodyBackend({repository:"example/private-vault",token,fetchImpl:fakeFetch});
  const stored=await backend.persist({envelope:env,proof:initial});
  assert.equal(stored.status,"STORED");
  assert.equal(calls.filter(call=>call.method==="PATCH").length,1);
  assert.equal(calls.filter(call=>call.method==="POST"&&call.path.endsWith("/git/blobs")).length,3);
  assert.equal([...files.keys()].some(file=>file.includes("capture-proof")),true);
  assert.equal([...files.keys()].some(file=>file.includes(".receipt.json")),true);
  assert.equal([...files.values()].some(sha=>blobs.get(sha)?.toString("utf8").includes(portalV02Schema)),true);
  const repeated=await backend.persist({envelope:env,proof:initial});
  assert.equal(repeated.status,"ALREADY_STORED");
  assert.equal(calls.filter(call=>call.method==="PATCH").length,1);

  const finalProof=portalProof(env,{
    probeStatus:"SUCCEEDED",
    validationStatus:"VALIDATED",
    recordCount:1,
    durableCustody:{required:true,status:"STORED_PRIVATE",receiptHash:stored.receiptHash,plaintextStored:false}
  });
  await assert.rejects(()=>backend.persistStatusProof({envelope:env,proof:{...finalProof,probeStatus:"CAPTURING"}}),/PROOF_INVALID/);
  await assert.rejects(()=>backend.persistStatusProof({envelope:env,proof:{...finalProof,
    resultHash:"5".repeat(64),responseBytesSha256:"5".repeat(64)}}),/STATUS_PROOF_CAPTURE_BINDING_INVALID/);
  assert.equal(calls.filter(call=>call.method==="PATCH").length,1);
  const final=await backend.persistStatusProof({envelope:env,proof:finalProof});
  assert.equal(final.status,"STORED_PRIVATE");
  assert.match(final.proofHash,/^[a-f0-9]{64}$/);
  assert.equal(calls.filter(call=>call.method==="PATCH").length,2);
  assert.equal([...files.keys()].some(file=>file.includes("validation-proof")),true);
  const finalAgain=await backend.persistStatusProof({envelope:env,proof:finalProof});
  assert.equal(finalAgain.status,"ALREADY_STORED_PRIVATE");
  assert.equal(calls.filter(call=>call.method==="PATCH").length,2);

  const failedProof=portalProof(env,{
    probeStatus:"FAILED",
    validationStatus:"FAILED",
    failureCode:"ARCA_PORTAL_JSON_INVALID",
    durableCustody:{required:true,status:"STORED_PRIVATE",receiptHash:stored.receiptHash,plaintextStored:false}
  });
  const failed=await backend.persistStatusProof({envelope:env,proof:failedProof});
  assert.equal(failed.status,"STORED_PRIVATE");
  assert.equal(calls.filter(call=>call.method==="PATCH").length,3);
});

test("GitHub private backend commits envelope and receipt atomically through one ref advance",async()=>{
  const env=envelope();
  const p=proof(env);
  const calls=[];
  let stored=false;
  let head="a".repeat(40);
  let envelopeBlobSha=null;
  let receiptBlobSha=null;

  const fakeFetch=async(url,options={})=>{
    const parsed=new URL(url);
    const method=options.method??"GET";
    const body=options.body?JSON.parse(options.body):null;
    calls.push({method,path:parsed.pathname,body});

    if(method==="GET"&&parsed.pathname==="/repos/example/private-vault")
      return response(200,{private:true,archived:false});
    if(method==="GET"&&parsed.pathname==="/repos/example/private-vault/git/ref/heads/main")
      return response(200,{object:{sha:head}});
    if(method==="GET"&&parsed.pathname.startsWith("/repos/example/private-vault/contents/")){
      if(!stored)return response(404,{message:"Not Found"});
      const isEnvelope=parsed.pathname.includes("/custody/");
      return response(200,{sha:isEnvelope?envelopeBlobSha:receiptBlobSha});
    }
    if(method==="GET"&&parsed.pathname===`/repos/example/private-vault/git/commits/${head}`)
      return response(200,{tree:{sha:"b".repeat(40)}});
    if(method==="POST"&&parsed.pathname==="/repos/example/private-vault/git/blobs"){
      const bytes=Buffer.from(body.content,"base64");
      const sha=gitBlobSha(bytes);
      if(envelopeBlobSha===null)envelopeBlobSha=sha;
      else receiptBlobSha=sha;
      return response(201,{sha});
    }
    if(method==="POST"&&parsed.pathname==="/repos/example/private-vault/git/trees")
      return response(201,{sha:"c".repeat(40)});
    if(method==="POST"&&parsed.pathname==="/repos/example/private-vault/git/commits")
      return response(201,{sha:"d".repeat(40)});
    if(method==="PATCH"&&parsed.pathname==="/repos/example/private-vault/git/refs/heads/main"){
      assert.equal(body.force,false);
      assert.equal(body.sha,"d".repeat(40));
      head=body.sha;
      stored=true;
      return response(200,{object:{sha:head}});
    }
    throw new Error(`unexpected request ${method} ${parsed.pathname}`);
  };

  const backend=createGitHubPrivateCustodyBackend({
    repository:"example/private-vault",
    branch:"main",
    token,
    fetchImpl:fakeFetch
  });
  const preflight=await backend.preflight();
  assert.equal(preflight.ready,true);
  assert.equal(preflight.private,true);

  const result=await backend.persist({envelope:env,proof:p});
  assert.equal(result.status,"STORED");
  assert.equal(result.vaultCommitSha,"d".repeat(40));
  assert.match(result.receiptHash,/^[a-f0-9]{64}$/);
  assert.equal(calls.filter(call=>call.method==="PATCH").length,1);
  assert.equal(calls.filter(call=>call.method==="POST"&&call.path.endsWith("/git/blobs")).length,2);

  const retry=await backend.persist({envelope:env,proof:p});
  assert.equal(retry.status,"ALREADY_STORED");
  assert.equal(calls.filter(call=>call.method==="PATCH").length,1);
});

test("backend refuses a public target before any write",async()=>{
  const calls=[];
  const backend=createGitHubPrivateCustodyBackend({
    repository:"example/not-private",
    token,
    fetchImpl:async(url,options={})=>{
      calls.push(options.method??"GET");
      return response(200,{private:false,archived:false});
    }
  });
  await assert.rejects(()=>backend.preflight(),/TARGET_NOT_PRIVATE/);
  assert.deepEqual(calls,["GET"]);
});

test("content-address collision or replacement attempt fails closed",async()=>{
  const env=envelope();
  const p=proof(env);
  const fakeFetch=async(url,options={})=>{
    const parsed=new URL(url);
    const method=options.method??"GET";
    if(method==="GET"&&parsed.pathname==="/repos/example/private-vault")
      return response(200,{private:true,archived:false});
    if(method==="GET"&&parsed.pathname==="/repos/example/private-vault/git/ref/heads/main")
      return response(200,{object:{sha:"a".repeat(40)}});
    if(method==="GET"&&parsed.pathname.startsWith("/repos/example/private-vault/contents/"))
      return response(200,{sha:"f".repeat(40)});
    throw new Error("write must not happen");
  };
  const backend=createGitHubPrivateCustodyBackend({
    repository:"example/private-vault",
    token,
    fetchImpl:fakeFetch
  });
  await assert.rejects(()=>backend.persist({envelope:env,proof:p}),/CONTENT_ADDRESS_CONFLICT/);
});
