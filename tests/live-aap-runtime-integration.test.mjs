import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {CapabilityRegistry} from "../packages/agent/src/capability-registry.ts";
import {
  AgentGateway,
  AgentRegistry,
  createExternalAgentClient,
  linkExternalAgent
} from "../packages/agent/src/gateway.ts";
import {
  CognitiveSubstitutionRouter,
  ParticipantRuntimeBindingRegistry,
  RoleContractRegistry,
  createAgentGatewaySubstitutionDispatch
} from "../packages/agent/src/cognitive-substitution.ts";
import {
  RoleConformanceRegistry,
  runRoleConformance
} from "../packages/agent/src/role-conformance.ts";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";

const FIXTURE=fileURLToPath(new URL("./fixtures/aap-live-agent.mjs",import.meta.url));
const T0=new Date("2026-09-19T23:59:00.000Z");

function waitForReady(child){
  return new Promise((resolve,reject)=>{
    let stdout="";
    let stderr="";
    const timer=setTimeout(()=>reject(new Error("live AAP fixture startup timeout: "+stderr)),8000);
    const onData=chunk=>{
      stdout+=chunk.toString();
      const nl=stdout.indexOf("\n");
      if(nl<0)return;
      clearTimeout(timer);
      child.stdout.off("data",onData);
      try{resolve(JSON.parse(stdout.slice(0,nl)))}catch(error){reject(error)}
    };
    child.stdout.on("data",onData);
    child.stderr.on("data",chunk=>{stderr+=chunk.toString()});
    child.once("exit",code=>{
      if(code!==0&&stdout.indexOf("\n")<0){
        clearTimeout(timer);
        reject(new Error("live AAP fixture exited "+code+": "+stderr));
      }
    });
  });
}
async function startAgent(id,{failAfterJobs=-1}={}){
  const child=spawn(process.execPath,[FIXTURE],{
    stdio:["ignore","pipe","pipe"],
    env:{
      ...process.env,
      ARCA_TEST_AGENT_ID:id,
      ARCA_TEST_AGENT_PROVIDER:"live-aap-test",
      ARCA_TEST_AGENT_FAIL_AFTER_JOBS:String(failAfterJobs)
    }
  });
  const ready=await waitForReady(child);
  const endpoint="http://127.0.0.1:"+ready.port;
  return {
    id,
    child,
    pid:ready.pid,
    endpoint,
    async stats(){
      const response=await fetch(endpoint+"/test/stats");
      return response.json();
    },
    async stop(){
      if(child.exitCode!==null)return;
      child.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve=>child.once("exit",resolve)),
        new Promise(resolve=>setTimeout(()=>{if(child.exitCode===null)child.kill("SIGKILL");resolve()},3000))
      ]);
    }
  };
}
function verifiedPassport(registry,{participantId}){
  registry.registerParticipant({
    participantId,
    kind:"agent",
    provider:"live-aap-test",
    model:"out-of-process-runtime",
    capabilities:["research"]
  },{updatedAt:T0});
  registry.recordVerification({
    participantId,
    capabilityId:"research",
    passed:true,
    testedAt:T0
  });
  return registry.getPassport(participantId);
}
async function linkLive(registry,agent){
  return linkExternalAgent(registry,{
    id:agent.id,
    provider:"live-aap-test",
    capabilities:["research"],
    connection:{endpoint:agent.endpoint,auth:{mode:"none"}}
  },{
    networkEnabled:true,
    allowLoopback:true,
    timeoutMs:5000
  });
}
async function buildSystem(agents){
  const gatewayRegistry=new AgentRegistry();
  gatewayRegistry.registerInternal({
    id:"arca-primary",
    principal:true,
    provider:"arca",
    capabilities:[]
  },async()=>({}));
  for(const agent of agents)await linkLive(gatewayRegistry,agent);
  const gateway=new AgentGateway(gatewayRegistry,{
    networkEnabled:true,
    allowLoopback:true,
    timeoutMs:5000
  });

  const capabilities=new CapabilityRegistry();
  const bindings=new ParticipantRuntimeBindingRegistry();
  const passports=new Map();
  for(const agent of agents){
    const logicalId="logical."+agent.id;
    const passport=verifiedPassport(capabilities,{participantId:logicalId});
    passports.set(logicalId,passport);
    bindings.bindPassport(passport,{
      runtimeKind:"agent-gateway",
      runtimeId:agent.id
    },{boundAt:T0});
  }

  const roles=new RoleContractRegistry();
  const role=roles.register({
    roleId:"research.live-aap",
    requiredCapabilities:["research"],
    allowedKinds:["agent"],
    behaviorEnvelope:{
      requiredTopLevelKeys:["format","taskId","agent","output","humanReviewRequired","coreMutationPerformed"],
      requireRequestCorrelation:false,
      maxOutputBytes:128*1024
    }
  });
  const conformance=new RoleConformanceRegistry();
  const profile=conformance.registerProfile(role,{
    profileId:"research.live-aap.conformance.v1",
    version:"1",
    syntheticOnly:true,
    sideEffects:false,
    subjectNetworkRequired:false,
    timeoutMs:5000,
    maxEvidenceAgeMs:24*60*60*1000,
    inputSchema:{
      type:"object",
      required:["requestId"],
      properties:{requestId:{type:"string"}}
    },
    outputSchema:{
      type:"object",
      required:["requestId","status","agentId","runtimePid","runtimeKind"],
      properties:{
        requestId:{type:"string"},
        status:{type:"string"},
        agentId:{type:"string"},
        runtimePid:{type:"integer"},
        runtimeKind:{type:"string"}
      }
    },
    fixtures:[{
      fixtureId:"live-http-baseline",
      input:{requestId:"probe-live"},
      assertions:[
        {type:"path-equals",path:"status",expected:"completed"},
        {type:"path-equals-input",path:"requestId",inputPath:"requestId"}
      ]
    }]
  });

  for(const agent of agents){
    const logicalId="logical."+agent.id;
    const passport=passports.get(logicalId);
    const result=await runRoleConformance({
      registry:conformance,
      role,
      passport,
      testedAt:T0,
      verifierId:"live-aap-http-conformance",
      execute:async context=>{
        const response=await gateway.dispatch({
          taskId:"conformance-"+agent.id,
          task:"Synthetic live AAP conformance",
          requiredCapabilities:["research"],
          context:context.input
        },{
          allowExternal:true,
          targetAgentId:agent.id,
          externalClient:{networkEnabled:true,allowLoopback:true,timeoutMs:5000}
        });
        return response.output.output;
      }
    });
    assert.equal(result.passed,true);
  }

  const signer=generateMeshNodeIdentity("live-aap-test-origin");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const byRuntimeId=new Map(agents.map(agent=>[agent.id,agent]));
  const router=new CognitiveSubstitutionRouter({
    capabilityRegistry:capabilities,
    roleRegistry:roles,
    bindingRegistry:bindings,
    conformanceRegistry:conformance,
    dispatch:createAgentGatewaySubstitutionDispatch(gateway,{
      allowExternal:true,
      externalClient:{networkEnabled:true,allowLoopback:true,timeoutMs:5000}
    }),
    authorize:async()=>({allowed:true,authorizationId:"live-aap-test"}),
    receiptSigner:signer,
    trustStore,
    isAvailable:async context=>{
      const agent=byRuntimeId.get(context.binding.runtimeId);
      if(!agent)return false;
      try{
        const client=createExternalAgentClient(
          {endpoint:agent.endpoint,auth:{mode:"none"}},
          {networkEnabled:true,allowLoopback:true,timeoutMs:1500}
        );
        const descriptor=await client.probe();
        return descriptor.id===context.binding.runtimeId;
      }catch{
        return false;
      }
    },
    now:()=>T0
  });
  return {gateway,capabilities,bindings,roles,role,conformance,profile,router};
}

