import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createGitHubPrivateNormalizationStore} from "../src/investigation/m5-private-normalization-store.mjs";

const sha256=v=>createHash("sha256").update(v).digest("hex");
const gitBlobSha=bytes=>{
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  return createHash("sha1").update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest("hex");
};
const response=(status,body)=>({
  ok:status>=200&&status<300,
  status,
  async text(){return body===null?"":JSON.stringify(body)}
});

test("private normalization store persists encrypted envelope and sanitized proof atomically",async()=>{
  const envelope={
    schema:"arca.encrypted-custody-envelope.v0.1",
    status:"SEALED",
    algorithm:"AES-256-GCM",
    plaintextIncluded:false,
    contentRootHash:"1".repeat(64)
  };
  const proofBase={
    schema:"arca.m5-portal-custodial-normalization-proof.v1",
    version:1,
    status:"NORMALIZED_CUSTODIAL_OFFLINE",
    executorRevision:"a".repeat(40),
    candidateSha256:"2".repeat(64),
    decisionSha256:"3".repeat(64),
    parserContractSha256:"4".repeat(64),
    observedSchemaSha256:"5".repeat(64),
    custodyEnvelopeSha256:"6".repeat(64),
    custodyReceiptSha256:"7".repeat(64),
    responseBytesSha256:"8".repeat(64),
    scopeSha256:"9".repeat(64),
    recordCount:1,
    normalizationSha256:"b".repeat(64),
    normalizedEnvelopeSha256:sha256(JSON.stringify(envelope)),
    normalizedContentRootSha256:envelope.contentRootHash,
    sourceNetworkUsed:false,
    portalRequestUsed:false,
    publicationAttempted:false,
    correlationAttempted:false,
    normalizedValuesIncludedInProof:false,
    rawBytesIncludedInProof:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  const proof={...proofBase,proofSha256:sha256(JSON.stringify(proofBase))};
  const head="c".repeat(40),baseTree="d".repeat(40),newTree="e".repeat(40),newCommit="f".repeat(40);
  const seen=[];
  const fetchImpl=async(url,options={})=>{
    seen.push({url,method:options.method,body:options.body});
    assert.equal(new URL(url).hostname,"api.github.com");
    const method=options.method;
    const pathname=new URL(url).pathname;
    if(method==="GET"&&pathname==="/repos/owner/private-vault")return response(200,{private:true,archived:false});
    if(method==="GET"&&pathname.endsWith("/git/ref/heads/main"))return response(200,{object:{sha:head}});
    if(method==="GET"&&pathname.endsWith("/git/commits/"+head))return response(200,{tree:{sha:baseTree}});
    if(method==="POST"&&pathname.endsWith("/git/blobs")){
      const body=JSON.parse(options.body);
      const bytes=Buffer.from(body.content,"base64");
      return response(201,{sha:gitBlobSha(bytes)});
    }
    if(method==="POST"&&pathname.endsWith("/git/trees"))return response(201,{sha:newTree});
    if(method==="POST"&&pathname.endsWith("/git/commits"))return response(201,{sha:newCommit});
    if(method==="PATCH"&&pathname.endsWith("/git/refs/heads/main"))return response(200,{object:{sha:newCommit}});
    return response(404,{message:"unexpected"});
  };

  const store=createGitHubPrivateNormalizationStore({
    repository:"owner/private-vault",
    targetBranch:"main",
    githubToken:"synthetic-private-token-0123456789",
    fetchImpl
  });
  const result=await store.persist({envelope,proof});
  assert.equal(result.status,"STORED_PRIVATE");
  assert.equal(result.commitSha,newCommit);
  assert.equal(result.plaintextStored,false);
  assert.match(result.receiptSha256,/^[a-f0-9]{64}$/);
  assert.equal(seen.filter(x=>x.method==="POST"&&x.url.endsWith("/git/blobs")).length,3);
});

test("private normalization store rejects plaintext or unsafe proof before network",async()=>{
  let calls=0;
  const store=createGitHubPrivateNormalizationStore({
    repository:"owner/private-vault",
    targetBranch:"main",
    githubToken:"synthetic-private-token-0123456789",
    fetchImpl:async()=>{calls++;return response(500,{})}
  });
  await assert.rejects(()=>store.persist({
    envelope:{schema:"arca.encrypted-custody-envelope.v0.1",status:"SEALED",algorithm:"AES-256-GCM",plaintextIncluded:true,contentRootHash:"1".repeat(64)},
    proof:{}
  }),/STORE_PROOF_INVALID/);
  assert.equal(calls,0);
});
