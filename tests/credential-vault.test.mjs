import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  EncryptedCredentialVault,
  createCredentialBroker,
  createFilesystemCredentialStore,
  createMemoryCredentialStore,
  getCredentialSecurityNotice
} from "../packages/agent/src/credential-vault.ts";

const MASTER="correct horse battery staple";
const keyProvider=async()=>MASTER;

test("vault stores ciphertext and exposes metadata only",async()=>{
  const store=createMemoryCredentialStore();const vault=new EncryptedCredentialVault({store,keyProvider});
  const meta=await vault.storeCredential("vault://openai/main","sk-TOP-SECRET",{provider:"openai"});
  assert.equal(meta.algorithm,"aes-256-gcm");
  assert.equal(JSON.stringify(meta).includes("TOP-SECRET"),false);
  const raw=(await store.listCredentialRecords())[0];
  assert.equal(raw.ciphertext.includes("TOP-SECRET"),false);
  assert.equal(JSON.stringify(raw).includes("sk-TOP-SECRET"),false);
  const listed=await vault.listCredentials();
  assert.equal(listed.length,1);
  assert.equal("ciphertext" in listed[0],false);
});

test("wrong master secret cannot decrypt credential",async()=>{
  const store=createMemoryCredentialStore();const vault=new EncryptedCredentialVault({store,keyProvider});
  await vault.storeCredential("vault://provider/key","SECRET-VALUE");
  const wrong=new EncryptedCredentialVault({store,keyProvider:async()=>"wrong master"});
  await assert.rejects(()=>wrong.withCredential("vault://provider/key","test",async()=>null));
});

test("credential broker authenticates request without returning plaintext to gateway",async()=>{
  const store=createMemoryCredentialStore();const vault=new EncryptedCredentialVault({store,keyProvider});
  await vault.storeCredential("vault://agent/example","TOP-SECRET");
  const calls=[];const fetchImpl=async(url,init)=>{calls.push({url,init});return new Response("{}",{status:200})};
  const broker=createCredentialBroker(vault,{fetchImpl});
  const response=await broker.authorizedFetch({auth:{mode:"bearer",credentialRef:"vault://agent/example"},url:"https://agent.example.test/arca/jobs",init:{method:"POST",headers:{Accept:"application/json"}}});
  assert.equal(response.status,200);
  assert.equal(calls[0].init.headers.Authorization,"Bearer TOP-SECRET");
  const audit=await vault.auditCredential("vault://agent/example");
  assert.equal(JSON.stringify(audit).includes("TOP-SECRET"),false);
  assert.ok(audit.auditEvents.some(event=>event.operation==="credential.used"));
});

test("audit trail is hash chained and detects tampering",async()=>{
  const store=createMemoryCredentialStore();const vault=new EncryptedCredentialVault({store,keyProvider,clock:()=>new Date("2026-09-16T12:00:00.000Z")});
  await vault.storeCredential("vault://one/key","ONE");
  await vault.storeCredential("vault://one/key","TWO");
  const verified=await vault.verifyAuditTrail();
  assert.equal(verified.valid,true);assert.equal(verified.eventCount,2);assert.match(verified.eventHead,/^[a-f0-9]{64}$/);
  const events=await store.listAuditEvents();events[0].operation="tampered";
  const tampered={...store,async listAuditEvents(){return events}};
  const reader=new EncryptedCredentialVault({store:tampered,keyProvider});
  await assert.rejects(()=>reader.verifyAuditTrail(),/hash de auditoria invalido/);
});

test("filesystem vault persists only encrypted material with audit log",async t=>{
  const root=await mkdtemp(join(tmpdir(),"arca-vault-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=createFilesystemCredentialStore(root);const vault=new EncryptedCredentialVault({store,keyProvider});
  await vault.storeCredential("vault://google/main","AIza-SECRET",{provider:"google"});
  const records=await store.listCredentialRecords();assert.equal(records.length,1);assert.equal(JSON.stringify(records).includes("AIza-SECRET"),false);
  const auditText=await readFile(join(root,"audit.ndjson"),"utf8");assert.equal(auditText.includes("AIza-SECRET"),false);
  const audit=await vault.auditCredential("vault://google/main");assert.equal(audit.auditTrail.valid,true);
});

test("security notice is explicit about guarantees and memory limitations",()=>{
  const notice=getCredentialSecurityNotice();
  assert.equal(notice.format,"arca-credential-security-notice-v1");
  assert.ok(notice.guarantees.some(item=>item.includes("AES-256-GCM")));
  assert.ok(notice.userAudit.length>=4);
  assert.ok(notice.limitations.some(item=>item.includes("memoria")));
});
