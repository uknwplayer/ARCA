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
import {CrossPeerRequestOwnershipStore} from "../src/machine-bridge/cross-peer-request-ownership.mjs";
import {ExecutionIdentityStore} from "../src/machine-bridge/execution-identity.mjs";
import {ReconciledFailoverController} from "../src/machine-bridge/reconciled-failover.mjs";
import {MeshIdentityTrustStore,generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";

const T0=new Date("2026-09-19T22:00:00.000Z");
const HASH_A="a".repeat(64);
const HASH_B="b".repeat(64);
const HASH_C="c".repeat(64);
const HASH_D="d".repeat(64);
const HASH_E="e".repeat(64);
const HASH_F="f".repeat(64);

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function hashJson(value){return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}
const LOGICAL_REQUEST={requestId:"logical-req-1"};

function addParticipant(capabilities,bindings,{participantId,runtimeId=participantId}){
  capabilities.registerParticipant({
    participantId,
    kind:"agent",
    provider:"fixture",
    model:"v1",
    capabilities:["research"]
  },{updatedAt:T0});
  capabilities.recordVerification({
    participantId,
    capabilityId:"research",
    passed:true,
    testedAt:T0
  });
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
    verifierId:"reconciled-substitution-test",
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

async function fixture({withBackup=true}={}){
  const root=await mkdtemp(join(tmpdir(),"arca-reconciled-substitution-"));
  const executionStore=await new ExecutionIdentityStore({root:join(root,"executions")}).init();
  const ownershipStore=await new CrossPeerRequestOwnershipStore({root:join(root,"ownership")}).init();

  const capabilities=new CapabilityRegistry();
  const bindings=new ParticipantRuntimeBindingRegistry();
  const primary=addParticipant(capabilities,bindings,{participantId:"agent-a"});
  const backup=withBackup?addParticipant(capabilities,bindings,{participantId:"agent-b"}):null;

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
  if(backup)addConformance(conformance,role,backup,profile);

  const signer=generateMeshNodeIdentity("relay-origin");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);

  let dispatchCalls=0;
  const authContexts=[];
  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    receiptSigner:signer,
    trustStore,
    isAvailable:async()=>true,
    authorize:async context=>{
      authContexts.push(context);
      return {allowed:true,authorizationId:"failover-preflight"};
    },
    dispatch:async()=>{
      dispatchCalls+=1;
      throw new Error("coordinator must not dispatch");
    },
    now:()=>T0
  });

  const execution=(await executionStore.create({
    logicalRequestId:"logical-req-1",
    roleId:"research.public",
    roleContractHash:role.contractHash,
    requestHash:hashJson(LOGICAL_REQUEST),
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
      async reconcile(requestId){
        assert.equal(requestId,"remote-req-1");
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
    buildAttemptDescriptor:async({participant})=>({
      requestId:"remote-req-2",
      jobId:"remote-job-2",
      payloadHash:HASH_E,
      selectedNodeId:participant.participantId==="agent-b"?"peer-b":"peer-unexpected"
    }),
    now:()=>T0
  });

  return {
    root,executionStore,ownershipStore,capabilities,bindings,conformance,profile,roles,role,
    signer,trustStore,router,failoverController,coordinator,execution,first,authContexts,
    getDispatchCalls:()=>dispatchCalls
  };
}

test("router preflight excludes previous participant and performs authorization without dispatch",async()=>{
  const f=await fixture();
  try{
    const preflight=await f.router.preflight(
      LOGICAL_REQUEST,
      {roleId:"research.public",excludedParticipantIds:["agent-a"],authorizationContext:{purpose:"failover"}}
    );
    assert.equal(preflight.resolved.participant.participantId,"agent-b");
    assert.deepEqual(preflight.excludedParticipantIds,["agent-a"]);
    assert.equal(preflight.authorization.authorizationId,"failover-preflight");
    assert.equal(f.getDispatchCalls(),0);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("coordinator authorizes, selects a different conformant participant and prepares ownership-bound attempt without dispatch",async()=>{
  const f=await fixture();
  try{
    const prepared=await f.coordinator.prepare(f.execution.executionId,{
      request:LOGICAL_REQUEST,
      authorizationContext:{source:"reconciled-failover"}
    });
    assert.equal(prepared.state,"prepared");
    assert.equal(prepared.previousParticipantId,"agent-a");
    assert.equal(prepared.selectedParticipantId,"agent-b");
    assert.equal(prepared.automaticDispatchPerformed,false);
    assert.equal(prepared.dispatchAuthorizedByPreparation,false);
    assert.match(prepared.failoverReceiptHash,/^[a-f0-9]{64}$/);
    assert.match(prepared.selectionEvidenceHash,/^[a-f0-9]{64}$/);
    assert.equal(f.getDispatchCalls(),0);

    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,2);
    assert.equal(status.attempts[0].state,"superseded");
    assert.equal(status.attempts[1].state,"planned");
    assert.equal(status.attempts[1].attempt.participantId,"agent-b");
    assert.equal(status.attempts[1].attempt.ownerBindingHash,prepared.ownerBindingHash);

    const ownership=await f.ownershipStore.status("remote-req-2");
    assert.equal(ownership.state,"reserved");
    assert.equal(ownership.selectedNodeId,"peer-b");
    assert.equal(ownership.bindingHash,prepared.ownerBindingHash);

    const auth=f.authContexts.at(-1);
    assert.equal(auth.participant.participantId,"agent-b");
    assert.equal(auth.authorizationContext.executionId,f.execution.executionId);
    assert.equal(auth.authorizationContext.failoverReceiptHash,prepared.failoverReceiptHash);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("preparation is idempotent after a replacement attempt already exists",async()=>{
  const f=await fixture();
  try{
    const first=await f.coordinator.prepare(f.execution.executionId,{request:LOGICAL_REQUEST});
    const second=await f.coordinator.prepare(f.execution.executionId,{request:LOGICAL_REQUEST});
    assert.equal(first.state,"prepared");
    assert.equal(second.state,"already-prepared");
    assert.equal(second.nextAttemptId,first.nextAttemptId);
    assert.equal(second.selectedParticipantId,"agent-b");
    assert.equal((await f.executionStore.status(f.execution.executionId)).attemptCount,2);
    assert.equal(f.getDispatchCalls(),0);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("durable failover authorization survives temporary absence of a replacement candidate",async()=>{
  const f=await fixture({withBackup:false});
  try{
    await assert.rejects(
      ()=>f.coordinator.prepare(f.execution.executionId,{request:LOGICAL_REQUEST}),
      error=>error?.code==="ARCA_SUBSTITUTION_NO_ELIGIBLE_PARTICIPANT"
    );
    let status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,1);
    assert.equal(status.latestAttempt.state,"superseded");

    const backup=addParticipant(f.capabilities,f.bindings,{participantId:"agent-b"});
    addConformance(f.conformance,f.role,backup,f.profile);

    const recovered=await f.coordinator.prepare(f.execution.executionId,{request:LOGICAL_REQUEST});
    assert.equal(recovered.state,"prepared");
    assert.equal(recovered.selectedParticipantId,"agent-b");
    status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,2);
    assert.equal(f.getDispatchCalls(),0);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("coordinator never reaches candidate selection when reconciliation is accepted/uncertain",async()=>{
  const f=await fixture();
  try{
    f.failoverController.reconciliationController={
      async reconcile(){
        return {
          state:"accepted-uncertain",
          remoteEvidenceState:"accepted",
          rejectionCategory:null,
          decisionStatementHash:HASH_D,
          completionStatementHash:null
        };
      }
    };
    await assert.rejects(
      ()=>f.coordinator.prepare(f.execution.executionId,{request:LOGICAL_REQUEST}),
      error=>error?.code==="ARCA_RECONCILED_FAILOVER_NOT_ELIGIBLE"
    );
    assert.equal(f.authContexts.length,0);
    assert.equal(f.getDispatchCalls(),0);
    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,1);
    assert.equal(status.latestAttempt.state,"started");
  }finally{await rm(f.root,{recursive:true,force:true})}
});


test("coordinator rejects request drift before failover authorization or candidate selection",async()=>{
  const f=await fixture();
  try{
    await assert.rejects(
      ()=>f.coordinator.prepare(f.execution.executionId,{request:{requestId:"logical-req-CHANGED"}}),
      error=>error?.code==="ARCA_RECONCILED_SUBSTITUTION_REQUEST_MISMATCH"
    );
    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.latestAttempt.state,"started");
    assert.equal(f.authContexts.length,0);
    assert.equal(f.getDispatchCalls(),0);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("coordinator rejects role-contract drift before superseding the current attempt",async()=>{
  const f=await fixture();
  try{
    f.roles.remove("research.public");
    f.roles.register({
      roleId:"research.public",
      version:"2",
      requiredCapabilities:["research"],
      allowedKinds:["agent"],
      behaviorEnvelope:{requiredTopLevelKeys:["requestId","status","claims"],requireRequestCorrelation:true}
    });
    await assert.rejects(
      ()=>f.coordinator.prepare(f.execution.executionId,{request:LOGICAL_REQUEST}),
      error=>error?.code==="ARCA_RECONCILED_SUBSTITUTION_ROLE_STALE"
    );
    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.latestAttempt.state,"started");
    assert.equal(f.authContexts.length,0);
    assert.equal(f.getDispatchCalls(),0);
  }finally{await rm(f.root,{recursive:true,force:true})}
});
