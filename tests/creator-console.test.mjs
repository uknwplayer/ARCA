import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createCreatorConsoleServer} from "../packages/workbench/src/creator-server.ts";

async function startFixture(t,{chatHandler}={}){
  const home=await mkdtemp(join(tmpdir(),"arca-creator-console-"));
  const instance=createCreatorConsoleServer({home,host:"127.0.0.1",port:0,chatHandler,bootstrapTtlMs:60_000,sessionTtlMs:120_000});
  const address=await instance.start();
  t.after(async()=>{await instance.stop();await rm(home,{recursive:true,force:true})});
  return {home,instance,address};
}

async function unlock(address,code,{header=true}={}){
  const response=await fetch(`${address.url}/api/unlock`,{method:"POST",headers:{"Content-Type":"application/json",...(header?{"X-ARCA-Creator-Unlock":"1"}:{})},body:JSON.stringify({code})});
  return {response,payload:await response.json()};
}

test("Creator Console is local-only and serves defensive browser shell",async(t)=>{
  const {address}=await startFixture(t);
  const response=await fetch(`${address.url}/`);const html=await response.text();
  assert.equal(response.status,200);assert.match(html,/Creator Console/);assert.equal(response.headers.get("x-frame-options"),"DENY");assert.match(response.headers.get("content-security-policy"),/default-src 'self'/);
  assert.throws(()=>createCreatorConsoleServer({home:"/tmp/arca-creator-remote",host:"0.0.0.0",port:0}),/somente bind loopback/);
});

test("ephemeral unlock is custom-header protected, single-use and creates a short local Creator session",async(t)=>{
  const {address}=await startFixture(t);
  const missing=await unlock(address,address.bootstrap.code,{header:false});assert.equal(missing.response.status,403);assert.equal(missing.payload.error.code,"UNLOCK_HEADER_REQUIRED");
  const granted=await unlock(address,address.bootstrap.code);assert.equal(granted.response.status,200);assert.equal(granted.payload.session.authMethod,"local-bootstrap");assert.deepEqual(granted.payload.session.scopes,["creator.chat","creator.read"]);assert.ok(granted.payload.token);
  const reused=await unlock(address,address.bootstrap.code);assert.equal(reused.response.status,401);assert.equal(reused.payload.error.code,"CREATOR_UNLOCK_REJECTED");
});

test("authenticated Creator can read state and chat through arca-primary hook without raw payload in audit",async(t)=>{
  const secretPhrase="mensagem-creator-nao-deve-ir-ao-audit";
  const {home,address}=await startFixture(t,{chatHandler:async({message,requestId})=>({reply:`ARCA recebeu: ${message}`,requestId})});
  const grant=await unlock(address,address.bootstrap.code);const token=grant.payload.token;const headers={"X-ARCA-Creator-Session":token};
  const stateResponse=await fetch(`${address.url}/api/state`,{headers});const state=await stateResponse.json();assert.equal(stateResponse.status,200);assert.equal(state.agent,"arca-primary");assert.equal(state.agentAvailable,true);assert.equal(state.localOnly,true);
  const chatResponse=await fetch(`${address.url}/api/chat`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({message:secretPhrase,requestId:"req-creator-test"})});const chat=await chatResponse.json();assert.equal(chatResponse.status,200);assert.equal(chat.requestId,"req-creator-test");assert.equal(chat.coreMutationPerformed,false);assert.match(chat.output.reply,/ARCA recebeu/);
  const audit=await readFile(join(home,"creator-control","audit.jsonl"),"utf8");assert.equal(audit.includes(secretPhrase),false);assert.match(audit,/arca-creator-audit-v1/);
});

test("Creator chat fails explicitly when no reasoning provider is connected",async(t)=>{
  const {address}=await startFixture(t);const grant=await unlock(address,address.bootstrap.code);const response=await fetch(`${address.url}/api/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-ARCA-Creator-Session":grant.payload.token},body:JSON.stringify({message:"prossiga"})});const payload=await response.json();assert.equal(response.status,503);assert.equal(payload.error.code,"ARCA_PRIMARY_UNAVAILABLE");
});
