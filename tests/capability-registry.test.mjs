import test from "node:test";
import assert from "node:assert/strict";
import {AgentRegistry} from "../packages/agent/src/gateway.ts";
import {
  ARCA_CAPABILITY_CATALOG_FORMAT,
  ARCA_CAPABILITY_PASSPORT_FORMAT,
  CapabilityRegistry,
  createCapabilityRegistryFromAgents,
  verifyCapabilityVerificationChain
} from "../packages/agent/src/capability-registry.ts";

const T1="2026-09-17T13:00:00.000Z";
const T2="2026-09-17T14:00:00.000Z";

test("self-declared capabilities cannot promote themselves to verified",()=>{
  const registry=new CapabilityRegistry();
  const passport=registry.registerParticipant({
    participantId:"agent.example",
    kind:"agent",
    provider:"example",
    model:"example-v1",
    capabilities:[{id:"document.analyze",status:"verified",version:"1",input:["text"],output:["json"]}]
  },{updatedAt:T1});
  assert.equal(passport.format,ARCA_CAPABILITY_PASSPORT_FORMAT);
  assert.equal(passport.capabilities[0].status,"declared");
  assert.match(passport.capabilities[0].fingerprint,/^[a-f0-9]{64}$/);
});

test("successful conformance verification promotes capability and creates auditable hash chain",()=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"agent.test",kind:"agent",provider:"local",capabilities:["research"]},{updatedAt:T1});
  const record=registry.recordVerification({participantId:"agent.test",capabilityId:"research",verifierId:"arca-conformance",passed:true,testedAt:T2,evidenceHash:"a".repeat(64)});
  assert.equal(record.outcome,"passed");
  assert.match(record.recordHash,/^[a-f0-9]{64}$/);
  assert.equal(registry.getPassport("agent.test").capabilities[0].status,"verified");
  assert.equal(registry.getPassport("agent.test").capabilities[0].verifiedAt,T2);
  assert.equal(registry.verifyAudit("agent.test"),true);
});

test("verification history is chained and tampering is detectable",()=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"agent.audit",kind:"agent",provider:"local",capabilities:["summarization"]},{updatedAt:T1});
  registry.recordVerification({participantId:"agent.audit",capabilityId:"summarization",passed:true,testedAt:T1});
  registry.recordVerification({participantId:"agent.audit",capabilityId:"summarization",passed:false,testedAt:T2,notes:"fixture regression"});
  const history=registry.getVerificationHistory("agent.audit");
  assert.equal(history.length,2);
  assert.equal(history[1].previousRecordHash,history[0].recordHash);
  assert.equal(verifyCapabilityVerificationChain(history),true);
  history[1].notes="tampered";
  assert.equal(verifyCapabilityVerificationChain(history),false);
  assert.equal(registry.getPassport("agent.audit").capabilities[0].status,"degraded");
});

test("environment or model changes require capability re-verification",()=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"agent.mutable",kind:"agent",provider:"example",model:"v1",capabilities:["research"]},{updatedAt:T1});
  registry.recordVerification({participantId:"agent.mutable",capabilityId:"research",passed:true,testedAt:T1});
  const before=registry.getPassport("agent.mutable").capabilities[0];
  const after=registry.upsertParticipant({participantId:"agent.mutable",kind:"agent",provider:"example",model:"v2",capabilities:["research"]},{updatedAt:T2}).capabilities[0];
  assert.notEqual(after.fingerprint,before.fingerprint);
  assert.equal(after.status,"verification-needed");
  assert.equal(after.verifiedAt,null);
});

test("compatibility lookup defaults to verified capabilities and never implies authorization",()=>{
  const registry=new CapabilityRegistry();
  registry.registerParticipant({participantId:"agent.declared",kind:"agent",provider:"x",capabilities:["research"]},{updatedAt:T1});
  registry.registerParticipant({participantId:"agent.verified",kind:"agent",provider:"y",capabilities:["research"]},{updatedAt:T1});
  registry.recordVerification({participantId:"agent.verified",capabilityId:"research",passed:true,testedAt:T1});
  assert.deepEqual(registry.findCompatible(["research"]).map(item=>item.participantId),["agent.verified"]);
  assert.deepEqual(registry.findCompatible(["research"],{includeDeclared:true}).map(item=>item.participantId),["agent.declared","agent.verified"]);
  const snapshot=registry.snapshot({generatedAt:T2});
  assert.equal(snapshot.format,ARCA_CAPABILITY_CATALOG_FORMAT);
  assert.equal(snapshot.authorizationIncluded,false);
});

test("AgentRegistry can be catalogued without exposing connection credentials",()=>{
  const agents=new AgentRegistry();
  agents.registerInternal({id:"arca-primary",provider:"arca",principal:true,capabilities:["reasoning","research"]},async()=>({}));
  agents.registerExternal({
    id:"external-one",
    provider:"example",
    capabilities:["summarization"],
    connection:{endpoint:"https://agent.example.test",auth:{mode:"bearer",credentialRef:"vault://external-one"}}
  });
  const capabilities=createCapabilityRegistryFromAgents(agents,{updatedAt:T1});
  const catalog=capabilities.snapshot({generatedAt:T1});
  assert.deepEqual(catalog.passports.map(item=>item.participantId),["arca-primary","external-one"]);
  assert.ok(catalog.passports.every(item=>item.capabilities.every(capability=>capability.status==="declared")));
  assert.equal(JSON.stringify(catalog).includes("vault://"),false);
  assert.equal(JSON.stringify(catalog).includes("credentialRef"),false);
});

test("sensitive credential-like metadata is rejected from passports",()=>{
  const registry=new CapabilityRegistry();
  assert.throws(()=>registry.registerParticipant({participantId:"bad",kind:"agent",provider:"x",labels:{apiKey:"secret"},capabilities:[]}),/campo sensivel/);
  assert.throws(()=>registry.setCapabilityStatus("missing","research","verified"),/verified exige recordVerification/);
});
