import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  buildDurableCustodyReceipt,
  createGitHubPrivateCustodyBackend
} from "../src/machine-bridge/durable-private-custody.mjs";

const token="unit-test-token-material-1234567890";
const sourceRevision="48db35a050ac2eaaf6186d1c0f13e5f675d46819";

function sha256(value){return createHash("sha256").update(value).digest("hex")}
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
