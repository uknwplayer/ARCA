import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {verifyV4Result} from "../src/machine-bridge/vince-v4-replit.mjs";

const request=JSON.parse(await readFile(new URL("../examples/vince-v4-live-005/request.json",import.meta.url),"utf8"));
const result=JSON.parse(await readFile(new URL("../examples/vince-v4-live-005/result.json",import.meta.url),"utf8"));

test("Vince V4 live proof 005 verifies with canonical ARCA verifier",()=>{
  const proof=verifyV4Result({
    request,
    result,
    now:new Date("2026-09-23T03:25:00.000Z")
  });
  assert.equal(proof.executionState,"VERIFIED_RESULT");
  assert.equal(proof.remoteEnvironment,"replit");
  assert.equal(proof.transport,"github-contents-v4");
  assert.equal(proof.requestSha256,"c0699f366877a97793330b3587c2c4b7742a66d2f2be4d1a835a2800ecaede32");
  assert.equal(proof.resultSha256,"3ded72842a195693d90664ff644f0309742a7331e4c735f2f44d51b3b83dd2e7");
  assert.equal(proof.proofSha256,"daea9c2cb9bf6cb25aa947ac16fd6af8b83a016ff8e8235b031a657b6e80e95e");
  assert.equal(proof.gitBranch,"feat/aie-0.4-foundation");
  assert.equal(proof.gitHead,"8055e6ba7e8ad9140a0f69146e61216efc895a90");
  assert.equal(proof.gitDirty,false);
  assert.equal(proof.cryptographicWorkerAttestation,false);
  assert.equal(proof.automaticRetryPerformed,false);
  assert.equal(proof.failoverAuthorized,false);
  assert.equal(proof.authorityExpanded,false);
  assert.equal(proof.coreMutationPerformed,false);
  assert.equal(proof.trustModified,false);
});
