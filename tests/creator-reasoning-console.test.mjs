import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CapabilityRegistry,
  ARCA_REASONING_PROVIDER_RESULT_FORMAT,
  ReasoningProviderRegistry,
  createReasoningTransportProfile,
  registerReasoningProviderCapability
} from "../packages/agent/src/index.ts";
import {createCreatorConsoleWithReasoningProvider} from "../packages/workbench/src/creator-reasoning.ts";

const T1="2026-09-17T23:15:00.000Z";

test("Creator Console reaches verified local Reasoning Capability Contract with same requestId",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-creator-reasoning-"));
  const transport=createReasoningTransportProfile({
    transportId:"creator-console.local",
    kind:"local",
    persistence:"ephemeral",
    relayVisibility:"none",
    encryption:"none",
    external:false,
    operator:"arca-local"
  });
  const providers=new ReasoningProviderRegistry();
  const descriptor=providers.register({
    providerId:"reasoner.console.local",
    provider:"arca",
    model:"fixture",
    transport,
    timeoutMs:5000
  },async request=>({
    format:ARCA_REASONING_PROVIDER_RESULT_FORMAT,
    requestId:request.requestId,
    payloadId:request.payloadId,
    status:"completed",
    output:{text:`reasoning:${request.instruction}`,seenRequestId:request.requestId},
    humanReviewRequired:true,
    coreMutationPerformed:false
  }));
  const capabilities=new CapabilityRegistry();
  registerReasoningProviderCapability(capabilities,descriptor,{updatedAt:T1});
  capabilities.recordVerification({
    participantId:"reasoner.console.local",
    capabilityId:"reasoning",
    verifierId:"creator-console-test",
    passed:true,
    testedAt:T1,
    evidenceHash:"c".repeat(64),
    notes:"fixture"
  });

  const instance=createCreatorConsoleWithReasoningProvider({
    home,
    host:"127.0.0.1",
    port:0,
    providers,
    capabilities,
    reasoningOptions:{providerId:"reasoner.console.local"},
    bootstrapTtlMs:60_000,
    sessionTtlMs:120_000
  });
  const address=await instance.start();
  t.after(async()=>{await instance.stop();await rm(home,{recursive:true,force:true})});

  const unlockResponse=await fetch(`${address.url}/api/unlock`,{
    method:"POST",
    headers:{"Content-Type":"application/json","X-ARCA-Creator-Unlock":"1"},
    body:JSON.stringify({code:address.bootstrap.code})
  });
  const grant=await unlockResponse.json();
  assert.equal(unlockResponse.status,200);

  const response=await fetch(`${address.url}/api/chat`,{
    method:"POST",
    headers:{"Content-Type":"application/json","X-ARCA-Creator-Session":grant.token},
    body:JSON.stringify({message:"continue o trabalho",requestId:"req-console-reasoning-live"})
  });
  const result=await response.json();

  assert.equal(response.status,200);
  assert.equal(result.requestId,"req-console-reasoning-live");
  assert.equal(result.coreMutationPerformed,false);
  assert.equal(result.output.format,"arca-creator-reasoning-adapter-v1");
  assert.equal(result.output.requestId,"req-console-reasoning-live");
  assert.equal(result.output.provider.providerId,"reasoner.console.local");
  assert.equal(result.output.reasoningCapabilityVerified,true);
  assert.equal(result.output.privacyClass,"restricted");
  assert.equal(result.output.output.text,"reasoning:continue o trabalho");
  assert.equal(result.output.output.seenRequestId,"req-console-reasoning-live");
  assert.equal(result.output.humanReviewRequired,true);
});
