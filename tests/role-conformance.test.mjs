import test from "node:test";
import assert from "node:assert/strict";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {RoleContractRegistry} from "../packages/agent/src/cognitive-substitution.ts";
import {
  ARCA_ROLE_CONFORMANCE_EVIDENCE_FORMAT,
  ARCA_ROLE_CONFORMANCE_PROFILE_FORMAT,
  ARCA_ROLE_CONFORMANCE_RESULT_FORMAT,
  RoleConformanceRegistry,
  runRoleConformance
} from "../packages/agent/src/role-conformance.ts";

const T1="2026-09-19T20:00:00.000Z";
const T2="2026-09-19T20:01:00.000Z";
const T3="2026-09-19T20:02:01.000Z";

function setup({maxEvidenceAgeMs=120000}={}){
  const capabilities=new CapabilityRegistry();
  capabilities.registerParticipant({
    participantId:"agent.research",
    kind:"agent",
    provider:"fixture",
    model:"v1",
    capabilities:["research"]
  },{updatedAt:T1});
  capabilities.recordVerification({
    participantId:"agent.research",
    capabilityId:"research",
    verifierId:"capability-fixture",
    passed:true,
    testedAt:T1
  });
  const passport=capabilities.getPassport("agent.research");
  const roles=new RoleContractRegistry();
  const role=roles.register({
    roleId:"research.public",
    requiredCapabilities:["research"],
    allowedKinds:["agent"],
    behaviorEnvelope:{requiredTopLevelKeys:["requestId","status"],requireRequestCorrelation:true}
  });
  const registry=new RoleConformanceRegistry();
  const profile=registry.registerProfile(role,{
    profileId:"research.public.conformance.v1",
    version:"1",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    timeoutMs:2000,
    maxEvidenceAgeMs,
    inputSchema:{
      type:"object",
      required:["requestId","question"],
      additionalProperties:false,
      properties:{
        requestId:{type:"string",minLength:1,maxLength:120},
        question:{type:"string",minLength:1,maxLength:500}
      }
    },
    outputSchema:{
      type:"object",
      required:["requestId","status","claims","uncertainty"],
      additionalProperties:false,
      properties:{
        requestId:{type:"string"},
        status:{type:"string",enum:["completed"]},
        claims:{type:"array",minItems:1,maxItems:5,items:{type:"string"}},
        uncertainty:{type:"boolean"}
      }
    },
    fixtures:[{
      fixtureId:"public-research-basic",
      input:{requestId:"probe-role-1",question:"Use only the synthetic facts supplied by the fixture."},
      assertions:[
        {type:"path-equals-input",path:"requestId",inputPath:"requestId"},
        {type:"path-equals",path:"status",expected:"completed"},
        {type:"array-min-items",path:"claims",minItems:1},
        {type:"boolean-path-true",path:"uncertainty"},
        {type:"text-contains-all",values:["synthetic-fact"]},
        {type:"text-excludes-all",values:["PRIVATE-LEAK"]}
      ]
    }]
  });
  return {capabilities,passport,roles,role,registry,profile};
}

test("role conformance profile is role-hash bound, synthetic and side-effect free",()=>{
  const {role,registry,profile}=setup();
  assert.equal(profile.format,ARCA_ROLE_CONFORMANCE_PROFILE_FORMAT);
  assert.equal(profile.roleContractHash,role.contractHash);
  assert.equal(profile.syntheticOnly,true);
  assert.equal(profile.sideEffects,false);
  assert.equal(profile.subjectNetworkRequired,false);
  assert.match(profile.profileHash,/^[a-f0-9]{64}$/);
  assert.throws(()=>new RoleConformanceRegistry().registerProfile(role,{
    profileId:"unsafe",
    syntheticOnly:false,
    sideEffects:false,
    subjectNetworkRequired:false,
    fixtures:[{fixtureId:"x",input:{},assertions:[{type:"json-subset",expected:{}}]}]
  }),/syntheticOnly/);
  assert.throws(()=>new RoleConformanceRegistry().registerProfile(role,{
    profileId:"unsafe2",
    syntheticOnly:true,
    sideEffects:true,
    subjectNetworkRequired:false,
    fixtures:[{fixtureId:"x",input:{},assertions:[{type:"json-subset",expected:{}}]}]
  }),/sideEffects/);
  assert.throws(()=>new RoleConformanceRegistry().registerProfile(role,{
    profileId:"unsafe3",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:true,
    fixtures:[{fixtureId:"x",input:{},assertions:[{type:"json-subset",expected:{}}]}]
  }),/rede externa/);
});

