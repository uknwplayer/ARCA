import test from "node:test";
import assert from "node:assert/strict";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {
  ARCA_COGNITIVE_SUBSTITUTION_RESULT_FORMAT,
  ARCA_PARTICIPANT_RUNTIME_BINDING_FORMAT,
  ARCA_ROLE_CONTRACT_FORMAT,
  CognitiveSubstitutionRouter,
  ParticipantRuntimeBindingRegistry,
  RoleContractRegistry,
  createAgentGatewaySubstitutionDispatch,
  createMachineBridgeSubstitutionDispatch,
  signCognitiveSubstitutionReceipt,
  verifyCognitiveSubstitutionReceipt
} from "../packages/agent/src/cognitive-substitution.ts";
import {AgentGateway,AgentRegistry} from "../packages/agent/src/gateway.ts";
import {RoleConformanceRegistry} from "../packages/agent/src/role-conformance.ts";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {MachineBridgeRemoteClient} from "../src/machine-bridge/remote-client.mjs";

const T1="2026-09-19T18:30:00.000Z";
const T2="2026-09-19T18:31:00.000Z";

function verifiedParticipant(registry,{participantId,kind="agent",capabilities=["research"],provider="fixture",model=null}){
  registry.registerParticipant({participantId,kind,provider,model,capabilities},{updatedAt:T1});
  for(const capabilityId of capabilities)registry.recordVerification({participantId,capabilityId,passed:true,testedAt:T1});
  return registry.getPassport(participantId);
}

function signingFixture(nodeId="substitution-router"){
  const signer=generateMeshNodeIdentity(nodeId);
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  return {signer,trustStore};
}

function bindingKindForParticipant(participant){
  if(participant.runtimeKind)return participant.runtimeKind;
  return participant.kind==="worker"?"machine-bridge-worker":"custom";
}

function passingConformance(role,passports,{skip=[]}={}){
  const registry=new RoleConformanceRegistry();
  const profile=registry.registerProfile(role,{
    profileId:role.roleId+".conformance.v1",
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
      input:{requestId:"role-probe"},
      assertions:[{type:"json-subset",expected:{status:"completed"}}]
    }]
  });
  for(const passport of passports){
    if(!passport||skip.includes(passport.participantId))continue;
    const requiredVerified=role.requiredCapabilities.every(capabilityId=>
      passport.capabilities.some(item=>item.id===capabilityId&&item.status==="verified")
    );
    if(!requiredVerified)continue;
    registry.recordVerification({
      role,
      passport,
      profileId:profile.profileId,
      testedAt:T1,
      verifierId:"test-role-conformance",
      fixtureResults:[{
        fixtureId:"baseline",
        executionState:"completed",
        schemaPassed:true,
        outputHash:"a".repeat(64),
        outputBytes:32,
        assertionResults:[{type:"json-subset",passed:true,reason:"json-subset"}]
      }]
    });
  }
  return registry;
}

function fixture({participants=[],unavailable=[],authorize=async()=>({allowed:true,authorizationId:"auth-test"}),dispatch=null,role={}}={}){
  const capabilities=new CapabilityRegistry();
  const bindings=new ParticipantRuntimeBindingRegistry();
  for(const participant of participants){
    const passport=capabilities.registerParticipant({
      participantId:participant.participantId,
      kind:participant.kind??"agent",
      provider:participant.provider??"fixture",
      model:participant.model??null,
      capabilities:participant.capabilities??["research"]
    },{updatedAt:T1});
    if(participant.verified!==false){
      for(const capabilityId of participant.capabilities??["research"])capabilities.recordVerification({participantId:participant.participantId,capabilityId,passed:true,testedAt:T1});
    }
    bindings.bindPassport(capabilities.getPassport(participant.participantId),{
      runtimeKind:bindingKindForParticipant(participant),
      runtimeId:participant.runtimeId??participant.participantId
    },{boundAt:T1});
  }
  const roles=new RoleContractRegistry();
  const contract=roles.register({
    roleId:"research.public",
    requiredCapabilities:["research"],
    allowedKinds:["agent","worker"],
    behaviorEnvelope:{requiredTopLevelKeys:["requestId","status"],requireRequestCorrelation:true},
    ...role
  });
  const passports=participants.map(participant=>capabilities.getPassport(participant.participantId));
  const conformance=passingConformance(contract,passports,{skip:participants.filter(item=>item.conformant===false).map(item=>item.participantId)});
  const calls=[];
  const {signer,trustStore}=signingFixture();
  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    receiptSigner:signer,
    trustStore,
    authorize,
    isAvailable:async({participant})=>!unavailable.includes(participant.participantId),
    dispatch:dispatch??(async(participantId,request)=>{
      calls.push(participantId);
      return {requestId:request.requestId,status:"completed",participantId};
    }),
    now:()=>new Date(T2)
  });
  return {capabilities,bindings,conformance,roles,contract,router,calls,signer,trustStore};
}