test("two out-of-process AAP agents handshake and execute over real loopback HTTP",async()=>{
  const a=await startAgent("live-agent-b");
  const b=await startAgent("live-agent-c");
  try{
    assert.notEqual(a.pid,b.pid);
    assert.notEqual(a.pid,process.pid);
    assert.notEqual(b.pid,process.pid);
    const system=await buildSystem([a,b]);
    const rb=await system.gateway.dispatch({
      taskId:"LIVE-B",
      task:"Live runtime B",
      requiredCapabilities:["research"],
      context:{requestId:"LIVE-B"}
    },{
      allowExternal:true,
      targetAgentId:a.id,
      externalClient:{networkEnabled:true,allowLoopback:true}
    });
    const rc=await system.gateway.dispatch({
      taskId:"LIVE-C",
      task:"Live runtime C",
      requiredCapabilities:["research"],
      context:{requestId:"LIVE-C"}
    },{
      allowExternal:true,
      targetAgentId:b.id,
      externalClient:{networkEnabled:true,allowLoopback:true}
    });
    assert.equal(rb.output.output.agentId,"live-agent-b");
    assert.equal(rc.output.output.agentId,"live-agent-c");
    assert.equal(rb.output.output.runtimePid,a.pid);
    assert.equal(rc.output.output.runtimePid,b.pid);
    assert.notEqual(rb.output.output.runtimePid,rc.output.output.runtimePid);
  }finally{
    await Promise.all([a.stop(),b.stop()]);
  }
});