test("role conformance runner validates schema and semantic invariants without persisting raw output",async()=>{
  const {passport,role,registry,profile}=setup();
  const result=await runRoleConformance({
    registry,role,passport,testedAt:T1,verifierId:"role-suite",
    execute:async({fixtureId,input,synthetic,sideEffects})=>{
      assert.equal(fixtureId,"public-research-basic");
      assert.equal(synthetic,true);
      assert.equal(sideEffects,false);
      return {
        requestId:input.requestId,
        status:"completed",
        claims:["synthetic-fact"],
        uncertainty:true
      };
    }
  });
  assert.equal(result.format,ARCA_ROLE_CONFORMANCE_RESULT_FORMAT);
  assert.equal(result.passed,true);
  assert.equal(result.passedFixtures,1);
  assert.equal(result.profileHash,profile.profileHash);
  const evidence=registry.getEvidence(role.roleId,passport.participantId);
  assert.equal(evidence.format,ARCA_ROLE_CONFORMANCE_EVIDENCE_FORMAT);
  assert.equal(evidence.passed,true);
  assert.equal(evidence.rawOutputPersisted,false);
  assert.equal(JSON.stringify(evidence).includes("synthetic-fact"),false);
  assert.match(evidence.fixtureResults[0].outputHash,/^[a-f0-9]{64}$/);
  assert.equal(registry.resolve(role,passport,{now:new Date(T2)}).evidence.evidenceHash,evidence.evidenceHash);
});

test("semantic failure creates failed evidence and blocks role eligibility",async()=>{
  const {passport,role,registry}=setup();
  const result=await runRoleConformance({
    registry,role,passport,testedAt:T1,
    execute:async({input})=>({
      requestId:input.requestId,
      status:"completed",
      claims:["synthetic-fact","PRIVATE-LEAK"],
      uncertainty:false
    })
  });
  assert.equal(result.passed,false);
  const evidence=registry.getEvidence(role.roleId,passport.participantId);
  assert.equal(evidence.passed,false);
  assert.throws(
    ()=>registry.resolve(role,passport,{now:new Date(T2)}),
    error=>error?.code==="ARCA_ROLE_CONFORMANCE_FAILED"
  );
});

test("output schema failure is captured without semantic output persistence",async()=>{
  const {passport,role,registry}=setup();
  const result=await runRoleConformance({
    registry,role,passport,testedAt:T1,
    execute:async({input})=>({
      requestId:input.requestId,
      status:"completed",
      claims:"not-an-array",
      uncertainty:true
    })
  });
  assert.equal(result.passed,false);
  const evidence=registry.getEvidence(role.roleId,passport.participantId);
  assert.equal(evidence.fixtureResults[0].schemaPassed,false);
  assert.equal(evidence.rawOutputPersisted,false);
});

test("conformance evidence expires according to profile freshness",async()=>{
  const {passport,role,registry}=setup({maxEvidenceAgeMs:60000});
  await runRoleConformance({
    registry,role,passport,testedAt:T1,
    execute:async({input})=>({requestId:input.requestId,status:"completed",claims:["synthetic-fact"],uncertainty:true})
  });
  assert.throws(
    ()=>registry.resolve(role,passport,{now:new Date(T2)}),
    error=>error?.code==="ARCA_ROLE_CONFORMANCE_EXPIRED"
  );
});