test("role contract is immutable-by-copy, hashed and verified-only",()=>{
  const roles=new RoleContractRegistry();
  const contract=roles.register({roleId:"research.public",requiredCapabilities:["research"],allowedKinds:["agent"]});
  assert.equal(contract.format,ARCA_ROLE_CONTRACT_FORMAT);
  assert.equal(contract.verifiedOnly,true);
  assert.equal(contract.conformanceRequired,true);
  assert.equal(contract.authorizationRequired,true);
  assert.equal(contract.substitutionPolicy,"preflight-only");
  assert.match(contract.contractHash,/^[a-f0-9]{64}$/);
  contract.requiredCapabilities.push("tamper");
  assert.deepEqual(roles.get("research.public").requiredCapabilities,["research"]);
  assert.throws(()=>roles.register({roleId:"unsafe",requiredCapabilities:["x"],authorizationRequired:false}),/nao pode desativar/);
  assert.throws(()=>roles.register({roleId:"unsafe-conformance",requiredCapabilities:["x"],conformanceRequired:false}),/conformanceRequired/);
});

test("runtime binding explicitly separates logical participant from execution target",()=>{
  const capabilities=new CapabilityRegistry();
  const passport=verifiedParticipant(capabilities,{participantId:"logical.research.agent"});
  const bindings=new ParticipantRuntimeBindingRegistry();
  const binding=bindings.bindPassport(passport,{runtimeKind:"agent-gateway",runtimeId:"agent.backup"},{boundAt:T1});
  assert.equal(binding.format,ARCA_PARTICIPANT_RUNTIME_BINDING_FORMAT);
  assert.equal(binding.participantId,"logical.research.agent");
  assert.equal(binding.runtimeId,"agent.backup");
  assert.notEqual(binding.participantId,binding.runtimeId);
  assert.match(binding.bindingHash,/^[a-f0-9]{64}$/);
});

test("declared-only participant cannot satisfy a cognitive role",async()=>{
  const {router,calls}=fixture({participants:[
    {participantId:"agent.declared",verified:false}
  ]});
  await assert.rejects(
    ()=>router.call({requestId:"req-1"},{roleId:"research.public"}),
    error=>error?.code==="ARCA_SUBSTITUTION_NO_ELIGIBLE_PARTICIPANT"
  );
  assert.deepEqual(calls,[]);
});

test("preferred verified participant executes when available and emits trusted signature",async()=>{
  const {router,calls,trustStore}=fixture({participants:[
    {participantId:"agent.a"},
    {participantId:"agent.b"}
  ]});
  const result=await router.call({requestId:"req-2"},{roleId:"research.public",preferredParticipantId:"agent.b"});
  assert.equal(result.format,ARCA_COGNITIVE_SUBSTITUTION_RESULT_FORMAT);
  assert.equal(result.selectedParticipantId,"agent.b");
  assert.equal(result.substituted,false);
  assert.deepEqual(calls,["agent.b"]);
  assert.equal(result.receipt.selectionReason,"preferred");
  assert.equal(result.receipt.dispatchAttempts,1);
  assert.match(result.receipt.roleConformanceProfileHash,/^[a-f0-9]{64}$/);
  assert.match(result.receipt.roleConformanceEvidenceHash,/^[a-f0-9]{64}$/);
  assert.equal(result.roleConformanceEvidenceHash,result.receipt.roleConformanceEvidenceHash);
  assert.equal(result.receipt.signedReceipt.domain,"arca.mesh.cognitive-substitution-receipt.v1");
  assert.equal(verifyCognitiveSubstitutionReceipt(result.receipt,{trustStore,now:new Date(T2)}),true);
});

