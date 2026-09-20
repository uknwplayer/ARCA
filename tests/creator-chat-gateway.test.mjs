import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentGateway,
  AgentRegistry,
  createCreatorChatHandlerFromGateway
} from "../packages/agent/src/index.ts";

const session={
  format:"arca-creator-session-v1",
  sessionId:"creator-chat-session",
  subject:"creator:primary",
  scopes:["creator.chat","creator.read"],
  authMethod:"local-bootstrap",
  credentialIdHash:"a".repeat(64),
  issuedAt:"2026-09-17T20:00:00.000Z",
  expiresAt:"2026-09-17T20:15:00.000Z"
};

test("Creator Chat Gateway preserves requestId and routes reasoning to arca-primary",async()=>{
  let capturedTask;
  const registry=new AgentRegistry().registerInternal({
    id:"arca-primary",name:"ARCA Agent",provider:"arca",principal:true,priority:1000,capabilities:["reasoning"]
  },async task=>{capturedTask=task;return {text:`resposta:${task.task}`}});
  const gateway=new AgentGateway(registry);
  const handler=createCreatorChatHandlerFromGateway(gateway);
  const result=await handler({message:"prossiga",requestId:"req-creator-gateway-1",session,context:{home:"/private/home/path"}});

  assert.equal(result.format,"arca-creator-chat-gateway-v1");
  assert.equal(result.requestId,"req-creator-gateway-1");
  assert.equal(result.agent.id,"arca-primary");
  assert.equal(result.external,false);
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.coreMutationPerformed,false);
  assert.equal(result.output.text,"resposta:prossiga");
  assert.equal(capturedTask.taskId,"req-creator-gateway-1");
  assert.equal(capturedTask.context.requestId,"req-creator-gateway-1");
  assert.equal(capturedTask.context.channel,"arca-creator-console");
  assert.equal(capturedTask.context.creatorSubject,"creator:primary");
  assert.equal(JSON.stringify(capturedTask.context).includes("/private/home/path"),false);
});

test("Creator Chat Gateway does not send Creator chat to external agents unless explicitly allowed",async()=>{
  const registry=new AgentRegistry().registerExternal({
    id:"remote-reasoner",name:"Remote Reasoner",provider:"example",capabilities:["reasoning"],connection:{endpoint:"http://127.0.0.1:9999",auth:{mode:"none"}}
  });
  const gateway=new AgentGateway(registry,{networkEnabled:true,allowLoopback:true,fetchImpl:async()=>new Response(JSON.stringify({
    format:"arca-agent-result-v1",taskId:"unused",status:"completed",output:{},humanReviewRequired:true
  }),{status:200,headers:{"Content-Type":"application/json"}})});
  const handler=createCreatorChatHandlerFromGateway(gateway);
  await assert.rejects(()=>handler({message:"status",requestId:"req-external-denied",session}),/nenhum agente compativel/);
});

test("Creator Chat Gateway can use an allowlisted external reasoning agent only with explicit opt-in",async()=>{
  let requestBody;
  const registry=new AgentRegistry().registerExternal({
    id:"remote-reasoner",name:"Remote Reasoner",provider:"example",capabilities:["reasoning"],connection:{endpoint:"http://127.0.0.1:9999",auth:{mode:"none"}}
  });
  const gateway=new AgentGateway(registry,{networkEnabled:true,allowLoopback:true,fetchImpl:async(_url,init)=>{
    requestBody=JSON.parse(init.body);
    return new Response(JSON.stringify({format:"arca-agent-result-v1",taskId:requestBody.taskId,status:"completed",output:{text:"remote-ok"},humanReviewRequired:true}),{status:200,headers:{"Content-Type":"application/json"}});
  }});
  const handler=createCreatorChatHandlerFromGateway(gateway,{allowExternal:true});
  const result=await handler({message:"analise isto",requestId:"req-external-ok",session});

  assert.equal(result.requestId,"req-external-ok");
  assert.equal(result.agent.id,"remote-reasoner");
  assert.equal(result.external,true);
  assert.equal(result.output.output.text,"remote-ok");
  assert.equal(requestBody.taskId,"req-external-ok");
  assert.deepEqual(requestBody.requiredCapabilities,["reasoning"]);
  assert.equal(requestBody.humanReviewRequired,true);
});

test("Creator Chat Gateway rejects invalid correlation and unsafe capability configuration",()=>{
  const registry=new AgentRegistry().registerInternal({id:"arca-primary",provider:"arca",principal:true,capabilities:["reasoning"]},async()=>({ok:true}));
  const gateway=new AgentGateway(registry);
  assert.throws(()=>createCreatorChatHandlerFromGateway(gateway,{requiredCapabilities:["bad capability"]}),/capability invalida/);
  const handler=createCreatorChatHandlerFromGateway(gateway);
  assert.rejects(()=>handler({message:"ok",requestId:"bad/request",session}),/requestId invalido/);
});
