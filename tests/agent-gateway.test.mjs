import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCA_AGENT_DESCRIPTOR_FORMAT,
  ARCA_AGENT_GATEWAY_RESULT_FORMAT,
  ARCA_AGENT_RESULT_FORMAT,
  AgentGateway,
  AgentRegistry,
  createArcaAgentGateway,
  createExternalAgentClient,
  linkExternalAgent
} from "../packages/agent/src/gateway.ts";
import {EncryptedCredentialVault,createCredentialBroker,createMemoryCredentialStore} from "../packages/agent/src/credential-vault.ts";

const externalDescriptor={
  id:"external-research",
  name:"External Research",
  provider:"example",
  capabilities:["research","summarization"],
  connection:{endpoint:"https://agent.example.test",auth:{mode:"bearer",credentialRef:"vault://agent/example"}}
};

function fakeFetch(log=[]){
  return async (url,init={})=>{
    log.push({url,init});
    const path=new URL(url).pathname;
    if(path.endsWith("/arca/agent"))return new Response(JSON.stringify({format:ARCA_AGENT_DESCRIPTOR_FORMAT,id:"external-research",name:"External Research",provider:"example",capabilities:["research","summarization"]}),{status:200,headers:{"content-type":"application/json"}});
    if(path.endsWith("/arca/jobs")){
      const task=JSON.parse(init.body);
      return new Response(JSON.stringify({format:ARCA_AGENT_RESULT_FORMAT,taskId:task.taskId,status:"completed",output:{answer:"ok"},humanReviewRequired:true}),{status:200,headers:{"content-type":"application/json"}});
    }
    return new Response("{}",{status:404});
  };
}

async function secureClientOptions(log=[]){
  const vault=new EncryptedCredentialVault({store:createMemoryCredentialStore(),keyProvider:async()=>"test-master-secret"});
  await vault.storeCredential("vault://agent/example","TOP-SECRET");
  return {networkEnabled:true,allowedOrigins:["https://agent.example.test"],fetchImpl:fakeFetch(log),credentialBroker:createCredentialBroker(vault,{fetchImpl:fakeFetch(log)}),vault};
}

test("registry keeps one ARCA principal and routes internal capabilities first",async()=>{
  const registry=new AgentRegistry();
  registry.registerInternal({id:"arca-primary",name:"ARCA Agent",provider:"arca",principal:true,capabilities:["reasoning","research"]},async task=>({taskId:task.taskId,answer:"internal"}));
  registry.registerExternal(externalDescriptor);
  assert.equal(registry.select(["research"]).id,"arca-primary");
  assert.equal(registry.select(["summarization"],{allowExternal:true}).id,"external-research");
  assert.throws(()=>registry.registerInternal({id:"other-primary",principal:true,capabilities:[]},async()=>({})),/somente um agente principal/);
});

test("external descriptors reject inline secrets and expose no credential reference",()=>{
  const registry=new AgentRegistry();
  assert.throws(()=>registry.registerExternal({...externalDescriptor,connection:{endpoint:"https://agent.example.test",auth:{mode:"bearer",token:"secret"}}}),/segredo inline/);
  registry.registerExternal(externalDescriptor);
  const listed=registry.list()[0];
  assert.equal(listed.connection.auth.mode,"bearer");
  assert.equal("credentialRef" in listed.connection.auth,false);
  assert.equal(JSON.stringify(listed).includes("vault://"),false);
});

test("authenticated connections require opaque Credential Broker",()=>{
  assert.throws(()=>createExternalAgentClient(externalDescriptor.connection,{networkEnabled:true,allowedOrigins:["https://agent.example.test"],fetchImpl:fakeFetch()}),/Credential Broker obrigatorio/);
});

test("external network is blocked by default and requires an allowlisted origin",async()=>{
  const task={taskId:"T-1",task:"Analyze",requiredCapabilities:["research"],context:{}};
  const opts=await secureClientOptions();
  const blocked=createExternalAgentClient(externalDescriptor.connection,{...opts,networkEnabled:false});
  await assert.rejects(()=>blocked.run(task),/rede.*bloqueada/);
  const notAllowed=createExternalAgentClient(externalDescriptor.connection,{...opts,allowedOrigins:[]});
  await assert.rejects(()=>notAllowed.run(task),/origin externa nao autorizada/);
});

test("credential is used only inside broker and is not returned",async()=>{
  const calls=[];const opts=await secureClientOptions(calls);
  const client=createExternalAgentClient(externalDescriptor.connection,opts);
  const result=await client.run({taskId:"T-2",task:"Analyze",requiredCapabilities:["research"],context:{source:"fixture"}});
  assert.equal(result.output.answer,"ok");
  assert.ok(calls.some(call=>call.init.headers.Authorization==="Bearer TOP-SECRET"));
  assert.equal(JSON.stringify(result).includes("TOP-SECRET"),false);
  const audit=await opts.vault.auditCredential("vault://agent/example");
  assert.equal(JSON.stringify(audit).includes("TOP-SECRET"),false);
  assert.ok(audit.auditEvents.some(event=>event.operation==="credential.used"));
});

test("linkExternalAgent verifies remote identity and advertised capabilities",async()=>{
  const registry=new AgentRegistry();const opts=await secureClientOptions();
  const linked=await linkExternalAgent(registry,externalDescriptor,opts);
  assert.equal(linked.id,"external-research");
  assert.deepEqual(linked.capabilities,["research","summarization"]);
  await assert.rejects(()=>linkExternalAgent(new AgentRegistry(),{...externalDescriptor,capabilities:["coding"]},opts),/capability nao anunciada/);
});

test("gateway uses external agents only with explicit permission",async()=>{
  const registry=new AgentRegistry().registerInternal({id:"arca-primary",principal:true,capabilities:["reasoning"]},async()=>({answer:"internal"})).registerExternal(externalDescriptor);
  const opts=await secureClientOptions();const gateway=new AgentGateway(registry,opts);
  const task={taskId:"T-3",task:"Research",requiredCapabilities:["research"],context:{}};
  await assert.rejects(()=>gateway.dispatch(task),/nenhum agente compativel/);
  const result=await gateway.dispatch(task,{allowExternal:true});
  assert.equal(result.format,ARCA_AGENT_GATEWAY_RESULT_FORMAT);
  assert.equal(result.external,true);
  assert.equal(result.agent.id,"external-research");
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.coreMutationPerformed,false);
});

test("convenience factory creates a single internal ARCA principal",async()=>{
  const gateway=createArcaAgentGateway({primaryCapabilities:["reasoning"],primaryHandler:async task=>({taskId:task.taskId,answer:"arca"})});
  const result=await gateway.dispatch({taskId:"T-4",task:"Think",requiredCapabilities:["reasoning"],context:{}});
  assert.equal(result.agent.id,"arca-primary");
  assert.equal(result.external,false);
  assert.equal(result.output.answer,"arca");
});
