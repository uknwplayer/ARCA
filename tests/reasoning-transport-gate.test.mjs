import test from "node:test";
import assert from "node:assert/strict";
import {classifyPrivacyRecord} from "../packages/agent/src/privacy-classification.ts";
import {
  ARCA_REASONING_TRANSPORT_DECISION_FORMAT,
  ARCA_SECURE_REASONING_RESULT_FORMAT,
  ReasoningTransportDeniedError,
  SecureReasoningTransportClient,
  createReasoningTransportProfile,
  evaluateReasoningTransport,
  reasoningPayloadHash,
  verifyReasoningTransportDecision,
  verifyReasoningTransportProfile
} from "../packages/agent/src/reasoning-transport-gate.ts";

const T1="2026-09-17T22:55:00.000Z";
const T2="2026-09-17T22:56:00.000Z";

function publicClassification(recordId="payload.public"){
  return classifyPrivacyRecord({
    recordId,
    subjectType:"none",
    sourceType:"official-public",
    purpose:"reasoning over public procurement data",
    indicators:{sourcePubliclyAccessible:true,sourceOfficial:true}
  },{classifiedAt:T1});
}
function personalClassification(recordId="payload.personal"){
  return classifyPrivacyRecord({
    recordId,
    subjectType:"natural-person",
    sourceType:"user-provided",
    purpose:"private reasoning",
    indicators:{directIdentifier:true}
  },{classifiedAt:T1});
}
function sensitiveClassification(recordId="payload.sensitive"){
  return classifyPrivacyRecord({
    recordId,
    subjectType:"natural-person",
    sourceType:"user-provided",
    purpose:"private reasoning",
    indicators:{healthOrBiometric:true}
  },{classifiedAt:T1});
}
function localProfile(){
  return createReasoningTransportProfile({
    transportId:"local.reasoner",
    kind:"local",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"none",
    external:false,
    operator:"arca-local"
  });
}
function privateDirectProfile(){
  return createReasoningTransportProfile({
    transportId:"direct.reasoner",
    kind:"private-direct",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"tls",
    external:true,
    operator:"verified-provider"
  });
}
function repoProfile(){
  return createReasoningTransportProfile({
    transportId:"github.mailbox",
    kind:"repository-backed",
    persistence:"durable",
    relayVisibility:"plaintext-storage",
    encryption:"tls",
    external:true,
    operator:"github"
  });
}
function opaqueRelayProfile(){
  return createReasoningTransportProfile({
    transportId:"mesh.opaque",
    kind:"opaque-relay",
    persistence:"durable",
    relayVisibility:"metadata-only",
    encryption:"end-to-end",
    external:true,
    operator:"federated-mesh"
  });
}

test("transport profiles are constrained and tamper evident",()=>{
  const profile=repoProfile();
  assert.equal(verifyReasoningTransportProfile(profile),true);
  assert.equal(verifyReasoningTransportProfile({...profile,kind:"private-direct"}),false);
  assert.throws(()=>createReasoningTransportProfile({
    transportId:"bad.direct",
    kind:"private-direct",
    persistence:"durable",
    relayVisibility:"none",
    encryption:"tls",
    external:true
  }),/persistencia duravel/);
  assert.throws(()=>createReasoningTransportProfile({
    transportId:"bad.relay",
    kind:"opaque-relay",
    persistence:"ephemeral",
    relayVisibility:"plaintext-storage",
    encryption:"end-to-end",
    external:true
  }),/metadata/);
});

test("public payload may use repository-backed transport only with explicit public approval and verified provider",()=>{
  const payload={question:"summarize this public procurement notice",records:[{id:"PNCP-1"}]};
  const base={
    requestId:"req.public.1",
    payloadId:"payload.public",
    payload,
    classification:publicClassification(),
    transport:repoProfile(),
    purposeConfirmed:true,
    providerVerified:true
  };
  const denied=evaluateReasoningTransport({...base,publicPayloadApproved:false},{decidedAt:T2});
  assert.equal(denied.allowed,false);
  assert.ok(denied.reasons.includes("public-payload-approval-required"));

  const allowed=evaluateReasoningTransport({...base,publicPayloadApproved:true},{decidedAt:T2});
  assert.equal(allowed.format,ARCA_REASONING_TRANSPORT_DECISION_FORMAT);
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.payloadHash,reasoningPayloadHash(payload));
  assert.equal(allowed.payloadPersisted,false);
  assert.equal(allowed.executionAuthorized,false);
  assert.equal(verifyReasoningTransportDecision(allowed),true);
  assert.equal(JSON.stringify(allowed).includes("summarize this public procurement notice"),false);
});

test("non-public payload is never authorized onto repository-backed transport",()=>{
  const payload={question:"analyze private profile",person:{name:"Example Person"}};
  const decision=evaluateReasoningTransport({
    requestId:"req.personal.repo",
    payloadId:"payload.personal",
    payload,
    classification:personalClassification(),
    transport:repoProfile(),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true,
    publicPayloadApproved:true
  },{decidedAt:T2});
  assert.equal(decision.allowed,false);
  assert.ok(decision.reasons.includes("repository-backed-private-payload-prohibited"));
});

