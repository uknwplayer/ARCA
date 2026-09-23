import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCA_VINCE_V4_PROOF_FORMAT,
  sha256Canonical,
  validateV4Request,
  verifyV4Result
} from "../src/machine-bridge/vince-v4-replit.mjs";

const NOW=new Date("2026-09-23T03:10:00.000Z");
function request(){
  return {
    format:"arca-vince-v4-job",
    protocolVersion:4,
    jobId:"vince-v4-live-004",
    action:"git-status",
    expiresAt:"2026-09-23T03:30:00.000Z"
  };
}
function result(req=request()){
  const base={
    format:"arca-vince-v4-result",
    protocolVersion:4,
    jobId:req.jobId,
    action:req.action,
    requestSha256:sha256Canonical(req),
    startedAt:"2026-09-23T03:11:00.000Z",
    finishedAt:"2026-09-23T03:11:01.000Z",
    status:"completed",
    exitCode:0,
    timedOut:false,
    stdout:"On branch feat/aie-0.4-foundation\nnothing to commit, working tree clean\n",
    stderr:"",
    stdoutTruncated:false,
    stderrTruncated:false,
    gitBranch:"feat/aie-0.4-foundation",
    gitHead:"a".repeat(40),
    gitDirty:false
  };
  return {...base,resultSha256:sha256Canonical(base)};
}

test("V4 request canonical hash is deterministic and strict",()=>{
  const req=request();
  const a=validateV4Request(req,{now:NOW});
  const reordered={
    action:req.action,
    expiresAt:req.expiresAt,
    format:req.format,
    jobId:req.jobId,
    protocolVersion:req.protocolVersion
  };
  assert.equal(a.requestSha256,sha256Canonical(reordered));
  assert.throws(()=>validateV4Request({...req,action:"test-core"},{now:NOW}),/ACTION_NOT_ALLOWLISTED/);
  assert.throws(()=>validateV4Request({...req,extra:true},{now:NOW}),/FIELDS_INVALID/);
  assert.throws(()=>validateV4Request({...req,expiresAt:"2026-09-23T03:00:00.000Z"},{now:NOW}),/EXPIRED/);
});

test("V4 result verifies correlation, canonical hashes and heterogeneous provenance",()=>{
  const req=request();
  const proof=verifyV4Result({request:req,result:result(req),now:NOW});
  assert.equal(proof.format,ARCA_VINCE_V4_PROOF_FORMAT);
  assert.equal(proof.remoteEnvironment,"replit");
  assert.equal(proof.transport,"github-contents-v4");
  assert.equal(proof.executionState,"VERIFIED_RESULT");
  assert.equal(proof.cryptographicWorkerAttestation,false);
  assert.equal(proof.automaticRetryPerformed,false);
  assert.equal(proof.failoverAuthorized,false);
  assert.equal(proof.authorityExpanded,false);
  assert.equal(proof.coreMutationPerformed,false);
  assert.equal(proof.trustModified,false);
  assert.match(proof.proofSha256,/^[a-f0-9]{64}$/);
});

test("V4 verifier fails closed on result tampering and correlation drift",()=>{
  const req=request();
  const good=result(req);
  assert.throws(()=>verifyV4Result({request:req,result:{...good,jobId:"vince-v4-other"},now:NOW}),/CORRELATION_MISMATCH/);
  assert.throws(()=>verifyV4Result({request:req,result:{...good,stdout:"tampered"},now:NOW}),/RESULT_HASH_MISMATCH/);
  assert.throws(()=>verifyV4Result({request:req,result:{...good,requestSha256:"b".repeat(64)},now:NOW}),/REQUEST_HASH_MISMATCH/);
});

test("V4 verifier refuses timeout, truncation, failed execution and malformed provenance",()=>{
  const req=request();
  const base=result(req);
  for(const mutated of [
    {...base,timedOut:true},
    {...base,stdoutTruncated:true},
    {...base,status:"failed",exitCode:1},
    {...base,gitHead:"bad"},
    {...base,gitDirty:null}
  ]){
    const unsigned={...mutated}; delete unsigned.resultSha256;
    mutated.resultSha256=sha256Canonical(unsigned);
    assert.throws(()=>verifyV4Result({request:req,result:mutated,now:NOW}));
  }
});
