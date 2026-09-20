import test from "node:test";
import assert from "node:assert/strict";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {classifyPrivacyRecord} from "../packages/agent/src/privacy-classification.ts";
import {createReasoningTransportProfile,ReasoningTransportDeniedError} from "../packages/agent/src/reasoning-transport-gate.ts";
import {
  ARCA_REASONING_PROVIDER_RESULT_FORMAT,
  ARCA_REASONING_RESULT_FORMAT,
  ARCA_REASONING_PROBE_RESULT_FORMAT,
  ReasoningProviderRegistry,
  createReasoningProviderDescriptor,
  verifyReasoningProviderDescriptor,
  registerReasoningProviderCapability,
  probeReasoningProviderCapability
} from "../packages/agent/src/reasoning-capability.ts";

const T1="2026-09-17T23:02:00.000Z";
const T2="2026-09-17T23:03:00.000Z";

function localTransport(){
  return createReasoningTransportProfile({
    transportId:"local.reasoning",
    kind:"local",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"none",
    external:false,
    operator:"arca-local"
  });
}
function repoTransport(){
  return createReasoningTransportProfile({
    transportId:"github.reasoning",
    kind:"repository-backed",
    persistence:"durable",
    relayVisibility:"plaintext-storage",
    encryption:"tls",
    external:true,
    operator:"github"
  });
}
function directTransport(){
  return createReasoningTransportProfile({
    transportId:"direct.reasoning",
    kind:"private-direct",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"tls",
    external:true,
    operator:"verified-provider"
  });
}
function publicClassification(payloadId){
  return classifyPrivacyRecord({
    recordId:payloadId,
    subjectType:"none",
    sourceType:"official-public",
    purpose:"reasoning",
    indicators:{sourcePubliclyAccessible:true,sourceOfficial:true}
  },{classifiedAt:T1});
}
function personalClassification(payloadId){
  return classifyPrivacyRecord({
    recordId:payloadId,
    subjectType:"natural-person",
    sourceType:"user-provided",
    purpose:"private reasoning",
    indicators:{directIdentifier:true}
  },{classifiedAt:T1});
}
function providerResult(request,output){
  return {
    format:ARCA_REASONING_PROVIDER_RESULT_FORMAT,
    requestId:request.requestId,
    payloadId:request.payloadId,
    status:"completed",
    output,
    humanReviewRequired:true,
    coreMutationPerformed:false
  };
}

test("reasoning provider descriptor is transport-bound, credential-free and tamper evident",()=>{
  const descriptor=createReasoningProviderDescriptor({
    providerId:"reasoner.local",
    name:"Local Reasoner",
    provider:"arca",
    model:"fixture",
    kind:"model",
    transport:localTransport(),
    timeoutMs:5000,
    maxOutputBytes:4096
  });
  assert.equal(verifyReasoningProviderDescriptor(descriptor),true);
  assert.equal(descriptor.capability,"reasoning");
  assert.equal(descriptor.coreMutationAllowed,false);
  assert.equal("transport" in descriptor,false);
  assert.equal("endpoint" in descriptor,false);
  assert.equal(verifyReasoningProviderDescriptor({...descriptor,model:"changed"}),false);
});

test("local reasoning uses provider-independent request/result contract and preserves review boundary",async()=>{
  const providers=new ReasoningProviderRegistry();
  providers.register({
    providerId:"reasoner.local",
    provider:"arca",
    model:"fixture",
    transport:localTransport(),
    timeoutMs:5000,
    maxOutputBytes:8192
  },async request=>providerResult(request,{text:"local analysis",data:{ok:true}}));

  const payloadId="reasoning.local.1";
  const result=await providers.run("reasoner.local",{
    requestId:"req.reasoning.local.1",
    payloadId,
    instruction:"Analyze the local context.",
    context:{name:"Example Person"},
    responseFormat:"json",
    classification:personalClassification(payloadId),
    purposeConfirmed:true
  },{decidedAt:T2});

  assert.equal(result.format,ARCA_REASONING_RESULT_FORMAT);
  assert.equal(result.providerId,"reasoner.local");
  assert.equal(result.status,"completed");
  assert.equal(result.output.data.ok,true);
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.coreMutationPerformed,false);
  assert.equal(result.outputPersisted,false);
  assert.equal(result.privacyReclassificationRequired,true);
  assert.match(result.payloadHash,/^[a-f0-9]{64}$/);
  assert.match(result.transportDecisionHash,/^[a-f0-9]{64}$/);
});

