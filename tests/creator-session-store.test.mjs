import test from "node:test";
import assert from "node:assert/strict";
import {CreatorSessionStore,authorizeCreatorCommand,normalizeCreatorSession} from "../packages/agent/src/index.ts";

const t0=new Date("2026-09-17T20:00:00.000Z");

test("local Creator bootstrap is single-use and mints only chat/read scopes",()=>{
  const store=new CreatorSessionStore({bootstrapTtlMs:60_000,sessionTtlMs:120_000});
  const bootstrap=store.issueBootstrap({now:t0});
  const grant=store.exchangeBootstrap(bootstrap.code,{now:new Date(t0.getTime()+1000)});
  assert.equal(grant.session.authMethod,"local-bootstrap");
  assert.deepEqual(grant.session.scopes,["creator.chat","creator.read"]);
  assert.equal(store.resolve(grant.token,{now:new Date(t0.getTime()+2000)})?.sessionId,grant.session.sessionId);
  assert.throws(()=>store.exchangeBootstrap(bootstrap.code,{now:new Date(t0.getTime()+3000)}),/bootstrap invalido/);
});

test("wrong bootstrap does not consume the valid one and expired sessions resolve to null",()=>{
  const store=new CreatorSessionStore({bootstrapTtlMs:60_000,sessionTtlMs:2_000});
  const bootstrap=store.issueBootstrap({now:t0});
  assert.throws(()=>store.exchangeBootstrap("wrong-code",{now:new Date(t0.getTime()+500)}),/bootstrap invalido/);
  const grant=store.exchangeBootstrap(bootstrap.code,{now:new Date(t0.getTime()+1000)});
  assert.ok(store.resolve(grant.token,{now:new Date(t0.getTime()+2000)}));
  assert.equal(store.resolve(grant.token,{now:new Date(t0.getTime()+3001)}),null);
});

test("local bootstrap cannot be expanded into elevated Creator scopes",()=>{
  assert.throws(()=>normalizeCreatorSession({
    format:"arca-creator-session-v1",sessionId:"creator-local",subject:"creator:primary",scopes:["creator.review"],authMethod:"local-bootstrap",credentialIdHash:"a".repeat(64),issuedAt:"2026-09-17T20:00:00.000Z",expiresAt:"2026-09-17T20:10:00.000Z"
  }),/exceeds low-risk scopes/);
});

test("local Creator grant authorizes chat/read but no unknown action",()=>{
  const store=new CreatorSessionStore({bootstrapTtlMs:60_000,sessionTtlMs:120_000});
  const bootstrap=store.issueBootstrap({now:t0});
  const {session}=store.exchangeBootstrap(bootstrap.code,{now:new Date(t0.getTime()+1000)});
  const now=new Date(t0.getTime()+1500);
  assert.equal(authorizeCreatorCommand(session,{commandId:"cmd-chat",type:"chat.send",payload:{message:"status"}},{now}).allowed,true);
  assert.equal(authorizeCreatorCommand(session,{commandId:"cmd-read",type:"state.read"},{now}).allowed,true);
  assert.equal(authorizeCreatorCommand(session,{commandId:"cmd-shell",type:"shell.execute"},{now}).allowed,false);
});
