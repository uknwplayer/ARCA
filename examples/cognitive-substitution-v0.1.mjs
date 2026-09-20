import {
  CapabilityRegistry,
  CognitiveSubstitutionRouter,
  ParticipantRuntimeBindingRegistry,
  RoleConformanceRegistry,
  RoleContractRegistry,
  runRoleConformance
} from "../packages/agent/src/index.ts";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";

const T="2026-09-19T20:00:00.000Z";
const capabilities=new CapabilityRegistry();
const bindings=new ParticipantRuntimeBindingRegistry();

for(const participantId of ["agent.primary","agent.backup"]){
  capabilities.registerParticipant({
    participantId,
    kind:"agent",
    provider:"example",
    capabilities:["research"]
  },{updatedAt:T});
  capabilities.recordVerification({
    participantId,
    capabilityId:"research",
    passed:true,
    testedAt:T
  });
  bindings.bindPassport(
    capabilities.getPassport(participantId),
    {runtimeKind:"custom",runtimeId:participantId},
    {boundAt:T}
  );
}

const roles=new RoleContractRegistry();
const role=roles.register({
  roleId:"research.public",
  requiredCapabilities:["research"],
  allowedKinds:["agent"],
  behaviorEnvelope:{
    requiredTopLevelKeys:["requestId","status"],
    requireRequestCorrelation:true
  }
});

const conformance=new RoleConformanceRegistry();
conformance.registerProfile(role,{
  profileId:"research.public.conformance.v1",
  version:"1",
  syntheticOnly:true,
  sideEffects:false,
  subjectNetworkRequired:false,
  maxEvidenceAgeMs:24*60*60*1000,
  inputSchema:{
    type:"object",
    required:["requestId","question"],
    additionalProperties:false,
    properties:{
      requestId:{type:"string"},
      question:{type:"string"}
    }
  },
  outputSchema:{
    type:"object",
    required:["requestId","status","claims","uncertainty"],
    additionalProperties:false,
    properties:{
      requestId:{type:"string"},
      status:{type:"string",enum:["completed"]},
      claims:{type:"array",minItems:1,items:{type:"string"}},
      uncertainty:{type:"boolean"}
    }
  },
  fixtures:[{
    fixtureId:"research-contract-basic",
    input:{requestId:"conformance-1",question:"Use the supplied synthetic fact."},
    assertions:[
      {type:"path-equals-input",path:"requestId",inputPath:"requestId"},
      {type:"path-equals",path:"status",expected:"completed"},
      {type:"array-min-items",path:"claims",minItems:1},
      {type:"boolean-path-true",path:"uncertainty"},
      {type:"text-contains-all",values:["synthetic-fact"]}
    ]
  }]
});

for(const participantId of ["agent.primary","agent.backup"]){
  await runRoleConformance({
    registry:conformance,
    role,
    passport:capabilities.getPassport(participantId),
    testedAt:T,
    execute:async({input})=>({
      requestId:input.requestId,
      status:"completed",
      claims:["synthetic-fact"],
      uncertainty:true
    })
  });
}

const signer=generateMeshNodeIdentity("example-router");
const trustStore=new MeshIdentityTrustStore();
trustStore.trust(signer.identity);

const unavailable=new Set(["agent.primary"]);
const router=new CognitiveSubstitutionRouter({
  capabilityRegistry:capabilities,
  roleRegistry:roles,
  bindingRegistry:bindings,
  conformanceRegistry:conformance,
  receiptSigner:signer,
  trustStore,
  isAvailable:async({participant})=>!unavailable.has(participant.participantId),
  authorize:async()=>({allowed:true,authorizationId:"example-policy"}),
  dispatch:async(participantId,request,{binding})=>({
    requestId:request.requestId,
    status:"completed",
    logicalParticipant:participantId,
    executedBy:binding.runtimeId
  }),
  now:()=>new Date(T)
});

const result=await router.call(
  {requestId:"example-1",task:"synthetic demo"},
  {roleId:"research.public",preferredParticipantId:"agent.primary"}
);

console.log(JSON.stringify(result,null,2));
