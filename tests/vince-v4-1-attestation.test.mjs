import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign
} from "node:crypto";
import {sha256Canonical} from "../src/machine-bridge/vince-v4-replit.mjs";
import {
  ARCA_VINCE_V41_PROOF_FORMAT,
  ARCA_VINCE_V41_SIGNATURE_DOMAIN,
  signedV41Bytes,
  validateV41Request,
  verifyV41AttestedResult
} from "../src/machine-bridge/vince-v4-1-attestation.mjs";

const NOW=new Date("2026-09-23T03:45:00.000Z");
const CHALLENGE=Buffer.alloc(32,7).toString("base64url");

function worker(){
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const der=Buffer.from(publicKey.export({type:"spki",format:"der"}));
  const publicKeySpki=der.toString("base64");
  const keyFingerprint=createHash("sha256").update(der).digest("hex");
  return {
    privateKey,
    identity:{
      nodeId:"replit-vince-worker-1",
      algorithm:"Ed25519",
      publicKeySpki,
      keyFingerprint
    }
  };
}

function request(){
  return {
    format:"arca-vince-v4.1-job",
    protocolVersion:"4.1",
    jobId:"vince-v41-live-001",
    action:"git-status",
    expiresAt:"2026-09-23T04:10:00.000Z",
    challenge:CHALLENGE
  };
}

function unsignedResult(req,identity){
  return {
    format:"arca-vince-v4.1-result",
    protocolVersion:"4.1",
    jobId:req.jobId,
    action:req.action,
    challenge:req.challenge,
    requestSha256:sha256Canonical(req),
    startedAt:"2026-09-23T03:46:00.000Z",
    finishedAt:"2026-09-23T03:46:01.000Z",
    status:"completed",
    exitCode:0,
    timedOut:false,
    stdout:"On branch vince-v4-channel\nnothing to commit, working tree clean\n",
    stderr:"",
    stdoutTruncated:false,
    stderrTruncated:false,
    gitBranch:"feat/aie-0.4-foundation",
    gitHead:"a".repeat(40),
    gitDirty:false,
    workerIdentity:identity
  };
}

function signedResult(req,w){
  const base=unsignedResult(req,w.identity);
  const resultSha256=sha256Canonical(base);
  const withHash={...base,resultSha256};
  const signature=cryptoSign(null,signedV41Bytes(withHash),w.privateKey).toString("base64url");
  return {...withHash,signature};
}

test("V4.1 request requires a fresh 32-byte challenge and only git-status",()=>{
  const req=request();
  const validated=validateV41Request(req,{now:NOW});
  assert.match(validated.requestSha256,/^[a-f0-9]{64}$/);

  assert.throws(
    ()=>validateV41Request({...req,challenge:"short"},{now:NOW}),
    /CHALLENGE_INVALID/
  );
  assert.throws(
    ()=>validateV41Request({...req,action:"test-core"},{now:NOW}),
    /ACTION_NOT_ALLOWLISTED/
  );
  assert.throws(
    ()=>validateV41Request({...req,expiresAt:"2026-09-23T03:00:00.000Z"},{now:NOW}),
    /REQUEST_EXPIRED/
  );
});

test("V4.1 accepts only a signed result from the explicitly pinned worker identity",()=>{
  const req=request();
  const w=worker();
  const result=signedResult(req,w);
  const ledger=new Set();
  const proof=verifyV41AttestedResult({
    request:req,
    result,
    pinnedIdentity:w.identity,
    challengeLedger:ledger,
    now:NOW
  });
  assert.equal(proof.format,ARCA_VINCE_V41_PROOF_FORMAT);
  assert.equal(proof.executionState,"ATTESTED_VERIFIED_RESULT");
  assert.equal(proof.cryptographicWorkerAttestation,true);
  assert.equal(proof.challengeAcceptedOnce,true);
  assert.equal(proof.workerNodeId,w.identity.nodeId);
  assert.equal(proof.workerKeyFingerprint,w.identity.keyFingerprint);
  assert.equal(proof.automaticRetryPerformed,false);
  assert.equal(proof.failoverAuthorized,false);
  assert.equal(proof.authorityExpanded,false);
  assert.equal(ledger.has(CHALLENGE),true);
  assert.match(proof.proofSha256,/^[a-f0-9]{64}$/);
});

test("V4.1 rejects unknown key even when the signature itself is valid",()=>{
  const req=request();
  const trusted=worker();
  const attacker=worker();
  const result=signedResult(req,attacker);
  assert.throws(
    ()=>verifyV41AttestedResult({
      request:req,
      result,
      pinnedIdentity:trusted.identity,
      challengeLedger:new Set(),
      now:NOW
    }),
    /WORKER_IDENTITY_NOT_PINNED/
  );
});

test("V4.1 rejects tampering of challenge, provenance and canonical result hash",()=>{
  const req=request();
  const w=worker();
  const good=signedResult(req,w);

  assert.throws(
    ()=>verifyV41AttestedResult({
      request:req,
      result:{...good,challenge:Buffer.alloc(32,8).toString("base64url")},
      pinnedIdentity:w.identity,
      challengeLedger:new Set(),
      now:NOW
    }),
    /CORRELATION_MISMATCH/
  );

  assert.throws(
    ()=>verifyV41AttestedResult({
      request:req,
      result:{...good,gitHead:"b".repeat(40)},
      pinnedIdentity:w.identity,
      challengeLedger:new Set(),
      now:NOW
    }),
    /RESULT_HASH_MISMATCH/
  );

  assert.throws(
    ()=>verifyV41AttestedResult({
      request:req,
      result:{...good,stdout:"tampered"},
      pinnedIdentity:w.identity,
      challengeLedger:new Set(),
      now:NOW
    }),
    /RESULT_HASH_MISMATCH/
  );
});

test("V4.1 rejects replay of an already accepted challenge",()=>{
  const req=request();
  const w=worker();
  const result=signedResult(req,w);
  const ledger=new Set();
  verifyV41AttestedResult({
    request:req,
    result,
    pinnedIdentity:w.identity,
    challengeLedger:ledger,
    now:NOW
  });
  assert.throws(
    ()=>verifyV41AttestedResult({
      request:req,
      result,
      pinnedIdentity:w.identity,
      challengeLedger:ledger,
      now:NOW
    }),
    /CHALLENGE_REPLAY/
  );
});

test("V4.1 signature domain is fixed and changing signed bytes invalidates signature",()=>{
  assert.equal(ARCA_VINCE_V41_SIGNATURE_DOMAIN,"ARCA-VINCE-V4.1-REMOTE-ATTESTATION");
  const req=request();
  const w=worker();
  const result=signedResult(req,w);
  const altered={...result,resultSha256:"f".repeat(64)};
  assert.throws(
    ()=>verifyV41AttestedResult({
      request:req,
      result:altered,
      pinnedIdentity:w.identity,
      challengeLedger:new Set(),
      now:NOW
    }),
    /RESULT_HASH_MISMATCH|SIGNATURE_INVALID/
  );
});