test("participant fingerprint drift invalidates previous role evidence even after capability re-verification",async()=>{
  const {capabilities,passport,role,registry}=setup();
  await runRoleConformance({
    registry,role,passport,testedAt:T1,
    execute:async({input})=>({requestId:input.requestId,status:"completed",claims:["synthetic-fact"],uncertainty:true})
  });
  capabilities.upsertParticipant({
    participantId:"agent.research",
    kind:"agent",
    provider:"fixture",
    model:"v2",
    capabilities:["research"]
  },{updatedAt:T2});
  capabilities.recordVerification({participantId:"agent.research",capabilityId:"research",passed:true,testedAt:T2});
  const changed=capabilities.getPassport("agent.research");
  assert.notEqual(changed.descriptorHash,passport.descriptorHash);
  assert.throws(
    ()=>registry.resolve(role,changed,{now:new Date(T2)}),
    error=>error?.code==="ARCA_ROLE_CONFORMANCE_EVIDENCE_STALE"
  );
});

test("role contract drift makes the old conformance profile stale",async()=>{
  const {passport,role,registry}=setup();
  await runRoleConformance({
    registry,role,passport,testedAt:T1,
    execute:async({input})=>({requestId:input.requestId,status:"completed",claims:["synthetic-fact"],uncertainty:true})
  });
  const roles2=new RoleContractRegistry();
  const changedRole=roles2.register({
    roleId:"research.public",
    version:"2",
    requiredCapabilities:["research"],
    allowedKinds:["agent"],
    behaviorEnvelope:{requiredTopLevelKeys:["requestId","status","claims"],requireRequestCorrelation:true}
  });
  assert.notEqual(changedRole.contractHash,role.contractHash);
  assert.throws(
    ()=>registry.requireProfile(changedRole),
    error=>error?.code==="ARCA_ROLE_CONFORMANCE_PROFILE_STALE"
  );
});

test("fixture input violating bounded input schema is rejected at profile registration",()=>{
  const {role}=setup();
  const registry=new RoleConformanceRegistry();
  assert.throws(()=>registry.registerProfile(role,{
    profileId:"bad-input",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    inputSchema:{
      type:"object",
      required:["requestId"],
      additionalProperties:false,
      properties:{requestId:{type:"string"}}
    },
    outputSchema:{type:"object"},
    fixtures:[{
      fixtureId:"bad",
      input:{requestId:42},
      assertions:[{type:"json-subset",expected:{status:"completed"}}]
    }]
  }),/viola inputSchema/);
});


test("profiles reject secret-like schema fields and semantic paths",()=>{
  const {role}=setup();
  const registry=new RoleConformanceRegistry();
  assert.throws(()=>registry.registerProfile(role,{
    profileId:"secret-schema",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    inputSchema:{
      type:"object",
      properties:{authorization:{type:"string"}}
    },
    outputSchema:{type:"object"},
    fixtures:[{fixtureId:"x",input:{},assertions:[{type:"json-subset",expected:{status:"completed"}}]}]
  }),/campo sensivel/);

  assert.throws(()=>registry.registerProfile(role,{
    profileId:"secret-path",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    inputSchema:{type:"object"},
    outputSchema:{type:"object"},
    fixtures:[{fixtureId:"x",input:{},assertions:[{type:"path-equals",path:"credential.value",expected:"x"}]}]
  }),/campo sensivel/);
});

test("completed verification records cannot omit the output fingerprint",()=>{
  const {passport,role,registry,profile}=setup();
  assert.throws(()=>registry.recordVerification({
    role,
    passport,
    profileId:profile.profileId,
    testedAt:T1,
    verifierId:"bad-verifier",
    fixtureResults:[{
      fixtureId:"public-research-basic",
      executionState:"completed",
      schemaPassed:true,
      outputHash:null,
      outputBytes:10,
      assertionResults:[
        {type:"path-equals-input",passed:true,reason:"path-equals-input"},
        {type:"path-equals",passed:true,reason:"path-equals"},
        {type:"array-min-items",passed:true,reason:"array-min-items"},
        {type:"boolean-path-true",passed:true,reason:"boolean-path-true"},
        {type:"text-contains-all",passed:true,reason:"text-contains-all"},
        {type:"text-excludes-all",passed:true,reason:"text-excludes-all"}
      ]
    }]
  }),/outputHash obrigatorio/);
});