test("repository-backed provider accepts explicitly approved public reasoning but rejects private reasoning before send",async()=>{
  let calls=0;
  const providers=new ReasoningProviderRegistry();
  providers.register({
    providerId:"reasoner.repo",
    provider:"remote-fixture",
    model:"fixture",
    transport:repoTransport(),
    timeoutMs:5000
  },async request=>{calls+=1;return providerResult(request,{data:{ok:true}})});

  const publicId="reasoning.repo.public";
  const publicResult=await providers.run("reasoner.repo",{
    requestId:"req.repo.public",
    payloadId:publicId,
    instruction:"Summarize this public record.",
    context:{noticeId:"PNCP-1"},
    classification:publicClassification(publicId),
    purposeConfirmed:true,
    providerVerified:true,
    publicPayloadApproved:true
  },{decidedAt:T2});
  assert.equal(publicResult.status,"completed");
  assert.equal(calls,1);

  const privateId="reasoning.repo.private";
  await assert.rejects(()=>providers.run("reasoner.repo",{
    requestId:"req.repo.private",
    payloadId:privateId,
    instruction:"Analyze private context.",
    context:{name:"Example Person"},
    classification:personalClassification(privateId),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true,
    publicPayloadApproved:true
  },{decidedAt:T2}),error=>{
    assert.ok(error instanceof ReasoningTransportDeniedError);
    assert.ok(error.decision.reasons.includes("repository-backed-private-payload-prohibited"));
    return true;
  });
  assert.equal(calls,1);
});

test("verified private-direct provider can process explicitly authorized personal reasoning",async()=>{
  let calls=0;
  const providers=new ReasoningProviderRegistry();
  providers.register({
    providerId:"reasoner.direct",
    provider:"remote-fixture",
    model:"fixture",
    transport:directTransport(),
    timeoutMs:5000
  },async request=>{calls+=1;return providerResult(request,{text:"private analysis"})});

  const payloadId="reasoning.direct.personal";
  const result=await providers.run("reasoner.direct",{
    requestId:"req.direct.personal",
    payloadId,
    instruction:"Analyze private context.",
    context:{name:"Example Person"},
    responseFormat:"text",
    classification:personalClassification(payloadId),
    purposeConfirmed:true,
    providerVerified:true,
    privateProcessingAuthorized:true
  },{decidedAt:T2});
  assert.equal(result.output.text,"private analysis");
  assert.equal(calls,1);
});

test("provider result correlation and output bounds fail closed",async()=>{
  const mismatch=new ReasoningProviderRegistry();
  mismatch.register({
    providerId:"reasoner.mismatch",
    provider:"arca",
    transport:localTransport(),
    timeoutMs:5000
  },async request=>({...providerResult(request,{data:{ok:true}}),requestId:"other"}));

  const payloadId="reasoning.mismatch";
  await assert.rejects(()=>mismatch.run("reasoner.mismatch",{
    requestId:"req.mismatch",
    payloadId,
    instruction:"Test correlation.",
    context:{},
    classification:publicClassification(payloadId),
    purposeConfirmed:true
  },{decidedAt:T2}),/requestId divergente/);

  const oversized=new ReasoningProviderRegistry();
  oversized.register({
    providerId:"reasoner.large",
    provider:"arca",
    transport:localTransport(),
    timeoutMs:5000,
    maxOutputBytes:1024
  },async request=>providerResult(request,{text:"x".repeat(2000)}));

  const largeId="reasoning.large";
  await assert.rejects(()=>oversized.run("reasoner.large",{
    requestId:"req.large",
    payloadId:largeId,
    instruction:"Test bounds.",
    context:{},
    classification:publicClassification(largeId),
    purposeConfirmed:true
  },{decidedAt:T2}),/output excede/);
});

