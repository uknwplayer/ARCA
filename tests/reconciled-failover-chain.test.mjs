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
import {ReconciledFailoverChainController} from "../packages/agent/src/reconciled-failover-chain.ts";
import {CrossPeerRequestOwnershipStore} from "../src/machine-bridge/cross-peer-request-ownership.mjs";
import {ExecutionIdentityStore} from "../src/machine-bridge/execution-identity.mjs";
import {ReconciledFailoverController} from "../src/machine-bridge/reconciled-failover.mjs";
import {
  RemoteRequestEvidenceLedger,
  createFileRemoteRequestEvidenceStorage
} from "../src/machine-bridge/remote-request-evidence.mjs";
import {RemoteEvidenceReconciliationController} from "../src/machine-bridge/remote-evidence-reconciliation.mjs";
import {MeshIdentityTrustStore,generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";

const T0=new Date("2026-09-19T23:30:00.000Z");
const HASH_A="a".repeat(64);
const HASH_B="b".repeat(64);
const HASH_C="c".repeat(64);
const HASH_D="d".repeat(64);
const HASH_E="e".repeat(64);
const HASH_F="f".repeat(64);
const HASH_1="1".repeat(64);
const HASH_2="2".repeat(64);
const REQUEST={requestId:"logical-req-chain-1"};

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function hashJson(value){return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}

function addParticipant(capabilities,bindings,{participantId,runtimeId}){
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
    verifierId:"failover-chain-test",
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

async function fixture({
  participantIds=["agent-a","agent-b","agent-c"],
  behaviorByParticipant={},
  maxAttempts=8,
  maxTransitionsPerRun=8
}={}){
  const root=await mkdtemp(join(tmpdir(),"arca-failover-chain-"));
  const executionStore=await new ExecutionIdentityStore({root:join(root,"executions")}).init();
  const ownershipStore=await new CrossPeerRequestOwnershipStore({root:join(root,"ownership")}).init();

  const trustStore=new MeshIdentityTrustStore();
  const relaySigner=generateMeshNodeIdentity("relay-origin");
  trustStore.trust(relaySigner.identity);

  const nodeIds=["peer-a","peer-b","peer-c","peer-d"];
  const storages=new Map();
  const ledgers=new Map();
  for(const nodeId of nodeIds){
    const signer=generateMeshNodeIdentity(nodeId);
    trustStore.trust(signer.identity);
    const storage=createFileRemoteRequestEvidenceStorage({root:join(root,"remote-evidence",nodeId)});
    storages.set(nodeId,storage);
    ledgers.set(nodeId,new RemoteRequestEvidenceLedger({
      nodeId,
      signer,
      trustStore,
      storage,
      now:()=>T0
    }));
  }

  const capabilities=new CapabilityRegistry();
  const bindings=new ParticipantRuntimeBindingRegistry();
  const passports=new Map();
  for(const participantId of participantIds){
    const suffix=participantId.at(-1);
    passports.set(participantId,addParticipant(capabilities,bindings,{
      participantId,
      runtimeId:"runtime-"+suffix
    }));
  }

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
  for(const passport of passports.values())addConformance(conformance,role,passport,profile);

  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    receiptSigner:relaySigner,
    trustStore,
    isAvailable:async()=>true,
    authorize:async()=>({allowed:true,authorizationId:"chain-auth"}),
    dispatch:async()=>{throw new Error("chain must use controlled replacement dispatcher")},
    now:()=>T0
  });

  const initialOwnership=await ownershipStore.reserve({
    requestId:"remote-req-1",
    jobId:"remote-job-1",
    payloadHash:HASH_F,
    relayNodeId:"relay-origin",
    selectedNodeId:"peer-a",
    now:T0
  });
  await ownershipStore.markDispatchStarted("remote-req-1",{now:T0});

  const execution=(await executionStore.create({
    logicalRequestId:"logical-req-chain-1",
    roleId:role.roleId,
    roleContractHash:role.contractHash,
    requestHash:hashJson(REQUEST),
    authorizationBindingHash:HASH_B,
    idempotencyClass:"side-effecting",
    createdAt:T0
  })).identity;

  const primaryPassport=passports.get("agent-a");
  assert.ok(primaryPassport,"fixture requires agent-a");
  const first=(await executionStore.createAttempt(execution.executionId,{
    participantId:"agent-a",
    participantDescriptorHash:primaryPassport.descriptorHash,
    runtimeBindingHash:bindings.get("agent-a").bindingHash,
    roleConformanceEvidenceHash:conformance.getEvidence(role.roleId,"agent-a").evidenceHash,
    requestId:"remote-req-1",
    jobId:"remote-job-1",
    payloadHash:HASH_F,
    selectedNodeId:"peer-a",
    ownerBindingHash:initialOwnership.binding.recordHash,
    plannedAt:T0
  })).attempt;
  await executionStore.markAttemptStarted(execution.executionId,first.attemptId,{startedAt:T0});

  await ledgers.get("peer-a").reject({
    requestId:first.requestId,
    jobId:first.jobId,
    payloadHash:first.payloadHash,
    ownerBindingHash:first.ownerBindingHash,
    rejectionCategory:"unavailable",
    now:T0
  });

  const reconciliationController=new RemoteEvidenceReconciliationController({
    ownershipStore,
    trustStore,
    remoteSources:nodeIds.map(nodeId=>({nodeId,storage:storages.get(nodeId)})),
    now:()=>T0,
    clockSkewMs:0
  });
  const failoverController=new ReconciledFailoverController({
    executionStore,
    reconciliationController,
    receiptSigner:relaySigner,
    trustStore,
    now:()=>T0
  });

  const descriptors={
    "agent-b":{requestId:"remote-req-2",jobId:"remote-job-2",payloadHash:HASH_E,selectedNodeId:"peer-b"},
    "agent-c":{requestId:"remote-req-3",jobId:"remote-job-3",payloadHash:HASH_1,selectedNodeId:"peer-c"},
    "agent-d":{requestId:"remote-req-4",jobId:"remote-job-4",payloadHash:HASH_2,selectedNodeId:"peer-d"}
  };
  const coordinator=new ReconciledSubstitutionCoordinator({
    router,
    failoverController,
    ownershipStore,
    relayNodeId:"relay-origin",
    buildAttemptDescriptor:async({participant})=>{
      const descriptor=descriptors[participant.participantId];
      if(!descriptor)throw new Error("missing descriptor for "+participant.participantId);
      return descriptor;
    },
    now:()=>T0
  });

  const networkCalls=[];
  const dispatcher=new ControlledReplacementDispatcher({
    router,
    executionStore,
    ownershipStore,
    dispatchAttempt:async context=>{
      const participantId=context.attempt.participantId;
      networkCalls.push(participantId);
      const behavior=behaviorByParticipant[participantId]??"complete";
      const ledger=ledgers.get(context.attempt.selectedNodeId);
      if(behavior.startsWith("reject:")){
        const category=behavior.slice("reject:".length);
        await ledger.reject({
          requestId:context.attempt.requestId,
          jobId:context.attempt.jobId,
          payloadHash:context.attempt.payloadHash,
          ownerBindingHash:context.attempt.ownerBindingHash,
          rejectionCategory:category,
          now:T0
        });
        throw new TypeError("network response lost after signed remote rejection");
      }
      if(behavior==="accept-uncertain"){
        await ledger.accept({
          requestId:context.attempt.requestId,
          jobId:context.attempt.jobId,
          payloadHash:context.attempt.payloadHash,
          ownerBindingHash:context.attempt.ownerBindingHash,
          now:T0
        });
        throw new TypeError("network response lost after signed remote acceptance");
      }
      return {
        requestId:context.attempt.requestId,
        jobId:context.attempt.jobId,
        status:"completed",
        participantId
      };
    },
    now:()=>T0
  });

  const chain=new ReconciledFailoverChainController({
    coordinator,
    dispatcher,
    executionStore,
    maxAttempts,
    maxTransitionsPerRun
  });

  return {
    root,executionStore,ownershipStore,trustStore,ledgers,router,coordinator,dispatcher,chain,
    execution,networkCalls,bindings,conformance,role,passports
  };
}

