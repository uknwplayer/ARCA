import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {AgentGateway,AgentRegistry,linkExternalAgent} from "../packages/agent/src/gateway.ts";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {
  CognitiveSubstitutionRouter,
  ParticipantRuntimeBindingRegistry,
  RoleContractRegistry,
  createAgentGatewaySubstitutionDispatch
} from "../packages/agent/src/cognitive-substitution.ts";
import {RoleConformanceRegistry,runRoleConformance} from "../packages/agent/src/role-conformance.ts";
import {MeshIdentityTrustStore,generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";

const apiKey=process.env.ARCA_GEMINI_API_KEY??process.env.GEMINI_API_KEY;
if(!apiKey)throw new Error("Live Gemini validation requires ARCA_GEMINI_API_KEY or GEMINI_API_KEY");
const model=process.env.ARCA_GEMINI_MODEL??"gemini-3.8-flash";

function waitReady(child){
  return new Promise((resolve,reject)=>{
    let stdout="";
    let stderr="";
    const timer=setTimeout(()=>reject(new Error("Gemini AAP startup timeout: "+stderr)),10000);
    const onData=chunk=>{
      stdout+=chunk.toString();
      const index=stdout.indexOf("\n");
      if(index<0)return;
      clearTimeout(timer);
      child.stdout.off("data",onData);
      try{resolve(JSON.parse(stdout.slice(0,index)))}catch(error){reject(error)}
    };
    child.stdout.on("data",onData);
    child.stderr.on("data",chunk=>{stderr+=chunk.toString()});
    child.once("exit",code=>{
      if(code!==0&&stdout.indexOf("\n")<0){
        clearTimeout(timer);
        reject(new Error("Gemini AAP exited "+code+": "+stderr));
      }
    });
  });
}
const child=spawn(process.execPath,["scripts/arca-gemini-aap-runtime.mjs"],{
  stdio:["ignore","pipe","pipe"],
  env:{
    ...process.env,
    ARCA_GEMINI_API_KEY:apiKey,
    ARCA_GEMINI_MODEL:model,
    ARCA_GEMINI_AGENT_ID:"gemini-live-aap",
    ARCA_GEMINI_MAX_OUTPUT_TOKENS:"1024",
    ARCA_GEMINI_THINKING_LEVEL:"low"
  }
});
try{
  const ready=await waitReady(child);
  child.stderr.on("data",chunk=>process.stderr.write(chunk));
  const endpoint="http://127.0.0.1:"+ready.port;
  const gatewayRegistry=new AgentRegistry();
  gatewayRegistry.registerInternal({id:"arca-primary",principal:true,capabilities:[]},async()=>({}));
  await linkExternalAgent(gatewayRegistry,{
    id:"gemini-live-aap",
    provider:"google-gemini",
    capabilities:["research"],
    connection:{endpoint,auth:{mode:"none"}}
  },{networkEnabled:true,allowLoopback:true,timeoutMs:30000});
  const gateway=new AgentGateway(gatewayRegistry,{networkEnabled:true,allowLoopback:true,timeoutMs:30000});

  const capabilities=new CapabilityRegistry();
  const participantId="logical.gemini-live-aap";
  capabilities.registerParticipant({
    participantId,
    kind:"agent",
    provider:"google-gemini",
    model,
    capabilities:["research"]
  });
  capabilities.recordVerification({participantId,capabilityId:"research",passed:true});
  const passport=capabilities.getPassport(participantId);
  const bindings=new ParticipantRuntimeBindingRegistry();
  bindings.bindPassport(passport,{runtimeKind:"agent-gateway",runtimeId:"gemini-live-aap"});

  const roles=new RoleContractRegistry();
  const role=roles.register({
    roleId:"research.synthetic-gemini",
    requiredCapabilities:["research"],
    allowedKinds:["agent"],
    behaviorEnvelope:{
      requiredTopLevelKeys:["format","taskId","agent","output","humanReviewRequired","coreMutationPerformed"],
      requireRequestCorrelation:false
    }
  });
  const conformance=new RoleConformanceRegistry();
  const profile=conformance.registerProfile(role,{
    profileId:"research.synthetic-gemini.conformance.v1",
    version:"1",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    timeoutMs:30000,
    maxEvidenceAgeMs:60*60*1000,
    inputSchema:{
      type:"object",
      required:["requestId","synthetic"],
      properties:{requestId:{type:"string"},synthetic:{type:"boolean"}}
    },
    outputSchema:{
      type:"object",
      required:["requestId","status","provider","model","text"],
      properties:{
        requestId:{type:"string"},
        status:{type:"string"},
        provider:{type:"string"},
        model:{type:"string"},
        text:{type:"string"}
      }
    },
    fixtures:[{
      fixtureId:"live-gemini-synthetic",
      input:{requestId:"GEMINI-CONFORMANCE-1",synthetic:true},
      assertions:[
        {type:"path-equals",path:"status",expected:"completed"},
        {type:"path-equals",path:"provider",expected:"google-gemini"},
        {type:"path-equals-input",path:"requestId",inputPath:"requestId"}
      ]
    }]
  });
  const conformanceResult=await runRoleConformance({
    registry:conformance,
    role,
    passport,
    verifierId:"live-gemini-workflow",
    execute:async context=>{
      const result=await gateway.dispatch({
        taskId:"GEMINI-CONFORMANCE-1",
        task:"Reply briefly that this is a synthetic ARCA validation.",
        requiredCapabilities:["research"],
        context:context.input
      },{
        allowExternal:true,
        targetAgentId:"gemini-live-aap",
        externalClient:{networkEnabled:true,allowLoopback:true,timeoutMs:30000}
      });
      return result.output.output;
    }
  });
  if(!conformanceResult.passed)throw new Error("Live Gemini Role Conformance failed");
  process.stdout.write(JSON.stringify({
    event:"live-gemini-stage",
    stage:"role-conformance-passed",
    provider:"google-gemini",
    model,
    syntheticOnly:true
  })+"\n");

  const signer=generateMeshNodeIdentity("gemini-live-validation");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    dispatch:createAgentGatewaySubstitutionDispatch(gateway,{
      allowExternal:true,
      externalClient:{networkEnabled:true,allowLoopback:true,timeoutMs:30000}
    }),
    authorize:async()=>({allowed:true,authorizationId:"synthetic-live-gemini"}),
    receiptSigner:signer,
    trustStore,
    isAvailable:async()=>true
  });
  const result=await router.call({
    requestId:"GEMINI-LIVE-1",
    taskId:"GEMINI-LIVE-1",
    task:"Explain in one short sentence what a deterministic integration test verifies.",
    requiredCapabilities:["research"],
    context:{requestId:"GEMINI-LIVE-1",synthetic:true}
  },{roleId:role.roleId});
  const text=result.output.output.output.text;
  process.stdout.write(JSON.stringify({
    ok:true,
    provider:result.output.output.output.provider,
    model:result.output.output.output.model,
    participantId:result.selectedParticipantId,
    roleConformancePassed:conformanceResult.passed,
    receiptHash:result.receipt.receiptHash,
    outputSha256:createHash("sha256").update(text).digest("hex"),
    outputTextPersisted:false,
    syntheticOnly:true
  })+"\n");
}finally{
  if(child.exitCode===null){
    child.kill("SIGTERM");
    await Promise.race([
      new Promise(resolve=>child.once("exit",resolve)),
      new Promise(resolve=>setTimeout(()=>{if(child.exitCode===null)child.kill("SIGKILL");resolve()},3000))
    ]);
  }
}
