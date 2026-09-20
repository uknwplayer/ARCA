import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentGateway,AgentRegistry} from "../packages/agent/src/index.ts";
import {createCreatorConsoleWithGateway} from "../packages/workbench/src/creator-gateway.ts";

test("Creator Console reaches arca-primary through Agent Gateway with the same requestId",async(t)=>{
  const home=await mkdtemp(join(tmpdir(),"arca-creator-gateway-"));
  const registry=new AgentRegistry().registerInternal({
    id:"arca-primary",name:"ARCA Agent",provider:"arca",principal:true,priority:1000,capabilities:["reasoning"]
  },async task=>({text:`gateway:${task.task}`,seenTaskId:task.taskId}));
  const gateway=new AgentGateway(registry);
  const instance=createCreatorConsoleWithGateway({home,host:"127.0.0.1",port:0,gateway,bootstrapTtlMs:60_000,sessionTtlMs:120_000});
  const address=await instance.start();
  t.after(async()=>{await instance.stop();await rm(home,{recursive:true,force:true})});

  const unlockResponse=await fetch(`${address.url}/api/unlock`,{method:"POST",headers:{"Content-Type":"application/json","X-ARCA-Creator-Unlock":"1"},body:JSON.stringify({code:address.bootstrap.code})});
  const grant=await unlockResponse.json();assert.equal(unlockResponse.status,200);

  const response=await fetch(`${address.url}/api/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-ARCA-Creator-Session":grant.token},body:JSON.stringify({message:"continue o trabalho",requestId:"req-console-gateway-live"})});
  const result=await response.json();

  assert.equal(response.status,200);
  assert.equal(result.requestId,"req-console-gateway-live");
  assert.equal(result.coreMutationPerformed,false);
  assert.equal(result.output.format,"arca-creator-chat-gateway-v1");
  assert.equal(result.output.requestId,"req-console-gateway-live");
  assert.equal(result.output.agent.id,"arca-primary");
  assert.equal(result.output.output.text,"gateway:continue o trabalho");
  assert.equal(result.output.output.seenTaskId,"req-console-gateway-live");
});
