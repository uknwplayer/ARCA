import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {EncryptedCredentialVault,createMemoryCredentialStore} from "../packages/agent/src/credential-vault.ts";
import {createVaultWorkDispatchSignerBroker} from "../src/machine-bridge/work-dispatch-signer-broker.mjs";
import {buildWorkDispatchPayload,signWorkDispatchPayload,verifyWorkDispatchEnvelope,workDispatchPublicKeyFingerprint} from "../src/machine-bridge/work-dispatch-v1.mjs";

const KEY_REF="vault://work/dispatch-signing-key";
const MASTER="work signer broker master";
function job(){return {format:"arca-remote-job-v3",protocolVersion:3,jobId:"job-vault-work-1",requestId:"req-vault-work-1",action:"worker.ping",requires:[],params:{echo:"VAULT"}}}
async function fixture(){
  const store=createMemoryCredentialStore();
  const vault=new EncryptedCredentialVault({store,keyProvider:async()=>MASTER,clock:()=>new Date("2026-09-20T12:00:00Z")});
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const publicKeySpki=Buffer.from(publicKey.export({type:"spki",format:"der"})).toString("base64");
  const keyFingerprint=workDispatchPublicKeyFingerprint(publicKeySpki);
  await vault.storeCredential(KEY_REF,privateKey.export({type:"pkcs8",format:"pem"}),{kind:"work-dispatch-ed25519"});
  const broker=createVaultWorkDispatchSignerBroker({vault,publicKeySpki,keyFingerprint,keyRef:KEY_REF});
  return {vault,broker,keyFingerprint,publicKeySpki};
}

test("vault Work signer exposes no private key or keyRef",async()=>{
  const {broker,keyFingerprint}=await fixture();
  assert.equal(broker.descriptor().keyFingerprint,keyFingerprint);
  assert.equal(broker.descriptor().keySource,"vault");
  const serialized=JSON.stringify(broker);
  assert.equal(serialized.includes("vault://"),false);
  assert.equal(serialized.includes("PRIVATE KEY"),false);
  assert.equal("keyRef" in broker,false);
  assert.equal("privateKey" in broker,false);
});

test("vault Work signer produces envelope accepted by explicit trust anchor",async()=>{
  const {vault,broker,keyFingerprint}=await fixture();
  const payload=buildWorkDispatchPayload(job(),{createdAt:"2026-09-20T12:00:00Z",reply:{repository:"example/arca",pullRequest:141}});
  const envelope=await signWorkDispatchPayload(payload,{signer:broker});
  const verified=verifyWorkDispatchEnvelope(envelope,{trustedFingerprints:[keyFingerprint],now:"2026-09-20T12:01:00Z"});
  assert.equal(verified.keyFingerprint,keyFingerprint);
  const audit=await vault.auditCredential(KEY_REF);
  assert.ok(audit.auditEvents.some(event=>event.operation==="credential.used"&&String(event.details.purpose).startsWith("work-dispatch-sign:")));
  assert.equal(JSON.stringify(audit).includes("PRIVATE KEY"),false);
});

test("wrong vault private key fails closed with sanitized error",async()=>{
  const store=createMemoryCredentialStore();
  const vault=new EncryptedCredentialVault({store,keyProvider:async()=>MASTER});
  const expected=generateKeyPairSync("ed25519");
  const wrong=generateKeyPairSync("ed25519");
  const publicKeySpki=Buffer.from(expected.publicKey.export({type:"spki",format:"der"})).toString("base64");
  await vault.storeCredential(KEY_REF,wrong.privateKey.export({type:"pkcs8",format:"pem"}));
  const broker=createVaultWorkDispatchSignerBroker({vault,publicKeySpki,keyRef:KEY_REF});
  await assert.rejects(()=>broker.sign(Buffer.from("hello")),error=>error.code==="ARCA_WORK_SIGNER_IDENTITY_MISMATCH"&&!error.message.includes(KEY_REF));
});

test("broker rejects non-vault references before credential access",()=>{
  const pair=generateKeyPairSync("ed25519");
  const publicKeySpki=Buffer.from(pair.publicKey.export({type:"spki",format:"der"})).toString("base64");
  assert.throws(()=>createVaultWorkDispatchSignerBroker({vault:{withCredential(){throw new Error("must not run")}},publicKeySpki,keyRef:"raw-key"}),/requires vault:\/\//);
});
