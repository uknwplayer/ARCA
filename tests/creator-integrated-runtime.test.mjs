import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CapabilityRegistry,
  DurableReasoningPendingCoordinator,
  DurableReasoningPendingRuntime
} from "../packages/agent/src/index.ts";
import {createCreatorIntegratedRuntime} from "../packages/workbench/src/creator-integrated-runtime.ts";

class FakeWorkflowClient{
  constructor(){this.submitCalls=[];this.transport={getResult:async()=>null}}
  async submit(job){this.submitCalls.push(structuredClone(job));return {jobId:job.jobId,requestId:job.requestId}}
  async waitForResult(job){return {format:"arca-result-v1",protocolVersion:3,jobId:job.jobId,requestId:job.requestId,status:"completed",output:{ok:true}}}
}

function registry(){
  const value=new CapabilityRegistry();const at="2026-09-18T01:40:00.000Z";
  value.registerParticipant({participantId:"worker.repo",kind:"worker",provider:"arca",capabilities:["node","repository"]},{updatedAt:at});
  value.recordVerification({participantId:"worker.repo",capabilityId:"node",passed:true,testedAt:at});
  value.recordVerification({participantId:"worker.repo",capabilityId:"repository",passed:true,testedAt:at});
  return value
}

function fakeCoordinator(home,capabilityRegistry){
  const coordinator=Object.create(DurableReasoningPendingCoordinator.prototype);
  coordinator.providerId="reasoner.integrated.fixture";
  coordinator.capabilityRegistry=capabilityRegistry;
  coordinator.providerRegistry={getDescriptor(id){return id===coordinator.providerId?{providerId:id,provider:"fixture",model:"fixture-v1",external:true,transportId:"mesh.fixture",transportKind:"opaque-relay",descriptorHash:"1".repeat(64)}:null}};
  coordinator.store={home,init:async()=>{},list:async()=>[]};
  coordinator.start=async input=>({format:"arca-durable-reasoning-pending-status-v1",version:"1.0.0",state:"awaiting-reasoning",requestId:input.requestId,payloadId:input.payloadId,providerId:coordinator.providerId,readySequence:0,readyPending:false,terminalResultHash:null,finalResultHash:null,executionEvidenceHash:null});
  coordinator.poll=async()=>{throw new Error("poll should not be reached without pending records")};
  coordinator.collect=async()=>{throw new Error("collect should not be reached without pending records")};
  return coordinator
}

async function jsonFetch(url,{method="GET",body,token,headers={}}={}){
  const response=await fetch(url,{method,headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(token?{"X-ARCA-Creator-Session":token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json();return {response,payload}
}

test("integrated Creator runtime wires console, workflow planning, review autonomy and bound reasoning under one ARCA_HOME",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-creator-integrated-"));const capabilities=registry();const coordinator=fakeCoordinator(home,capabilities);const client=new FakeWorkflowClient();
  const runtime=createCreatorIntegratedRuntime({home,reasoningCoordinator:coordinator,workflowClient:client,capabilityRegistry:capabilities,host:"localhost",port:0,reasoningPendingIntervalMs:1000,reviewDispatchRecoveryIntervalMs:1000});
  t.after(async()=>{await runtime.stop().catch(()=>{});await rm(home,{recursive:true,force:true})});

  assert.equal(runtime.status().running,false);
  assert.equal(runtime.proposals.workflow,runtime.workflow);
  assert.equal(runtime.workflowReasoning.proposals,runtime.proposals);
  assert.equal(runtime.workflowReasoning.reviewGate,runtime.reasoningOutputReviewGate);
  assert.equal(runtime.reviewRuntime.pointerStore,runtime.pointerStore);

  const address=await runtime.start();
  assert.equal(runtime.status().running,true);
  assert.equal(runtime.status().localOnly,true);
  assert.equal(runtime.status().address.passkeyUrl,address.passkeyUrl);

  const shell=await fetch(address.passkeyUrl+"/");assert.equal(shell.status,200);
  const grant=await jsonFetch(address.passkeyUrl+"/api/unlock",{method:"POST",body:{code:address.bootstrap.code},headers:{"X-ARCA-Creator-Unlock":"1"}});
  assert.equal(grant.response.status,200);
  const state=await jsonFetch(address.passkeyUrl+"/api/state",{token:grant.payload.token});
  assert.equal(state.response.status,200);
  assert.equal(state.payload.workflows.structuredProposal,true);
  assert.equal(state.payload.workflows.reasoningBinding,true);
  assert.equal(state.payload.agentAvailable,true);

  const scan=await runtime.runOnce();
  assert.equal(scan.format,"arca-creator-integrated-runtime-v1");
  assert.equal(scan.reasoning.scanned,0);
  assert.equal(scan.review.format,"arca-review-autonomy-scan-v1");
  assert.equal(client.submitCalls.length,0);

  await runtime.stop();
  assert.equal(runtime.status().running,false);
});

test("durable reasoning runtime filter leaves unowned ready work untouched",async()=>{
  const coordinator=Object.create(DurableReasoningPendingCoordinator.prototype);
  const records=[
    {requestId:"req-owned",state:"result-ready",readyPending:true,readySequence:1,payloadId:"payload-owned",providerId:"reasoner",terminalResultHash:"a".repeat(64),recordHash:"b".repeat(64)},
    {requestId:"req-unowned",state:"result-ready",readyPending:true,readySequence:1,payloadId:"payload-unowned",providerId:"reasoner",terminalResultHash:"c".repeat(64),recordHash:"d".repeat(64)}
  ];
  const acked=[];coordinator.store={list:async()=>records,ackReady:async(requestId)=>{acked.push(requestId);return records.find(item=>item.requestId===requestId)}};
  coordinator.poll=async()=>{throw new Error("result-ready records should not require poll")};
  const events=[];
  const runtime=new DurableReasoningPendingRuntime(coordinator,{intervalMs:1000,shouldHandle:record=>record.requestId==="req-owned",onReady:event=>events.push(event)});
  const scan=await runtime.runOnce();
  assert.equal(scan.scanned,2);
  assert.equal(scan.ignored,1);
  assert.deepEqual(events.map(item=>item.requestId),["req-owned"]);
  assert.deepEqual(acked,["req-owned"]);
  assert.equal(scan.events.some(item=>item.requestId==="req-unowned"),false);
});
