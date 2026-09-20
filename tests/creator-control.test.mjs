import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeCreatorCommand,
  createCreatorAuditEvent,
  creatorActionRegistry,
  normalizeCreatorSession,
  verifyCreatorAuditChain
} from "../packages/agent/src/creator-control.ts";

const hash="a".repeat(64);
const baseSession=(overrides={})=>({
  format:"arca-creator-session-v1",
  sessionId:"creator-session-1",
  subject:"creator:primary",
  scopes:["creator.chat","creator.read","creator.review","creator.propose-change","creator.authorize-network","creator.manage-agents","creator.freeze"],
  authMethod:"webauthn",
  credentialIdHash:hash,
  issuedAt:"2026-09-17T20:00:00.000Z",
  expiresAt:"2026-09-17T20:30:00.000Z",
  stepUpAt:"2026-09-17T20:05:00.000Z",
  ...overrides
});
const now=new Date("2026-09-17T20:06:00.000Z");

test("creator chat is allowed with an active scoped WebAuthn session",()=>{
  const decision=authorizeCreatorCommand(baseSession(),{commandId:"cmd-1",type:"chat.send",requestId:"req-1",payload:{message:"status"}},{now});
  assert.equal(decision.allowed,true);
  assert.equal(decision.risk,"low");
  assert.equal(decision.requiredScope,"creator.chat");
});

test("creator commands fail closed when scope is missing",()=>{
  const decision=authorizeCreatorCommand(baseSession({scopes:["creator.read"]}),{commandId:"cmd-2",type:"chat.send"},{now});
  assert.equal(decision.allowed,false);
  assert.match(decision.reason,/scope/i);
});

test("unknown commands cannot become a hidden shell or direct main mutation",()=>{
  const shell=authorizeCreatorCommand(baseSession(),{commandId:"cmd-3",type:"shell.execute",payload:{command:"rm -rf /"}},{now});
  const main=authorizeCreatorCommand(baseSession(),{commandId:"cmd-4",type:"main.write",payload:{path:"README.md"}},{now});
  assert.equal(shell.allowed,false);
  assert.equal(main.allowed,false);
  assert.match(shell.reason,/Action Registry/);
});

test("high-risk creator actions require explicit confirmation and recent step-up",()=>{
  const missing=authorizeCreatorCommand(baseSession(),{commandId:"cmd-5",type:"network.authorize"},{now});
  assert.equal(missing.allowed,false);
  assert.match(missing.reason,/confirmation/i);

  const stale=authorizeCreatorCommand(baseSession({stepUpAt:"2026-09-17T20:00:30.000Z"}),{commandId:"cmd-6",type:"network.authorize",confirmationId:"confirm-6"},{now});
  assert.equal(stale.allowed,false);
  assert.match(stale.reason,/stale/i);

  const allowed=authorizeCreatorCommand(baseSession(),{commandId:"cmd-7",type:"network.authorize",confirmationId:"confirm-7"},{now});
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.risk,"high");
});

test("recovery authentication is deliberately narrow",()=>{
  const recovery=baseSession({authMethod:"recovery",scopes:["creator.read","creator.freeze"]});
  const read=authorizeCreatorCommand(recovery,{commandId:"cmd-8",type:"state.read"},{now});
  const freeze=authorizeCreatorCommand(recovery,{commandId:"cmd-9",type:"system.freeze",confirmationId:"confirm-9"},{now});
  const manage=authorizeCreatorCommand({...recovery,scopes:["creator.manage-agents"]},{commandId:"cmd-10",type:"agents.manage",confirmationId:"confirm-10"},{now});
  assert.equal(read.allowed,true);
  assert.equal(freeze.allowed,true);
  assert.equal(manage.allowed,false);
  assert.match(manage.reason,/recovery/i);
});

test("expired sessions and raw secret fields are rejected",()=>{
  const expired=authorizeCreatorCommand(baseSession({expiresAt:"2026-09-17T20:05:30.000Z",stepUpAt:"2026-09-17T20:05:00.000Z"}),{commandId:"cmd-11",type:"state.read"},{now});
  assert.equal(expired.allowed,false);

  const secret=authorizeCreatorCommand(baseSession(),{commandId:"cmd-12",type:"chat.send",payload:{token:"do-not-store"}},{now});
  assert.equal(secret.allowed,false);
  assert.match(secret.reason,/secrets/i);
});

test("creator sessions are short-lived and contain only credential fingerprints",()=>{
  const normalized=normalizeCreatorSession(baseSession());
  assert.equal(normalized.credentialIdHash,hash);
  assert.throws(()=>normalizeCreatorSession(baseSession({expiresAt:"2026-09-17T22:00:00.000Z"})),/one hour/);
});

test("creator audit trail is hash chained and detects tampering",()=>{
  const session=baseSession();
  const command1={commandId:"cmd-audit-1",type:"chat.send",requestId:"req-audit-1",payload:{message:"hello"}};
  const auth1=authorizeCreatorCommand(session,command1,{now});
  const event1=createCreatorAuditEvent(undefined,{session,command:command1,authorization:auth1,sequence:1,at:now});
  const command2={commandId:"cmd-audit-2",type:"state.read",payload:{view:"checkpoint"}};
  const auth2=authorizeCreatorCommand(session,command2,{now});
  const event2=createCreatorAuditEvent(event1.eventHash,{session,command:command2,authorization:auth2,sequence:2,at:now});
  assert.equal(verifyCreatorAuditChain([event1,event2]),true);
  assert.equal(verifyCreatorAuditChain([event1,{...event2,reason:"tampered"}]),false);
  assert.equal(JSON.stringify([event1,event2]).includes("hello"),false);
});

test("creator action registry exposes only closed structured operations",()=>{
  const types=creatorActionRegistry().map(item=>item.type);
  assert.deepEqual(types,["chat.send","state.read","review.read","review.decide","change.propose","workflow.read","workflow.propose","workflow.register","workflow.reason","network.authorize","agents.manage","system.freeze"]);
});