test("signed pre-execution rejection chains A -> B -> C and never reuses A",async()=>{
  const f=await fixture({behaviorByParticipant:{"agent-b":"reject:unavailable","agent-c":"complete"}});
  try{
    const result=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(result.state,"completed");
    assert.deepEqual(f.networkCalls,["agent-b","agent-c"]);

    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,3);
    assert.deepEqual(status.attempts.map(item=>item.attempt.participantId),["agent-a","agent-b","agent-c"]);
    assert.deepEqual(status.attempts.map(item=>item.state),["superseded","superseded","completed"]);

    const cPreparation=await f.executionStore.getReplacementPreparation(
      f.execution.executionId,
      status.attempts[2].attempt.attemptId
    );
    assert.deepEqual(cPreparation.excludedParticipantIds,["agent-a","agent-b"]);
    assert.equal(cPreparation.selectedParticipantId,"agent-c");
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("signed acceptance plus transport ambiguity blocks the chain and never creates C",async()=>{
  const f=await fixture({behaviorByParticipant:{"agent-b":"accept-uncertain","agent-c":"complete"}});
  try{
    const result=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(result.state,"awaiting-reconciliation");
    assert.equal(result.reason,"remote-accepted");
    assert.deepEqual(f.networkCalls,["agent-b"]);
    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,2);
    assert.equal(status.latestAttempt.attempt.participantId,"agent-b");
    assert.equal(status.latestAttempt.state,"started");
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("policy rejection is signed evidence but never authorizes automatic chaining",async()=>{
  const f=await fixture({behaviorByParticipant:{"agent-b":"reject:policy","agent-c":"complete"}});
  try{
    const result=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(result.state,"blocked");
    assert.equal(result.reason,"rejection-category-not-reroutable");
    assert.deepEqual(f.networkCalls,["agent-b"]);
    assert.equal((await f.executionStore.status(f.execution.executionId)).attemptCount,2);
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("chain becomes awaiting-participant after safe rejection when no unused participant remains",async()=>{
  const f=await fixture({
    participantIds:["agent-a","agent-b"],
    behaviorByParticipant:{"agent-b":"reject:capability"}
  });
  try{
    const result=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(result.state,"awaiting-participant");
    assert.deepEqual(f.networkCalls,["agent-b"]);
    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,2);
    assert.equal(status.latestAttempt.state,"superseded");
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("maxAttempts bounds a valid rejection chain without dispatching an extra participant",async()=>{
  const f=await fixture({
    participantIds:["agent-a","agent-b","agent-c"],
    behaviorByParticipant:{"agent-b":"reject:not-accepted","agent-c":"complete"},
    maxAttempts:2
  });
  try{
    const result=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(result.state,"attempt-limit-reached");
    assert.equal(result.maxAttempts,2);
    assert.deepEqual(f.networkCalls,["agent-b"]);
    const status=await f.executionStore.status(f.execution.executionId);
    assert.equal(status.attemptCount,2);
    assert.equal(status.latestAttempt.attempt.participantId,"agent-b");
  }finally{await rm(f.root,{recursive:true,force:true})}
});

test("bounded runs resume from durable state without redispatching an already-started attempt",async()=>{
  const f=await fixture({
    behaviorByParticipant:{"agent-b":"reject:unavailable","agent-c":"complete"},
    maxTransitionsPerRun:1
  });
  try{
    const first=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(first.state,"bounded-run-paused");
    assert.deepEqual(f.networkCalls,[]);

    const second=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(second.state,"bounded-run-paused");
    assert.deepEqual(f.networkCalls,["agent-b"]);

    const third=await f.chain.run(f.execution.executionId,{request:REQUEST});
    assert.equal(third.state,"completed");
    assert.deepEqual(f.networkCalls,["agent-b","agent-c"]);
  }finally{await rm(f.root,{recursive:true,force:true})}
});