test("unavailable preferred participant is substituted before execution",async()=>{
  const {router,calls}=fixture({
    participants:[{participantId:"agent.a"},{participantId:"agent.b"}],
    unavailable:["agent.a"]
  });
  const result=await router.call({requestId:"req-3"},{roleId:"research.public",preferredParticipantId:"agent.a"});
  assert.equal(result.selectedParticipantId,"agent.b");
  assert.equal(result.substituted,true);
  assert.deepEqual(result.receipt.unavailableParticipants,["agent.a"]);
  assert.equal(result.receipt.selectionReason,"preflight-substitute");
  assert.deepEqual(calls,["agent.b"]);
});

test("preferred participant without current role conformance is skipped before availability",async()=>{
  const {router,calls}=fixture({
    participants:[
      {participantId:"agent.a",conformant:false},
      {participantId:"agent.b"}
    ]
  });
  const result=await router.call({requestId:"req-3b"},{roleId:"research.public",preferredParticipantId:"agent.a"});
  assert.equal(result.selectedParticipantId,"agent.b");
  assert.equal(result.substituted,true);
  assert.deepEqual(result.receipt.conformanceRejectedParticipants,["agent.a"]);
  assert.deepEqual(calls,["agent.b"]);
});

test("authorization denial fails closed before dispatch",async()=>{
  const {router,calls}=fixture({
    participants:[{participantId:"agent.a"}],
    authorize:async()=>({allowed:false})
  });
  await assert.rejects(
    ()=>router.call({requestId:"req-4"},{roleId:"research.public"}),
    error=>error?.code==="ARCA_SUBSTITUTION_NOT_AUTHORIZED"
  );
  assert.deepEqual(calls,[]);
});

test("execution failure never triggers implicit post-start failover",async()=>{
  const calls=[];
  const {router}=fixture({
    participants:[{participantId:"agent.a"},{participantId:"agent.b"}],
    dispatch:async participantId=>{
      calls.push(participantId);
      throw new Error("provider failed after start");
    }
  });
  await assert.rejects(
    ()=>router.call({requestId:"req-5"},{roleId:"research.public",preferredParticipantId:"agent.a"}),
    error=>error?.code==="ARCA_SUBSTITUTION_EXECUTION_FAILED"&&error?.selectedParticipantId==="agent.a"
  );
  assert.deepEqual(calls,["agent.a"]);
});

test("behavior envelope rejects missing correlation and required keys",async()=>{
  const {router}=fixture({
    participants:[{participantId:"agent.a"}],
    dispatch:async()=>({status:"completed"})
  });
  await assert.rejects(
    ()=>router.call({requestId:"req-6"},{roleId:"research.public"}),
    error=>error?.code==="ARCA_SUBSTITUTION_OUTPUT_CONTRACT_MISMATCH"
  );
});

test("behavior envelope enforces bounded output",async()=>{
  const {router}=fixture({
    participants:[{participantId:"agent.a"}],
    role:{behaviorEnvelope:{maxOutputBytes:1024,requireRequestCorrelation:false}},
    dispatch:async()=>({payload:"x".repeat(2000)})
  });
  await assert.rejects(
    ()=>router.call({requestId:"req-7"},{roleId:"research.public"}),
    error=>error?.code==="ARCA_SUBSTITUTION_OUTPUT_TOO_LARGE"
  );
});

