import test from "node:test";
import assert from "node:assert/strict";
import {
  appendV41AcceptedChallenge,
  createEmptyV41AcceptedChallengeRegistry,
  createV41DurableChallengeLedger,
  hasV41AcceptedChallenge,
  validateV41AcceptedChallengeRegistry,
  v41ChallengeSha256
} from "../src/machine-bridge/vince-v4-1-durable-challenge-registry.mjs";

const CHALLENGE=Buffer.alloc(32,9).toString("base64url");
const ACCEPTED_AT="2026-09-23T07:20:00.000Z";

function proof(overrides={}){
  return {
    challenge:CHALLENGE,
    missionId:"vince-v41-live-007",
    requestSha256:"a".repeat(64),
    resultSha256:"b".repeat(64),
    proofSha256:"c".repeat(64),
    workerNodeId:"vince-termux-android-1",
    workerKeyFingerprint:"d".repeat(64),
    executionState:"ATTESTED_VERIFIED_RESULT",
    cryptographicWorkerAttestation:true,
    ...overrides
  };
}

test("V4.1.1 durable registry starts empty and exposes a replay-compatible ledger",()=>{
  const registry=createEmptyV41AcceptedChallengeRegistry();
  validateV41AcceptedChallengeRegistry(registry);
  assert.equal(hasV41AcceptedChallenge(registry,CHALLENGE),false);

  const ledger=createV41DurableChallengeLedger(registry);
  assert.equal(ledger.has(CHALLENGE),false);
  ledger.add(CHALLENGE);
  assert.equal(ledger.has(CHALLENGE),true);
  assert.deepEqual(ledger.pendingDigests(),[v41ChallengeSha256(CHALLENGE)]);
});

test("V4.1.1 records an attested proof once and rejects the same challenge after reload",()=>{
  const registry=appendV41AcceptedChallenge(
    createEmptyV41AcceptedChallengeRegistry(),
    proof(),
    {acceptedAt:ACCEPTED_AT}
  );
  assert.equal(hasV41AcceptedChallenge(registry,CHALLENGE),true);

  const reloaded=JSON.parse(JSON.stringify(registry));
  const ledger=createV41DurableChallengeLedger(reloaded);
  assert.equal(ledger.has(CHALLENGE),true);

  assert.throws(
    ()=>appendV41AcceptedChallenge(reloaded,proof(),{acceptedAt:"2026-09-23T07:21:00.000Z"}),
    /CHALLENGE_REPLAY/
  );
});

test("V4.1.1 rejects mission reuse even with a different challenge",()=>{
  const registry=appendV41AcceptedChallenge(
    createEmptyV41AcceptedChallengeRegistry(),
    proof(),
    {acceptedAt:ACCEPTED_AT}
  );
  const otherChallenge=Buffer.alloc(32,10).toString("base64url");
  assert.throws(
    ()=>appendV41AcceptedChallenge(
      registry,
      proof({challenge:otherChallenge}),
      {acceptedAt:"2026-09-23T07:21:00.000Z"}
    ),
    /MISSION_ALREADY_ACCEPTED/
  );
});

test("V4.1.1 fails closed on malformed or duplicated durable state",()=>{
  assert.throws(
    ()=>validateV41AcceptedChallengeRegistry({format:"bad",version:1,entries:[]}),
    /REGISTRY_SCHEMA_INVALID/
  );
  const registry=appendV41AcceptedChallenge(
    createEmptyV41AcceptedChallengeRegistry(),
    proof(),
    {acceptedAt:ACCEPTED_AT}
  );
  assert.throws(
    ()=>validateV41AcceptedChallengeRegistry({...registry,entries:[...registry.entries,registry.entries[0]]}),
    /DUPLICATE_CHALLENGE/
  );
});
