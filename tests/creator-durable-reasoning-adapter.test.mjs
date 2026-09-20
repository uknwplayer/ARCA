import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  DurableReasoningPendingCoordinator,
  HumanReviewQueue,
  createCreatorDurableReasoningHandlers
} from "../packages/agent/src/index.ts";

function shellCoordinator(){
  const coordinator=Object.create(DurableReasoningPendingCoordinator.prototype);
  coordinator.providerId="fixture";
  coordinator.providerRegistry={getDescriptor(){return null}};
  coordinator.start=async()=>{throw new Error("start should not be reached")};
  coordinator.poll=async()=>{throw new Error("poll should not be reached")};
  coordinator.collect=async()=>{throw new Error("collect should not be reached")};
  coordinator.store={home:"/tmp/arca-creator-durable-shell",list:async()=>{throw new Error("list should not be reached")}};
  return coordinator;
}

const bootstrapSession={
  sessionId:"creator-bootstrap-test",
  subject:"creator:primary",
  scopes:["creator.chat","creator.read"],
  authMethod:"local-bootstrap",
  issuedAt:"2026-09-18T00:00:00.000Z",
  expiresAt:"2026-09-18T01:00:00.000Z",
  credentialIdHash:"a".repeat(64)
};

test("Creator durable private reasoning refuses local bootstrap before any provider or pending call",async()=>{
  const handlers=createCreatorDurableReasoningHandlers(shellCoordinator());
  await assert.rejects(()=>handlers.chat({
    message:"private request",
    requestId:"req.creator.strong-required",
    session:bootstrapSession,
    context:{home:"/tmp/private"}
  }),/sessao forte/);
  await assert.rejects(()=>handlers.status({
    requestId:"req.creator.strong-required",
    session:bootstrapSession,
    context:{home:"/tmp/private"}
  }),/sessao forte/);
  await assert.rejects(()=>handlers.collect({
    requestId:"req.creator.strong-required",
    session:bootstrapSession,
    context:{home:"/tmp/private"}
  }),/sessao forte/);
  await assert.rejects(()=>handlers.list({
    session:bootstrapSession,
    context:{home:"/tmp/private"}
  }),/sessao forte/);
});


test("Creator durable collect materializes reasoning output review and remains pending until approval",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-creator-review-adapter-"));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const requestId="req.creator.review.gate";
  const payloadId="creator-chat."+"a".repeat(64);
  const coordinator=Object.create(DurableReasoningPendingCoordinator.prototype);
  coordinator.providerId="reasoner.fixture";
  coordinator.providerRegistry={getDescriptor(id){return id==="reasoner.fixture"?{
    providerId:id,provider:"fixture",model:"fixture-v1",external:true,
    transportId:"mesh.fixture",transportKind:"opaque-relay",descriptorHash:"1".repeat(64)
  }:null}};
  coordinator.store={home,list:async()=>[]};
  coordinator.collect=async()=>({
    state:"completed",requestId,payloadId,
    record:{privacyClass:"restricted",classificationHash:"2".repeat(64),payloadHash:"3".repeat(64)},
    result:{
      format:"arca-verified-durable-opaque-reasoning-result-v1",
      version:"1.0.0",
      requestId,payloadId,providerId:"reasoner.fixture",
      providerDescriptorHash:"1".repeat(64),
      opaqueRelayAttestationHash:"4".repeat(64),
      transportDecisionHash:"5".repeat(64),
      executionEvidenceHash:"6".repeat(64),
      resultHash:"7".repeat(64),
      humanReviewRequired:true,coreMutationPerformed:false,privacyReclassificationRequired:true,
      reasoning:{
        format:"arca-reasoning-result-v1",version:"1.0.0",requestId,payloadId,
        providerId:"reasoner.fixture",providerDescriptorHash:"1".repeat(64),
        transportId:"mesh.fixture",transportDecisionHash:"5".repeat(64),
        payloadHash:"3".repeat(64),status:"completed",responseFormat:"json",
        output:{analysis:"semantic result requiring approval"},
        outputBytes:45,outputPersisted:false,privacyReclassificationRequired:true,
        humanReviewRequired:true,coreMutationPerformed:false
      }
    }
  });
  coordinator.poll=async()=>({state:"completed",requestId,payloadId,readySequence:1,terminalResultHash:"8".repeat(64),finalResultHash:"7".repeat(64)});
  coordinator.status=record=>({
    state:record.state,requestId:record.requestId,payloadId:record.payloadId,
    providerId:"reasoner.fixture",readySequence:record.readySequence??1,
    terminalResultHash:record.terminalResultHash??"8".repeat(64),
    finalResultHash:record.finalResultHash??"7".repeat(64)
  });
  const handlers=createCreatorDurableReasoningHandlers(coordinator);
  const strongSession={
    format:"arca-creator-session-v1",sessionId:"creator-review-test",subject:"creator:primary",
    scopes:["creator.chat","creator.read","creator.review"],authMethod:"webauthn",
    credentialIdHash:"9".repeat(64),issuedAt:"2026-09-18T00:00:00.000Z",expiresAt:"2026-09-18T00:30:00.000Z"
  };

  const collected=await handlers.collect({requestId,session:strongSession,context:{home}});
  assert.equal(collected.state,"awaiting-human-review");
  assert.equal(collected.review.authorizedToContinue,false);
  assert.match(collected.review.reviewId,/^HRV-/);
  assert.equal(collected.output.analysis,"semantic result requiring approval");
  assert.equal(collected.privacyReclassificationRequired,false);

  const queue=new HumanReviewQueue(home);
  const pending=(await queue.list({status:"pending"}))[0];
  assert.equal(pending.reviewId,collected.review.reviewId);
  assert.equal(pending.payload.privacyClassification.privacyClass,"restricted");
  await queue.resolve({
    reviewId:pending.reviewId,reviewerId:"creator:primary",decision:"approve",
    reason:"approved for continuation",expectedRecordHash:pending.recordHash
  });

  const status=await handlers.status({requestId,session:strongSession,context:{home}});
  assert.equal(status.state,"completed");
  assert.equal(status.review.authorizedToContinue,true);
});