test("participant fingerprint change requires re-verification and runtime re-binding",async()=>{
  const {router,capabilities,bindings,calls}=fixture({participants:[{participantId:"agent.mutable",model:"v1"}]});
  capabilities.upsertParticipant({
    participantId:"agent.mutable",
    kind:"agent",
    provider:"fixture",
    model:"v2",
    capabilities:["research"]
  },{updatedAt:T2});
  assert.equal(capabilities.getPassport("agent.mutable").capabilities[0].status,"verification-needed");
  capabilities.recordVerification({participantId:"agent.mutable",capabilityId:"research",passed:true,testedAt:T2});
  assert.equal(capabilities.getPassport("agent.mutable").capabilities[0].status,"verified");
  assert.throws(
    ()=>bindings.resolveForPassport(capabilities.getPassport("agent.mutable")),
    error=>error?.code==="ARCA_SUBSTITUTION_RUNTIME_BINDING_STALE"
  );
  await assert.rejects(
    ()=>router.call({requestId:"req-8"},{roleId:"research.public"}),
    error=>error?.code==="ARCA_SUBSTITUTION_NO_ELIGIBLE_PARTICIPANT"&&error?.conformanceRejectedParticipants?.includes("agent.mutable")
  );
  assert.deepEqual(calls,[]);
});

test("receipt hash tampering is detectable",async()=>{
  const {router,trustStore}=fixture({participants:[{participantId:"agent.a"}]});
  const result=await router.call({requestId:"req-9"},{roleId:"research.public"});
  const tampered={...result.receipt,selectedParticipantId:"agent.other"};
  assert.equal(verifyCognitiveSubstitutionReceipt(tampered,{trustStore,now:new Date(T2)}),false);
});

test("a forged receipt with a valid attacker signature is rejected by trust store",async()=>{
  const {router,trustStore}=fixture({participants:[{participantId:"agent.a"}]});
  const result=await router.call({requestId:"req-10"},{roleId:"research.public"});
  const attacker=generateMeshNodeIdentity("attacker-node");
  const {signedReceipt:_signature,receiptHash:_oldHash,issuerNodeId:_issuer,...body}=result.receipt;
  const forged=await signCognitiveSubstitutionReceipt(
    {...body,selectedParticipantId:"agent.attacker"},
    attacker,
    {issuedAt:new Date(T2)}
  );
  assert.equal(verifyCognitiveSubstitutionReceipt(forged,{trustStore,now:new Date(T2)}),false);
});

test("AgentGateway targeted dispatch cannot silently fall back to a different agent",async()=>{
  const calls=[];
  const registry=new AgentRegistry()
    .registerInternal({id:"agent.primary",principal:true,priority:1000,capabilities:["research"]},async task=>{calls.push("agent.primary");return {taskId:task.taskId,answer:"primary"}})
    .registerInternal({id:"agent.backup",priority:10,capabilities:["research"]},async task=>{calls.push("agent.backup");return {taskId:task.taskId,answer:"backup"}});
  const gateway=new AgentGateway(registry);
  const result=await gateway.dispatch(
    {taskId:"T-target",task:"Research",requiredCapabilities:["research"],context:{}},
    {targetAgentId:"agent.backup"}
  );
  assert.equal(result.agent.id,"agent.backup");
  assert.deepEqual(calls,["agent.backup"]);
  await assert.rejects(
    ()=>gateway.dispatch({taskId:"T-bad",task:"Research",requiredCapabilities:["reasoning"],context:{}},{targetAgentId:"agent.backup"}),
    /agente alvo incompativel/
  );
});