test("reasoning provider can be registered as declared capability and promoted only by passing conformance probe",async()=>{
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({
    providerId:"reasoner.probe-ok",
    provider:"arca",
    model:"fixture",
    transport:localTransport(),
    timeoutMs:5000
  },async request=>providerResult(request,{
    data:request.context?.probe
      ? {marker:"ARCA-REASONING-PROBE-V1",sum:Number(request.context.a)+Number(request.context.b)}
      : {ok:true}
  }));

  const capabilities=new CapabilityRegistry();
  const passport=registerReasoningProviderCapability(capabilities,descriptor,{updatedAt:T1});
  assert.equal(passport.capabilities.find(item=>item.id==="reasoning").status,"declared");

  const probe=await probeReasoningProviderCapability({
    capabilityRegistry:capabilities,
    providerRegistry:providers,
    providerId:"reasoner.probe-ok",
    testedAt:T1,
    decidedAt:T2
  });
  assert.equal(probe.format,ARCA_REASONING_PROBE_RESULT_FORMAT);
  assert.equal(probe.passed,true);
  assert.equal(probe.rawOutputPersisted,false);
  assert.equal(probe.authorizationIncluded,false);
  assert.match(probe.evidenceHash,/^[a-f0-9]{64}$/);
  assert.equal(capabilities.getPassport("reasoner.probe-ok").capabilities.find(item=>item.id==="reasoning").status,"verified");
  assert.equal(capabilities.verifyAudit("reasoner.probe-ok"),true);
});

test("failed reasoning conformance probe degrades the capability without persisting raw provider output",async()=>{
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({
    providerId:"reasoner.probe-bad",
    provider:"arca",
    model:"fixture",
    transport:localTransport(),
    timeoutMs:5000
  },async request=>providerResult(request,{data:{marker:"WRONG",sum:99},secretNarrative:"not persisted by probe"}));

  const capabilities=new CapabilityRegistry();
  registerReasoningProviderCapability(capabilities,descriptor,{updatedAt:T1});
  const probe=await probeReasoningProviderCapability({
    capabilityRegistry:capabilities,
    providerRegistry:providers,
    providerId:"reasoner.probe-bad",
    testedAt:T1,
    decidedAt:T2
  });
  assert.equal(probe.passed,false);
  assert.equal(probe.rawOutputPersisted,false);
  assert.equal(JSON.stringify(probe).includes("secretNarrative"),false);
  assert.equal(capabilities.getPassport("reasoner.probe-bad").capabilities.find(item=>item.id==="reasoning").status,"degraded");
});

test("external reasoning conformance probe requires pre-existing endpoint/identity verification",async()=>{
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({
    providerId:"reasoner.external-probe",
    provider:"remote-fixture",
    model:"fixture",
    transport:directTransport(),
    timeoutMs:5000
  },async request=>providerResult(request,{data:{marker:"ARCA-REASONING-PROBE-V1",sum:5}}));
  const capabilities=new CapabilityRegistry();
  registerReasoningProviderCapability(capabilities,descriptor,{updatedAt:T1});
  await assert.rejects(()=>probeReasoningProviderCapability({
    capabilityRegistry:capabilities,
    providerRegistry:providers,
    providerId:"reasoner.external-probe",
    testedAt:T1,
    decidedAt:T2
  }),/identidade\/endpoint verificado/);
});


test("reasoning provider rejects absent output and pre-aborted execution before provider call",async()=>{
  const absent=new ReasoningProviderRegistry();
  absent.register({
    providerId:"reasoner.absent-output",
    provider:"arca",
    transport:localTransport(),
    timeoutMs:5000
  },async request=>providerResult(request,undefined));
  const absentId="reasoning.absent";
  await assert.rejects(()=>absent.run("reasoner.absent-output",{
    requestId:"req.absent",
    payloadId:absentId,
    instruction:"Return an output.",
    context:{},
    classification:publicClassification(absentId),
    purposeConfirmed:true
  },{decidedAt:T2}),/output ausente/);

  let calls=0;
  const aborted=new ReasoningProviderRegistry();
  aborted.register({
    providerId:"reasoner.pre-aborted",
    provider:"arca",
    transport:localTransport(),
    timeoutMs:5000
  },async request=>{calls+=1;return providerResult(request,{data:{ok:true}})});
  const controller=new AbortController();
  controller.abort();
  const abortedId="reasoning.aborted";
  await assert.rejects(()=>aborted.run("reasoner.pre-aborted",{
    requestId:"req.aborted",
    payloadId:abortedId,
    instruction:"Do not start.",
    context:{},
    classification:publicClassification(abortedId),
    purposeConfirmed:true
  },{decidedAt:T2,signal:controller.signal}),/reasoning-aborted/);
  assert.equal(calls,0);
});
