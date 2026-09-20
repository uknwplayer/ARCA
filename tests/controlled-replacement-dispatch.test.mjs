import test from "node:test";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {
  CognitiveSubstitutionRouter,
  ParticipantRuntimeBindingRegistry,
  RoleContractRegistry
} from "../packages/agent/src/cognitive-substitution.ts";
import {RoleConformanceRegistry} from "../packages/agent/src/role-conformance.ts";
import {ReconciledSubstitutionCoordinator} from "../packages/agent/src/reconciled-substitution.ts";
import {ControlledReplacementDispatcher} from "../packages/agent/src/controlled-replacement-dispatch.ts";
import {CrossPeerRequestOwnershipStore} from "../src/machine-bridge/cross-peer-request-ownership.mjs";
import {ExecutionIdentityStore} from "../src/machine-bridge/execution-identity.mjs";
import {ReconciledFailoverController} from "../src/machine-bridge/reconciled-failover.mjs";
import {MeshIdentityTrustStore,generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";

const T0=new Date("2026-09-19T23:00:00.000Z");
const HASH_A="a".repeat(64);
const HASH_B="b".repeat(64);
const HASH_C="c".repeat(64);
const HASH_D="d".repeat(64);
const HASH_E="e".repeat(64);
const HASH_F="f".repeat(64);
const REQUEST={requestId:"logical-req-1"};

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function hashJson(value){return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}

function addParticipant(capabilities,bindings,{participantId,runtimeId=participantId}){
  capabilities.registerParticipant({
    participantId,
    kind:"agent",
    provider:"fixture",
    model:"v1",
    capabilities:["research"]
  },{updatedAt:T0});
  capabilities.recordVerification({participantId,capabilityId:"research",passed:true,testedAt:T0});
  const passport=capabilities.getPassport(participantId);
  bindings.bindPassport(passport,{runtimeKind:"custom",runtimeId},{boundAt:T0});
  return passport;
}

function addConformance(registry,role,passport,profile){
  registry.recordVerification({
    role,
    passport,
    profileId:profile.profileId,
    testedAt:T0,
    verifierId:"controlled-replacement-test",
    fixtureResults:[{
      fixtureId:"baseline",
      executionState:"completed",
      schemaPassed:true,
      outputHash:HASH_A,
      outputBytes:32,
      assertionResults:[{type:"json-subset",passed:true,reason:"json-subset"}]
    }]
  });
}

async function fixture({dispatchAttempt=null}={}){
  const root=await mkdtemp(join(tmpdir(),"arca-controlled-replacement-"));
  const executionStore=await new ExecutionIdentityStore({root:join(root,"executions")}).init();
  const ownershipStore=await new CrossPeerRequestOwnershipStore({root:join(root,"ownership")}).init();

  const capabilities=new CapabilityRegistry();
  const bindings=new ParticipantRuntimeBindingRegistry();
  const primary=addParticipant(capabilities,bindings,{participantId:"agent-a",runtimeId:"runtime-a"});
  const backup=addParticipant(capabilities,bindings,{participantId:"agent-b",runtimeId:"runtime-b"});

  const roles=new RoleContractRegistry();
  const role=roles.register({
    roleId:"research.public",
    requiredCapabilities:["research"],
    allowedKinds:["agent"],
    behaviorEnvelope:{requiredTopLevelKeys:["requestId","status"],requireRequestCorrelation:true}
  });

  const conformance=new RoleConformanceRegistry();
  const profile=conformance.registerProfile(role,{
    profileId:"research.public.conformance.v1",
    version:"1",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    timeoutMs:2000,
    maxEvidenceAgeMs:24*60*60*1000,
    inputSchema:{type:"object"},
    outputSchema:{type:"object"},
    fixtures:[{
      fixtureId:"baseline",
      input:{requestId:"probe"},
      assertions:[{type:"json-subset",expected:{status:"completed"}}]
    }]
  });
  addConformance(conformance,role,primary,profile);
  addConformance(conformance,role,backup,profile);

  const signer=generateMeshNodeIdentity("relay-origin");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);

  let routerDispatchCalls=0;
  let authorizationId="auth-v1";
  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    receiptSigner:signer,
    trustStore,
    isAvailable:async()=>true,
    authorize:async()=>({allowed:true,authorizationId}),
    dispatch:async()=>{
      routerDispatchCalls+=1;
      throw new Error("controlled dispatcher must not call router dispatch");
    },
    now:()=>T0
  });

  const execution=(await executionStore.create({
    logicalRequestId:"logical-req-1",
    roleId:role.roleId,
    roleContractHash:role.contractHash,
    requestHash:hashJson(REQUEST),
    authorizationBindingHash:HASH_B,
    idempotencyClass:"side-effecting",
    createdAt:T0
  })).identity;

  const first=(await executionStore.createAttempt(execution.executionId,{
    participantId:"agent-a",
    participantDescriptorHash:primary.descriptorHash,
    runtimeBindingHash:bindings.get("agent-a").bindingHash,
    roleConformanceEvidenceHash:conformance.getEvidence(role.roleId,"agent-a").evidenceHash,
    requestId:"remote-req-1",
    jobId:"remote-job-1",
    payloadHash:HASH_F,
    selectedNodeId:"peer-a",
    ownerBindingHash:HASH_C,
    plannedAt:T0
  })).attempt;
  await executionStore.markAttemptStarted(execution.executionId,first.attemptId,{startedAt:T0});

  const failoverController=new ReconciledFailoverController({
    executionStore,
    reconciliationController:{
      async reconcile(){
        return {
          format:"arca-remote-evidence-reconciliation-v1",
          version:1,
          state:"rejected",
          requestId:"remote-req-1",
          jobId:"remote-job-1",
          selectedNodeId:"peer-a",
          localStateBefore:"in-flight",
          localStateAfter:"in-flight",
          remoteEvidenceState:"rejected",
          decisionStatementHash:HASH_D,
          completionStatementHash:null,
          resultHash:null,
          rejectionCategory:"unavailable",
          reconciledAt:T0.toISOString(),
          reDispatchPerformed:false,
          automaticFailoverAllowed:false
        };
      }
    },
    receiptSigner:signer,
    trustStore,
    now:()=>T0
  });

  const coordinator=new ReconciledSubstitutionCoordinator({
    router,
    failoverController,
    ownershipStore,
    relayNodeId:"relay-origin",
    buildAttemptDescriptor:async()=>({
      requestId:"remote-req-2",
      jobId:"remote-job-2",
      payloadHash:HASH_E,
      selectedNodeId:"peer-b"
    }),
    now:()=>T0
  });

  const prepared=await coordinator.prepare(execution.executionId,{request:REQUEST});
  let networkCalls=0;
  const dispatcher=new ControlledReplacementDispatcher({
    router,
    executionStore,
    ownershipStore,
    dispatchAttempt:dispatchAttempt??(async context=>{
      networkCalls+=1;
      assert.equal(context.attempt.participantId,"agent-b");
      assert.equal(context.binding.runtimeId,"runtime-b");
      assert.equal(context.preparation.preparationHash,undefined);
      return {
        requestId:context.attempt.requestId,
        jobId:context.attempt.jobId,
        status:"completed",
        value:"ok"
      };
    }),
    now:()=>T0
  });

  return {
    root,executionStore,ownershipStore,capabilities,bindings,conformance,profile,roles,role,
    signer,trustStore,router,failoverController,coordinator,dispatcher,execution,first,prepared,backup,
    getNetworkCalls:()=>networkCalls,
    getRouterDispatchCalls:()=>routerDispatchCalls,
    setAuthorizationId:value=>{authorizationId=value}
  };
}

