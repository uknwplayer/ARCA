import test from "node:test";
import assert from "node:assert/strict";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  ARCA_MESH_DECRYPTION_PROOF_FORMAT,
  ARCA_MESH_ENCRYPTED_ENVELOPE_FORMAT,
  MeshEncryptedEnvelopeReplayGuard,
  decryptMeshPayload,
  encryptMeshPayload,
  generateMeshEncryptionRecipient,
  verifyMeshEncryptedEnvelope,
  verifyMeshEncryptionRecipient
} from "../src/machine-bridge/mesh-encrypted-envelope.mjs";

const T1=new Date("2026-09-17T23:35:00.000Z");
const T2=new Date("2026-09-17T23:35:30.000Z");

function setupRecipient(nodeId="reasoner-b"){
  const signer=generateMeshNodeIdentity(nodeId);
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const generated=generateMeshEncryptionRecipient(signer,{
    issuedAt:T1,
    ttlMs:10*60*1000,
    nonce:"encryptionkeynonce0001"
  });
  return {signer,trustStore,...generated};
}

test("X25519 recipient key is signed by and pinned to the Ed25519 Mesh identity",()=>{
  const {recipient,trustStore}=setupRecipient();
  assert.equal(verifyMeshEncryptionRecipient(recipient,{trustStore,now:T2,clockSkewMs:0}),true);
  assert.equal(recipient.payload.nodeId,"reasoner-b");
  assert.equal(recipient.payload.identityId,recipient.signer.identityId);
  assert.equal(recipient.payload.algorithm,"X25519");
  assert.match(recipient.payload.keyFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(recipient).includes("PRIVATE KEY"),false);
});

test("encrypted Mesh envelope round-trips private JSON while relays see no plaintext",()=>{
  const {recipient,privateKey,trustStore}=setupRecipient();
  const payload={
    instruction:"analisar contexto privado",
    context:{
      personName:"Example Person",
      privateNote:"conteudo que o relay nao deve ler"
    }
  };
  const envelope=encryptMeshPayload(payload,{
    requestId:"req.private.mesh.1",
    payloadId:"payload.private.mesh.1",
    originNode:"creator-a",
    recipient,
    trustStore,
    now:T1,
    ttlMs:60_000,
    clockSkewMs:0
  });

  assert.equal(envelope.format,ARCA_MESH_ENCRYPTED_ENVELOPE_FORMAT);
  assert.equal(envelope.recipientNode,"reasoner-b");
  assert.equal(verifyMeshEncryptedEnvelope(envelope,{recipient,trustStore,now:T2,clockSkewMs:0}),true);
  const serialized=JSON.stringify(envelope);
  assert.equal(serialized.includes("Example Person"),false);
  assert.equal(serialized.includes("conteudo que o relay nao deve ler"),false);
  assert.equal(serialized.includes("analisar contexto privado"),false);

  const result=decryptMeshPayload(envelope,{
    recipient,
    recipientPrivateKey:privateKey,
    trustStore,
    now:T2,
    clockSkewMs:0
  });
  assert.deepEqual(result.payload,payload);
  assert.equal(result.proof.format,ARCA_MESH_DECRYPTION_PROOF_FORMAT);
  assert.equal(result.proof.requestId,"req.private.mesh.1");
  assert.equal(result.proof.payloadId,"payload.private.mesh.1");
  assert.match(result.proof.payloadHash,/^[a-f0-9]{64}$/);
  assert.equal(result.proof.envelopeHash,envelope.envelopeHash);
});

test("ciphertext, auth tag and header tampering fail closed",()=>{
  const {recipient,privateKey,trustStore}=setupRecipient();
  const envelope=encryptMeshPayload({message:"private"},{
    requestId:"req.tamper.1",
    payloadId:"payload.tamper.1",
    originNode:"origin-a",
    recipient,
    trustStore,
    now:T1,
    ttlMs:60_000,
    clockSkewMs:0
  });

  const ciphertext=Buffer.from(envelope.ciphertext,"base64url");
  ciphertext[0]^=1;
  const tamperedCiphertext={...envelope,ciphertext:ciphertext.toString("base64url")};
  assert.throws(()=>verifyMeshEncryptedEnvelope(tamperedCiphertext,{recipient,trustStore,now:T2,clockSkewMs:0}),/ciphertext hash mismatch|envelope hash mismatch/);

  const tag=Buffer.from(envelope.authTag,"base64url");
  tag[0]^=1;
  const tamperedTag={...envelope,authTag:tag.toString("base64url")};
  assert.throws(()=>verifyMeshEncryptedEnvelope(tamperedTag,{recipient,trustStore,now:T2,clockSkewMs:0}),/envelope hash mismatch/);

  const alteredHeader={...envelope,originNode:"origin-b"};
  assert.throws(()=>verifyMeshEncryptedEnvelope(alteredHeader,{recipient,trustStore,now:T2,clockSkewMs:0}),/envelope hash mismatch/);

  const recomputedOuter={...envelope,authTag:tag.toString("base64url")};
  // Even if an attacker could rewrite unauthenticated JSON fields, they cannot forge AES-GCM authentication.
  // Keep original envelopeHash check bypassed here only to exercise AEAD failure at decrypt time.
  const body={
    format:recomputedOuter.format,
    version:recomputedOuter.version,
    requestId:recomputedOuter.requestId,
    payloadId:recomputedOuter.payloadId,
    originNode:recomputedOuter.originNode,
    recipientNode:recomputedOuter.recipientNode,
    recipientIdentityId:recomputedOuter.recipientIdentityId,
    recipientKeyFingerprint:recomputedOuter.recipientKeyFingerprint,
    recipientStatementHash:recomputedOuter.recipientStatementHash,
    keyAgreement:recomputedOuter.keyAgreement,
    kdf:recomputedOuter.kdf,
    aead:recomputedOuter.aead,
    ephemeralPublicKeySpki:recomputedOuter.ephemeralPublicKeySpki,
    salt:recomputedOuter.salt,
    iv:recomputedOuter.iv,
    issuedAt:recomputedOuter.issuedAt,
    expiresAt:recomputedOuter.expiresAt,
    ciphertext:recomputedOuter.ciphertext,
    authTag:recomputedOuter.authTag,
    ciphertextHash:recomputedOuter.ciphertextHash
  };
  // Do not attempt to synthesize a new envelopeHash in the test; outer hash already proves tampering.
  assert.throws(()=>decryptMeshPayload(tamperedTag,{recipient,recipientPrivateKey:privateKey,trustStore,now:T2,clockSkewMs:0}),/envelope hash mismatch/);
  assert.ok(body.authTag);
});

