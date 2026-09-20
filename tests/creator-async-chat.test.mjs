import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createCreatorConsoleServer} from "../packages/workbench/src/creator-server.ts";

async function fixture(t,handlers={}){
  const home=await mkdtemp(join(tmpdir(),"arca-creator-async-"));
  const instance=createCreatorConsoleServer({
    home,host:"127.0.0.1",port:0,
    chatHandler:handlers.chatHandler,
    chatStatusHandler:handlers.chatStatusHandler,
    chatCollectHandler:handlers.chatCollectHandler,
    chatListHandler:handlers.chatListHandler,
    bootstrapTtlMs:60_000,
    sessionTtlMs:120_000
  });
  const address=await instance.start();
  t.after(async()=>{await instance.stop();await rm(home,{recursive:true,force:true})});
  const unlock=await fetch(address.url+"/api/unlock",{
    method:"POST",
    headers:{"Content-Type":"application/json","X-ARCA-Creator-Unlock":"1"},
    body:JSON.stringify({code:address.bootstrap.code})
  });
  const grant=await unlock.json();
  return {address,headers:{"X-ARCA-Creator-Session":grant.token}};
}

test("Creator Console exposes pending status list and collect lifecycle",async(t)=>{
  const requestId="req-creator-async";
  let state="awaiting-reasoning";
  const ctx=await fixture(t,{
    chatHandler:async({requestId:rid})=>({format:"fixture-pending",requestId:rid,state:"awaiting-reasoning"}),
    chatStatusHandler:async({requestId:rid})=>({format:"fixture-status",requestId:rid,state}),
    chatCollectHandler:async({requestId:rid})=>state==="result-ready"
      ?{format:"fixture-result",requestId:rid,state:"completed",output:{text:"async result"}}
      :{format:"fixture-status",requestId:rid,state},
    chatListHandler:async()=>({format:"fixture-list",items:state==="completed"?[]:[{requestId,state}]})
  });

  const summaryResponse=await fetch(ctx.address.url+"/api/state",{headers:ctx.headers});
  const summary=await summaryResponse.json();
  assert.equal(summary.chat.asyncStatus,true);
  assert.equal(summary.chat.collect,true);
  assert.equal(summary.chat.pendingList,true);

  const chatResponse=await fetch(ctx.address.url+"/api/chat",{
    method:"POST",headers:{...ctx.headers,"Content-Type":"application/json"},
    body:JSON.stringify({message:"start asynchronous work",requestId})
  });
  const chat=await chatResponse.json();
  assert.equal(chatResponse.status,200);
  assert.equal(chat.status,"pending");
  assert.equal(chat.reasoningState,"awaiting-reasoning");

  const listResponse=await fetch(ctx.address.url+"/api/chat/pending",{headers:ctx.headers});
  const list=await listResponse.json();
  assert.equal(listResponse.status,200);
  assert.equal(list.output.items[0].requestId,requestId);

  const statusResponse=await fetch(ctx.address.url+"/api/chat/status?requestId="+encodeURIComponent(requestId),{headers:ctx.headers});
  const status=await statusResponse.json();
  assert.equal(status.status,"pending");
  assert.equal(status.reasoningState,"awaiting-reasoning");

  state="result-ready";
  const readyResponse=await fetch(ctx.address.url+"/api/chat/status?requestId="+encodeURIComponent(requestId),{headers:ctx.headers});
  const ready=await readyResponse.json();
  assert.equal(ready.reasoningState,"result-ready");

  const collectResponse=await fetch(ctx.address.url+"/api/chat/collect",{
    method:"POST",headers:{...ctx.headers,"Content-Type":"application/json"},
    body:JSON.stringify({requestId})
  });
  const collected=await collectResponse.json();
  assert.equal(collectResponse.status,200);
  assert.equal(collected.status,"completed");
  assert.equal(collected.output.output.text,"async result");
  assert.equal(collected.coreMutationPerformed,false);
});

test("asynchronous chat status and collect require explicit requestId",async(t)=>{
  const ctx=await fixture(t,{
    chatStatusHandler:async()=>({state:"awaiting-reasoning"}),
    chatCollectHandler:async()=>({state:"completed"})
  });
  const statusResponse=await fetch(ctx.address.url+"/api/chat/status",{headers:ctx.headers});
  const status=await statusResponse.json();
  assert.equal(statusResponse.status,400);
  assert.equal(status.error.code,"REQUEST_ID_REQUIRED");

  const collectResponse=await fetch(ctx.address.url+"/api/chat/collect",{
    method:"POST",headers:{...ctx.headers,"Content-Type":"application/json"},body:JSON.stringify({})
  });
  const collected=await collectResponse.json();
  assert.equal(collectResponse.status,400);
  assert.equal(collected.error.code,"REQUEST_ID_REQUIRED");
});
