import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpaqueReasoningTransportAttestation,
  createReasoningTransportProfile,
  evaluateReasoningTransport
} from "../packages/agent/src/reasoning-transport-gate.ts";
import {classifyPrivacyRecord} from "../packages/agent/src/privacy-classification.ts";

const transport=createReasoningTransportProfile({
  transportId:"mesh.opaque.verified",
  kind:"opaque-relay",
  persistence:"durable",
  relayVisibility:"metadata-only",
  encryption:"end-to-end",
  external:true,
  operator:"arca-mesh"
});
const classification=classifyPrivacyRecord({
  recordId:"payload.opaque.reasoning",
  subjectType:"mixed",
  sourceType:"user-provided",
  privacyClass:"restricted",
  purpose:"private verified reasoning",
  indicators:{privateCommunication:true}
},{classifiedAt:"2026-09-18T00:10:00.000Z"});
const payload={instruction:"private reasoning fixture",context:{caseId:"fixture"}};

function base(attestation){
  return {
    requestId:"req.opaque.reasoning",
    payloadId:"payload.opaque.reasoning",
    payload,
    classification,
    transport,
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true,
    opaqueRelayAttestation:attestation
  };
}

test("private opaque reasoning remains denied without explicit cryptographic runtime attestation",()=>{
  const decision=evaluateReasoningTransport(base(undefined),{decidedAt:"2026-09-18T00:10:00.000Z"});
  assert.equal(decision.allowed,false);
  assert.ok(decision.reasons.includes("opaque-relay-private-crypto-attestation-required"));
});

test("verified durable opaque RPC attestation opens only the private transport gate",()=>{
  const attestation=createOpaqueReasoningTransportAttestation({
    requestId:"req.opaque.reasoning",
    payloadId:"payload.opaque.reasoning",
    transport
  });
  const decision=evaluateReasoningTransport(base(attestation),{decidedAt:"2026-09-18T00:10:00.000Z"});
  assert.equal(decision.allowed,true);
  assert.deepEqual(decision.reasons,[]);
  assert.equal(decision.executionAuthorized,false);
  assert.equal(decision.coreMutationAuthorized,false);
  assert.equal(decision.humanReviewBypassed,false);
  assert.equal(decision.payloadPersisted,false);
});

test("opaque reasoning attestation is correlation and transport bound",()=>{
  const attestation=createOpaqueReasoningTransportAttestation({
    requestId:"req.opaque.reasoning",
    payloadId:"payload.opaque.reasoning",
    transport
  });
  const wrongCorrelation={...attestation,requestId:"req.other"};
  let decision=evaluateReasoningTransport(base(wrongCorrelation),{decidedAt:"2026-09-18T00:10:00.000Z"});
  assert.equal(decision.allowed,false);
  assert.ok(decision.reasons.includes("opaque-relay-private-crypto-attestation-required"));

  const wrongHash={...attestation,transportHash:"a".repeat(64)};
  decision=evaluateReasoningTransport(base(wrongHash),{decidedAt:"2026-09-18T00:10:00.000Z"});
  assert.equal(decision.allowed,false);
});

test("self-declared/tampered security properties cannot unlock private opaque reasoning",()=>{
  const attestation=createOpaqueReasoningTransportAttestation({
    requestId:"req.opaque.reasoning",
    payloadId:"payload.opaque.reasoning",
    transport
  });
  const tampered={...attestation,relayPlaintextAccess:true};
  const decision=evaluateReasoningTransport(base(tampered),{decidedAt:"2026-09-18T00:10:00.000Z"});
  assert.equal(decision.allowed,false);
  assert.ok(decision.reasons.includes("opaque-relay-private-crypto-attestation-required"));
});

test("opaque relay profile constructor rejects anything weaker than E2E metadata-only",()=>{
  assert.throws(()=>createReasoningTransportProfile({
    transportId:"mesh.opaque.bad-visibility",
    kind:"opaque-relay",
    persistence:"durable",
    relayVisibility:"plaintext-storage",
    encryption:"end-to-end",
    external:true,
    operator:"arca-mesh"
  }),/metadata/);
  assert.throws(()=>createReasoningTransportProfile({
    transportId:"mesh.opaque.bad-encryption",
    kind:"opaque-relay",
    persistence:"durable",
    relayVisibility:"metadata-only",
    encryption:"tls",
    external:true,
    operator:"arca-mesh"
  }),/end-to-end/);
});
