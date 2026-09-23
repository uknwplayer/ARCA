import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync
} from "node:crypto";
import {
  buildSignedTermuxV5Presence,
  routeTermuxV5Candidates,
  verifyTermuxV5Presence
} from "../src/machine-bridge/vince-v5-termux-presence.mjs";

function worker(nodeId){
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const der=Buffer.from(publicKey.export({type:"spki",format:"der"}));
  const identity={
    nodeId,
    algorithm:"Ed25519",
    publicKeySpki:der.toString("base64"),
    keyFingerprint:createHash("sha256").update(der).digest("hex")
  };
  const pin={
    format:"arca-vince-v4.1-worker-pin",
    version:1,
    workerKind:"termux-android",
    identity,
    source:{repository:"uknwplayer/ARCA",branch:"test",path:`identity/${nodeId}.json`,blobSha:"a".repeat(40)},
    reviewedAt:"2026-09-23T08:00:00.000Z",
    policy:{
      action:"git-status",
      automaticRetryAllowed:false,
      failoverAllowed:false,
      authorityExpanded:false,
      coreMutationAllowed:false,
      trustModificationAllowed:false
    }
  };
  return {identity,privateKey,pin};
}

test("signed READY presence becomes verified V5 execution readiness",()=>{
  const a=worker("vince-termux-a");
  const presence=buildSignedTermuxV5Presence({
    identity:a.identity,
    privateKey:a.privateKey,
    state:"READY",
    observedAt:"2026-09-23T09:00:00.000Z",
    ttl:300_000
  });
  const observation=verifyTermuxV5Presence({
    presence,pin:a.pin,now:"2026-09-23T09:00:30.000Z"
  });
  assert.equal(observation.state,"AVAILABLE");
  assert.equal(observation.reason,"CRYPTOGRAPHIC_READY_LEASE");
  assert.equal(observation.executionReady,true);
  assert.equal(observation.routeEligible,true);
  assert.equal(observation.wakeAcknowledged,false);
});

test("V5 selects the freshest verified Termux worker without dispatch",()=>{
  const a=worker("vince-termux-a");
  const b=worker("vince-termux-b");
  const pa=buildSignedTermuxV5Presence({
    identity:a.identity,privateKey:a.privateKey,state:"READY",
    observedAt:"2026-09-23T09:00:20.000Z",ttl:300_000
  });
  const pb=buildSignedTermuxV5Presence({
    identity:b.identity,privateKey:b.privateKey,state:"READY",
    observedAt:"2026-09-23T09:00:10.000Z",ttl:300_000
  });
  const proof=routeTermuxV5Candidates({
    pins:[a.pin,b.pin],presences:[pa,pb],now:"2026-09-23T09:00:30.000Z"
  });
  assert.equal(proof.route.state,"AVAILABLE");
  assert.equal(proof.route.selectedEndpointId,"vince-termux-a");
  assert.equal(proof.route.eligibleCount,2);
  assert.equal(proof.route.dispatchPerformed,false);
  assert.equal(proof.safety.workUsed,false);
  assert.equal(proof.safety.replitUsed,false);
});

test("withdrawn A makes B the selected route without duplicate dispatch",()=>{
  const a=worker("vince-termux-a");
  const b=worker("vince-termux-b");
  const withdrawnA=buildSignedTermuxV5Presence({
    identity:a.identity,privateKey:a.privateKey,state:"WITHDRAWN",
    observedAt:"2026-09-23T09:01:00.000Z",ttl:300_000
  });
  const readyB=buildSignedTermuxV5Presence({
    identity:b.identity,privateKey:b.privateKey,state:"READY",
    observedAt:"2026-09-23T09:00:50.000Z",ttl:300_000
  });
  const proof=routeTermuxV5Candidates({
    pins:[a.pin,b.pin],presences:[withdrawnA,readyB],now:"2026-09-23T09:01:10.000Z"
  });
  assert.equal(proof.observations[0].reason,"SIGNED_PRESENCE_WITHDRAWN");
  assert.equal(proof.route.selectedEndpointId,"vince-termux-b");
  assert.equal(proof.route.eligibleCount,1);
  assert.equal(proof.route.dispatchPerformed,false);
});

test("stale signed presence is fail-closed and not routable",()=>{
  const a=worker("vince-termux-a");
  const presence=buildSignedTermuxV5Presence({
    identity:a.identity,privateKey:a.privateKey,state:"READY",
    observedAt:"2026-09-23T09:00:00.000Z",ttl:1_000
  });
  const observation=verifyTermuxV5Presence({
    presence,pin:a.pin,now:"2026-09-23T09:00:02.000Z"
  });
  assert.equal(observation.state,"INCONCLUSIVE");
  assert.equal(observation.reason,"SIGNED_PRESENCE_STALE");
  assert.equal(observation.executionReady,false);
});

test("presence signed by a different key is rejected against the pin",()=>{
  const a=worker("vince-termux-a");
  const impostor=worker("vince-termux-a");
  const presence=buildSignedTermuxV5Presence({
    identity:impostor.identity,privateKey:impostor.privateKey,state:"READY",
    observedAt:"2026-09-23T09:00:00.000Z",ttl:300_000
  });
  assert.throws(
    ()=>verifyTermuxV5Presence({presence,pin:a.pin,now:"2026-09-23T09:00:10.000Z"}),
    /VINCE_V5_TERMUX_PIN_MISMATCH/
  );
});