test("Cognitive Substitution skips a dead real AAP runtime and executes the live backup",async()=>{
  const primary=await startAgent("live-agent-b");
  const backup=await startAgent("live-agent-c");
  try{
    const system=await buildSystem([primary,backup]);
    await primary.stop();
    const result=await system.router.call({
      requestId:"LIVE-SUB-1",
      taskId:"LIVE-SUB-1",
      task:"Use a live AAP runtime",
      requiredCapabilities:["research"],
      context:{requestId:"LIVE-SUB-1"}
    },{
      roleId:"research.live-aap",
      preferredParticipantId:"logical.live-agent-b"
    });
    assert.equal(result.selectedParticipantId,"logical.live-agent-c");
    assert.equal(result.runtimeId,"live-agent-c");
    assert.deepEqual(result.receipt.unavailableParticipants,["logical.live-agent-b"]);
    assert.equal(result.output.output.output.agentId,"live-agent-c");
    assert.equal(result.output.output.output.runtimePid,backup.pid);
  }finally{
    await Promise.all([primary.stop(),backup.stop()]);
  }
});

test("post-start HTTP failure from a real AAP runtime does not silently fail over",async()=>{
  const failing=await startAgent("live-agent-b",{failAfterJobs:1});
  const backup=await startAgent("live-agent-c");
  try{
    const system=await buildSystem([failing,backup]);
    const backupBefore=await backup.stats();
    assert.equal(backupBefore.jobCalls,1,"backup should only have its conformance call before execution");

    await assert.rejects(
      ()=>system.router.call({
        requestId:"LIVE-FAIL-1",
        taskId:"LIVE-FAIL-1",
        task:"This live runtime fails after dispatch starts",
        requiredCapabilities:["research"],
        context:{requestId:"LIVE-FAIL-1"}
      },{
        roleId:"research.live-aap",
        preferredParticipantId:"logical.live-agent-b"
      }),
      error=>error?.code==="ARCA_SUBSTITUTION_EXECUTION_FAILED"
    );

    const failingStats=await failing.stats();
    const backupAfter=await backup.stats();
    assert.equal(failingStats.jobCalls,2,"failing runtime received conformance + exactly one real dispatch");
    assert.equal(backupAfter.jobCalls,1,"backup must not be called after post-start failure");
  }finally{
    await Promise.all([failing.stop(),backup.stop()]);
  }
});