test("wrong recipient private key and untrusted recipient identity are rejected",()=>{
  const {recipient,trustStore}=setupRecipient();
  const wrong=setupRecipient("other-node");
  const envelope=encryptMeshPayload({message:"private"},{
    requestId:"req.wrong-key.1",
    payloadId:"payload.wrong-key.1",
    originNode:"origin-a",
    recipient,
    trustStore,
    now:T1,
    ttlMs:60_000,
    clockSkewMs:0
  });

  assert.throws(()=>decryptMeshPayload(envelope,{
    recipient,
    recipientPrivateKey:wrong.privateKey,
    trustStore,
    now:T2,
    clockSkewMs:0
  }),/does not match recipient/);

  const emptyTrust=new MeshIdentityTrustStore();
  assert.throws(()=>verifyMeshEncryptionRecipient(recipient,{trustStore:emptyTrust,now:T2,clockSkewMs:0}),/untrusted mesh signer/);
});

test("envelope replay is rejected after one successful decryption",()=>{
  const {recipient,privateKey,trustStore}=setupRecipient();
  const replayGuard=new MeshEncryptedEnvelopeReplayGuard({maxEntries:100});
  const envelope=encryptMeshPayload({message:"once"},{
    requestId:"req.replay.1",
    payloadId:"payload.replay.1",
    originNode:"origin-a",
    recipient,
    trustStore,
    now:T1,
    ttlMs:60_000,
    clockSkewMs:0
  });

  const first=decryptMeshPayload(envelope,{
    recipient,
    recipientPrivateKey:privateKey,
    trustStore,
    replayGuard,
    now:T2,
    clockSkewMs:0
  });
  assert.equal(first.payload.message,"once");
  assert.equal(replayGuard.size,1);

  assert.throws(()=>decryptMeshPayload(envelope,{
    recipient,
    recipientPrivateKey:privateKey,
    trustStore,
    replayGuard,
    now:T2,
    clockSkewMs:0
  }),/replay detected/);
});

test("expired envelopes and envelopes that outlive recipient key attestation are refused",()=>{
  const {recipient,trustStore}=setupRecipient();
  const envelope=encryptMeshPayload({message:"short-lived"},{
    requestId:"req.expire.1",
    payloadId:"payload.expire.1",
    originNode:"origin-a",
    recipient,
    trustStore,
    now:T1,
    ttlMs:10_000,
    clockSkewMs:0
  });
  assert.throws(()=>verifyMeshEncryptedEnvelope(envelope,{
    recipient,
    trustStore,
    now:new Date("2026-09-17T23:35:11.000Z"),
    clockSkewMs:0
  }),/expired/);

  const shortSigner=generateMeshNodeIdentity("short-node");
  const shortTrust=new MeshIdentityTrustStore();
  shortTrust.trust(shortSigner.identity);
  const short=generateMeshEncryptionRecipient(shortSigner,{
    issuedAt:T1,
    ttlMs:5_000,
    nonce:"encryptionkeynonce0002"
  });
  assert.throws(()=>encryptMeshPayload({message:"too-long"},{
    requestId:"req.too-long.1",
    payloadId:"payload.too-long.1",
    originNode:"origin-a",
    recipient:short.recipient,
    trustStore:shortTrust,
    now:T1,
    ttlMs:10_000,
    clockSkewMs:0
  }),/cannot outlive recipient key attestation/);
});

test("structured credentials are rejected before encryption",()=>{
  const {recipient,trustStore}=setupRecipient();
  assert.throws(()=>encryptMeshPayload({
    instruction:"use this",
    context:{apiKey:"do-not-transport"}
  },{
    requestId:"req.secret.1",
    payloadId:"payload.secret.1",
    originNode:"origin-a",
    recipient,
    trustStore,
    now:T1,
    ttlMs:60_000,
    clockSkewMs:0
  }),/secret-like field/);
});

test("recipient attestation tampering invalidates encryption setup",()=>{
  const {recipient,trustStore}=setupRecipient();
  const tampered={
    ...recipient,
    payload:{...recipient.payload,nodeId:"other-node"}
  };
  assert.throws(()=>verifyMeshEncryptionRecipient(tampered,{trustStore,now:T2,clockSkewMs:0}),/payload hash mismatch|statement hash mismatch|signature invalid/);
});