test("private-direct transport requires verified provider and explicit private processing authorization",()=>{
  const payload={question:"analyze this user-provided record",record:{name:"Example Person"}};
  const classification=personalClassification();

  const missingProvider=evaluateReasoningTransport({
    requestId:"req.private.provider",
    payloadId:"payload.personal",
    payload,
    classification,
    transport:privateDirectProfile(),
    purposeConfirmed:true,
    privateProcessingAuthorized:true
  },{decidedAt:T2});
  assert.equal(missingProvider.allowed,false);
  assert.ok(missingProvider.reasons.includes("provider-not-verified"));

  const missingAuthorization=evaluateReasoningTransport({
    requestId:"req.private.auth",
    payloadId:"payload.personal",
    payload,
    classification,
    transport:privateDirectProfile(),
    purposeConfirmed:true,
    providerVerified:true
  },{decidedAt:T2});
  assert.equal(missingAuthorization.allowed,false);
  assert.ok(missingAuthorization.reasons.includes("private-processing-authorization-required"));

  const allowed=evaluateReasoningTransport({
    requestId:"req.private.ok",
    payloadId:"payload.personal",
    payload,
    classification,
    transport:privateDirectProfile(),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true
  },{decidedAt:T2});
  assert.equal(allowed.allowed,true);
});

test("sensitive payload may stay local or use authorized private-direct, while opaque relay requires verified crypto attestation",()=>{
  const payload={question:"reason over sensitive record",record:{category:"health"}};
  const classification=sensitiveClassification();

  const local=evaluateReasoningTransport({
    requestId:"req.sensitive.local",
    payloadId:"payload.sensitive",
    payload,
    classification,
    transport:localProfile(),
    purposeConfirmed:true
  },{decidedAt:T2});
  assert.equal(local.allowed,true);

  const direct=evaluateReasoningTransport({
    requestId:"req.sensitive.direct",
    payloadId:"payload.sensitive",
    payload,
    classification,
    transport:privateDirectProfile(),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true
  },{decidedAt:T2});
  assert.equal(direct.allowed,true);

  const relay=evaluateReasoningTransport({
    requestId:"req.sensitive.mesh",
    payloadId:"payload.sensitive",
    payload,
    classification,
    transport:opaqueRelayProfile(),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true
  },{decidedAt:T2});
  assert.equal(relay.allowed,false);
  assert.ok(relay.reasons.includes("opaque-relay-private-crypto-attestation-required"));
});

test("secret-like payload structure or credential classification is denied even locally",()=>{
  const payload={prompt:"do not leak",apiKey:"secret-value"};
  const classification=publicClassification("payload.secret-key");
  const structural=evaluateReasoningTransport({
    requestId:"req.secret.structural",
    payloadId:"payload.secret-key",
    payload,
    classification,
    transport:localProfile(),
    purposeConfirmed:true
  },{decidedAt:T2});
  assert.equal(structural.allowed,false);
  assert.ok(structural.reasons.includes("secret-like-payload-key"));

  const credentialClassification=classifyPrivacyRecord({
    recordId:"payload.credential",
    subjectType:"none",
    sourceType:"user-provided",
    indicators:{secretOrCredential:true},
    purpose:"reasoning"
  },{classifiedAt:T1});
  const credential=evaluateReasoningTransport({
    requestId:"req.secret.classified",
    payloadId:"payload.credential",
    payload:{prompt:"credential material redacted by caller"},
    classification:credentialClassification,
    transport:localProfile(),
    purposeConfirmed:true
  },{decidedAt:T2});
  assert.equal(credential.allowed,false);
  assert.ok(credential.reasons.includes("secret-or-credential"));
});

test("classification must be valid and correlated to exact payload id",()=>{
  const payload={prompt:"hello"};
  assert.throws(()=>evaluateReasoningTransport({
    requestId:"req.mismatch",
    payloadId:"payload.other",
    payload,
    classification:publicClassification("payload.public"),
    transport:localProfile(),
    purposeConfirmed:true
  }),/payloadId/);

  const classification=publicClassification();
  assert.throws(()=>evaluateReasoningTransport({
    requestId:"req.tampered",
    payloadId:"payload.public",
    payload,
    classification:{...classification,purpose:"changed after classification"},
    transport:localProfile(),
    purposeConfirmed:true
  }),/adulterada/);
});

test("SecureReasoningTransportClient never invokes delegate when gate denies",async()=>{
  let calls=0;
  const client=new SecureReasoningTransportClient({
    transport:repoProfile(),
    send:async()=>{calls+=1;return {text:"should not run"}}
  });

  await assert.rejects(()=>client.run({
    requestId:"req.client.denied",
    payloadId:"payload.personal",
    payload:{prompt:"private"},
    classification:personalClassification(),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true,
    publicPayloadApproved:true
  },{decidedAt:T2}),error=>{
    assert.ok(error instanceof ReasoningTransportDeniedError);
    assert.equal(error.decision.allowed,false);
    return true;
  });
  assert.equal(calls,0);
});

test("SecureReasoningTransportClient passes only an authorized payload and preserves hash correlation",async()=>{
  let seen=null;
  const profile=privateDirectProfile();
  const payload={prompt:"private reasoning request",context:{caseId:"case-1"}};
  const client=new SecureReasoningTransportClient({
    transport:profile,
    send:async(value,context)=>{seen={value,context};return {text:"analysis"}}
  });
  const result=await client.run({
    requestId:"req.client.allowed",
    payloadId:"payload.personal",
    payload,
    classification:personalClassification(),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true
  },{decidedAt:T2});

  assert.equal(result.format,ARCA_SECURE_REASONING_RESULT_FORMAT);
  assert.equal(result.requestId,"req.client.allowed");
  assert.equal(result.payloadHash,reasoningPayloadHash(payload));
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.coreMutationPerformed,false);
  assert.deepEqual(seen.value,payload);
  assert.equal(seen.context.payloadHash,result.payloadHash);
  assert.equal(seen.context.decision.allowed,true);
});