test("cognitive substitution maps logical participant to a different AgentGateway runtime",async()=>{
  const calls=[];
  const registry=new AgentRegistry()
    .registerInternal({id:"agent.primary",principal:true,priority:1000,capabilities:["research"]},async task=>{calls.push("agent.primary");return {taskId:task.taskId,answer:"primary"}})
    .registerInternal({id:"agent.backup",priority:10,capabilities:["research"]},async task=>{calls.push("agent.backup");return {taskId:task.taskId,answer:"backup"}});
  const gateway=new AgentGateway(registry);
  const capabilities=new CapabilityRegistry();
  const primary=verifiedParticipant(capabilities,{participantId:"logical.research.primary"});
  const backup=verifiedParticipant(capabilities,{participantId:"logical.research.backup"});
  const bindings=new ParticipantRuntimeBindingRegistry();
  bindings.bindPassport(primary,{runtimeKind:"agent-gateway",runtimeId:"agent.primary"},{boundAt:T1});
  bindings.bindPassport(backup,{runtimeKind:"agent-gateway",runtimeId:"agent.backup"},{boundAt:T1});
  const roles=new RoleContractRegistry();
  const role=roles.register({
    roleId:"research.gateway",
    requiredCapabilities:["research"],
    allowedKinds:["agent"],
    behaviorEnvelope:{requiredTopLevelKeys:["taskId","agent"],requireRequestCorrelation:true}
  });
  const conformance=passingConformance(role,[primary,backup]);
  const {signer,trustStore}=signingFixture("gateway-router");
  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    receiptSigner:signer,
    trustStore,
    isAvailable:async({participant})=>participant.participantId!=="logical.research.primary",
    authorize:async()=>({allowed:true,authorizationId:"auth-gateway"}),
    dispatch:createAgentGatewaySubstitutionDispatch(gateway),
    now:()=>new Date(T2)
  });
  const result=await router.call(
    {taskId:"T-substitute",task:"Research",requiredCapabilities:["research"],context:{}},
    {roleId:"research.gateway",preferredParticipantId:"logical.research.primary"}
  );
  assert.equal(result.selectedParticipantId,"logical.research.backup");
  assert.equal(result.runtimeId,"agent.backup");
  assert.equal(result.output.agent.id,"agent.backup");
  assert.equal(result.output.output.answer,"backup");
  assert.deepEqual(calls,["agent.backup"]);
  assert.equal(verifyCognitiveSubstitutionReceipt(result.receipt,{trustStore,now:new Date(T2)}),true);
});

test("cognitive substitution maps logical worker to a different Machine Bridge workerId",async()=>{
  let enqueued=null;
  const transport={
    enqueue:async job=>{enqueued=job;return true},
    getResult:async jobId=>enqueued&&enqueued.jobId===jobId?{result:{
      format:"arca-result-v1",
      jobId:enqueued.jobId,
      requestId:enqueued.requestId,
      workerId:enqueued.workerTarget,
      status:"completed",
      output:{ok:true}
    }}:null
  };
  const client=new MachineBridgeRemoteClient({transport,sleepImpl:async()=>{},now:()=>0});
  const capabilities=new CapabilityRegistry();
  const primary=verifiedParticipant(capabilities,{participantId:"logical.worker.primary",kind:"worker"});
  const backup=verifiedParticipant(capabilities,{participantId:"logical.worker.backup",kind:"worker"});
  const bindings=new ParticipantRuntimeBindingRegistry();
  bindings.bindPassport(primary,{runtimeKind:"machine-bridge-worker",runtimeId:"worker-runtime-a"},{boundAt:T1});
  bindings.bindPassport(backup,{runtimeKind:"machine-bridge-worker",runtimeId:"github-actions"},{boundAt:T1});
  const roles=new RoleContractRegistry();
  const role=roles.register({
    roleId:"research.worker",
    requiredCapabilities:["research"],
    allowedKinds:["worker"],
    behaviorEnvelope:{requiredTopLevelKeys:["jobId","requestId","status"],requireRequestCorrelation:true}
  });
  const conformance=passingConformance(role,[primary,backup]);
  const {signer,trustStore}=signingFixture("machine-bridge-router");
  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    receiptSigner:signer,
    trustStore,
    isAvailable:async({participant})=>participant.participantId!=="logical.worker.primary",
    authorize:async()=>({allowed:true,authorizationId:"auth-mb"}),
    dispatch:createMachineBridgeSubstitutionDispatch(client,{callOptions:{waitTimeoutMs:1000,pollIntervalMs:100}}),
    now:()=>new Date(T2)
  });
  const result=await router.call({
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"job-substitution-1",
    requestId:"req-substitution-1",
    action:"worker.ping",
    requires:[],
    params:{echo:"hello"}
  },{roleId:"research.worker",preferredParticipantId:"logical.worker.primary"});
  assert.equal(result.selectedParticipantId,"logical.worker.backup");
  assert.equal(result.runtimeId,"github-actions");
  assert.equal(enqueued.workerTarget,"github-actions");
  assert.deepEqual(enqueued.requires,["research"]);
  assert.equal(result.output.workerId,"github-actions");
});