test("coordinator persists durable replacement preparation evidence",async()=>{
  const f=await fixture();
  try{
    const status=await f.executionStore.status(f.execution.executionId);
    const preparation=await f.executionStore.getReplacementPreparation(f.execution.executionId,status.latestAttempt.attempt.attemptId);
    assert.ok(preparation);
    assert.equal(preparation.previousParticipantId,"agent-a");
    assert.equal(preparation.selectedParticipantId,"agent-b");
    assert.equal(preparation.runtimeId,"runtime-b");
    assert.equal(preparation.ownerBindingHash,status.latestAttempt.attempt.ownerBindingHash);
    assert.equal(preparation.requestHash,f.execution.requestHash);
    assert.equal(preparation.roleContractHash,f.execution.roleContractHash);
    assert.match(preparation.authorizationDecisionHash,/^[a-f0-9]{64}$/);
    assert.match(preparation.selectionEvidenceHash,/^[a-f0-9]{64}$/);
    assert.equal(preparation.recordHash,f.prepared.preparationRecordHash);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("controlled dispatcher performs one network call and closes both execution and ownership ledgers",async()=>{
  const f=await fixture();
  try{
    const result=await f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST});
    assert.equal(result.state,"completed");
    assert.equal(result.networkDispatchPerformed,true);
    assert.equal(result.automaticRetryPerformed,false);
    assert.equal(f.getNetworkCalls(),1);
    assert.equal(f.getRouterDispatchCalls(),0);

    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.latestAttempt.state,"completed");
    assert.equal(status.latestAttempt.resultHash,result.resultHash);
    const ownership=await f.ownershipStore.status("remote-req-2");
    assert.equal(ownership.state,"completed");
    assert.equal(ownership.resultHash,result.resultHash);

    const gate=await f.executionStore.getDispatchGate(f.execution.executionId,status.latestAttempt.attempt.attemptId);
    assert.ok(gate);
    assert.equal(gate.participantId,"agent-b");
    assert.equal(gate.runtimeBindingHash,status.latestAttempt.attempt.runtimeBindingHash);

    const replay=await f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST});
    assert.equal(replay.state,"completed");
    assert.equal(replay.networkDispatchPerformed,false);
    assert.equal(f.getNetworkCalls(),1);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("transport failure becomes uncertain and a later call never redispatches",async()=>{
  let calls=0;
  const f=await fixture({
    dispatchAttempt:async()=>{
      calls+=1;
      const error=new TypeError("network fetch failed");
      throw error;
    }
  });
  try{
    await assert.rejects(
      ()=>f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST}),
      error=>error?.code==="ARCA_REPLACEMENT_DISPATCH_UNCERTAIN"&&error.failureCategory==="transport"
    );
    assert.equal(calls,1);
    assert.equal((await f.ownershipStore.status("remote-req-2")).state,"uncertain");
    assert.equal((await f.executionStore.status(f.execution.executionId)).latestAttempt.state,"started");

    const retry=await f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST});
    assert.equal(retry.state,"uncertain");
    assert.equal(retry.networkDispatchPerformed,false);
    assert.equal(retry.automaticRetryPerformed,false);
    assert.equal(calls,1);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("pre-existing dispatch-started evidence blocks a second network call",async()=>{
  let calls=0;
  const f=await fixture({dispatchAttempt:async()=>{calls+=1;return {status:"completed"}}});
  try{
    const status=await f.executionStore.status(f.execution.executionId);
    const attempt=status.latestAttempt.attempt;
    await f.executionStore.markAttemptStarted(f.execution.executionId,attempt.attemptId,{startedAt:T0});
    await f.ownershipStore.markDispatchStarted(attempt.requestId,{now:T0});

    const result=await f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST});
    assert.equal(result.state,"already-dispatched");
    assert.equal(result.networkDispatchPerformed,false);
    assert.equal(calls,0);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("runtime binding drift fails before dispatch evidence is created",async()=>{
  let calls=0;
  const f=await fixture({dispatchAttempt:async()=>{calls+=1;return {status:"completed"}}});
  try{
    f.bindings.remove("agent-b");
    f.bindings.bindPassport(f.backup,{runtimeKind:"custom",runtimeId:"runtime-b-changed"},{boundAt:T0});

    await assert.rejects(
      ()=>f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST}),
      error=>error?.code==="ARCA_REPLACEMENT_PREFLIGHT_DRIFT"
    );
    assert.equal(calls,0);
    assert.equal((await f.ownershipStore.status("remote-req-2")).state,"reserved");
    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.latestAttempt.state,"planned");
    assert.equal(await f.executionStore.getDispatchGate(f.execution.executionId,status.latestAttempt.attempt.attemptId),null);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("authorization denial at dispatch time fails closed before network dispatch",async()=>{
  let calls=0;
  const f=await fixture({dispatchAttempt:async()=>{calls+=1;return {status:"completed"}}});
  try{
    f.router.authorize=async()=>({allowed:false});
    await assert.rejects(
      ()=>f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST}),
      error=>error?.code==="ARCA_SUBSTITUTION_NOT_AUTHORIZED"
    );
    assert.equal(calls,0);
    assert.equal((await f.ownershipStore.status("remote-req-2")).state,"reserved");
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("result correlation mismatch is treated as uncertain and never replayed",async()=>{
  let calls=0;
  const f=await fixture({
    dispatchAttempt:async()=>{
      calls+=1;
      return {requestId:"wrong-request",jobId:"remote-job-2",status:"completed"};
    }
  });
  try{
    await assert.rejects(
      ()=>f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST}),
      error=>error?.code==="ARCA_REPLACEMENT_DISPATCH_UNCERTAIN"&&error.failureCategory==="protocol"
    );
    assert.equal(calls,1);
    assert.equal((await f.ownershipStore.status("remote-req-2")).state,"uncertain");
    const retry=await f.dispatcher.dispatch(f.execution.executionId,{request:REQUEST});
    assert.equal(retry.state,"uncertain");
    assert.equal(calls,1);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("dispatch gate is idempotent across a pre-network retry when authorization is unchanged",async()=>{
  let calls=0;
  const f=await fixture({dispatchAttempt:async()=>{calls+=1;return {requestId:"remote-req-2",jobId:"remote-job-2",status:"completed"}}});
  try{
    const status=await f.executionStore.status(f.execution.executionId);
    const attempt=status.latestAttempt.attempt;
    const preparation=await f.executionStore.getReplacementPreparation(f.execution.executionId,attempt.attemptId);
    const preflight=await f.router.preflight(REQUEST,{
      roleId:f.execution.roleId,
      requiredParticipantId:"agent-b",
      excludedParticipantIds:["agent-a"],
      authorizationContext:{controlledReplacementDispatch:true}
    });
    const authHash=hashJson({allowed:preflight.authorization.allowed,authorizationId:preflight.authorization.authorizationId});
    const first=await f.executionStore.storeDispatchGate(f.execution.executionId,attempt.attemptId,{
      preparationHash:preparation.recordHash,
      participantId:attempt.participantId,
      participantDescriptorHash:attempt.participantDescriptorHash,
      runtimeBindingHash:attempt.runtimeBindingHash,
      roleConformanceEvidenceHash:attempt.roleConformanceEvidenceHash,
      authorizationDecisionHash:authHash,
      authorizedAt:T0
    });
    const second=await f.executionStore.storeDispatchGate(f.execution.executionId,attempt.attemptId,{
      preparationHash:preparation.recordHash,
      participantId:attempt.participantId,
      participantDescriptorHash:attempt.participantDescriptorHash,
      runtimeBindingHash:attempt.runtimeBindingHash,
      roleConformanceEvidenceHash:attempt.roleConformanceEvidenceHash,
      authorizationDecisionHash:authHash,
      authorizedAt:new Date(T0.getTime()+1000)
    });
    assert.equal(first.created,true);
    assert.equal(second.created,false);
    assert.equal(second.gate.recordHash,first.gate.recordHash);
    assert.equal(calls,0);
  }finally{await rm(f.root,{recursive:true,force:true})}
});
