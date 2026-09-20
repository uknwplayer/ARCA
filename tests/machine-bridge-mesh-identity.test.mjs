import test from "node:test";
import assert from "node:assert/strict";
import {
  MESH_NODE_ADVERTISEMENT_DOMAIN,
  MESH_RECEIPT_DOMAIN,
  MeshIdentityTrustStore,
  MeshReplayGuard,
  createMeshNodeIdentity,
  generateMeshNodeIdentity,
  signMeshNodeAdvertisement,
  signMeshReceipt,
  signMeshStatement,
  verifyMeshNodeIdentity,
  verifyMeshSignedStatement,
  verifySignedMeshNodeAdvertisement,
  verifySignedMeshReceipt
} from "../src/machine-bridge/mesh-identity.mjs";

const T1=new Date("2026-09-17T23:20:00.000Z");
const T2=new Date("2026-09-17T23:20:30.000Z");

function advertisement(nodeId="mesh-node-a"){
  return {
    format:"arca-mesh-node-v1",
    meshVersion:1,
    nodeId,
    kind:"endpoint",
    capabilities:["reasoning"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:T1.toISOString(),
    metadata:{operator:"fixture"},
    transport:{kind:"private-direct"}
  };
}
function receipt(nodeId="mesh-node-a"){
  return {
    nodeId,
    nextNode:"mesh-node-b",
    hop:1,
    requestId:"req-mesh-identity-1",
    jobId:"job-mesh-identity-1",
    forwardedAt:T1.toISOString(),
    previousHash:"a".repeat(64),
    receiptHash:"b".repeat(64)
  };
}

test("Mesh Ed25519 identity binds node alias to a public-key fingerprint",()=>{
  const generated=generateMeshNodeIdentity("mesh-node-a");
  assert.equal(verifyMeshNodeIdentity(generated.identity),true);
  assert.match(generated.identity.keyFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(generated.identity.identityId,"ed25519:"+generated.identity.keyFingerprint);
  assert.equal(generated.privateKey.type,"private");
  assert.equal(JSON.stringify(generated.identity).includes("PRIVATE"),false);
  assert.equal(verifyMeshNodeIdentity({...generated.identity,nodeId:"mesh-node-b"}),false);
});

test("signed node advertisement verifies domain, identity, payload and signature",()=>{
  const signer=generateMeshNodeIdentity("mesh-node-a");
  const statement=signMeshNodeAdvertisement(advertisement(),signer,{
    nonce:"advertisementnonce0001",
    issuedAt:T1,
    ttlMs:60_000
  });
  assert.equal(statement.domain,MESH_NODE_ADVERTISEMENT_DOMAIN);
  assert.equal(verifySignedMeshNodeAdvertisement(statement,{now:T2,clockSkewMs:0}),true);
  assert.equal(verifyMeshSignedStatement(statement,{expectedNodeId:"mesh-node-a",now:T2,clockSkewMs:0}),true);

  assert.throws(()=>verifySignedMeshNodeAdvertisement({
    ...statement,
    payload:{...statement.payload,capabilities:["reasoning","repository"]}
  },{now:T2,clockSkewMs:0}),/payload hash mismatch|statement hash mismatch|signature invalid/);

  assert.throws(()=>verifySignedMeshNodeAdvertisement({
    ...statement,
    signer:{...statement.signer,nodeId:"mesh-node-b"}
  },{now:T2,clockSkewMs:0}),/identity|signer|hash|signature/);
});

test("signed statements fail closed on expiry, future issuance and domain mismatch",()=>{
  const signer=generateMeshNodeIdentity("mesh-node-a");
  const statement=signMeshNodeAdvertisement(advertisement(),signer,{
    nonce:"advertisementnonce0002",
    issuedAt:T1,
    ttlMs:10_000
  });
  assert.throws(()=>verifySignedMeshNodeAdvertisement(statement,{
    now:new Date("2026-09-17T23:20:11.000Z"),
    clockSkewMs:0
  }),/expired/);

  const future=signMeshNodeAdvertisement(advertisement(),signer,{
    nonce:"advertisementnonce0003",
    issuedAt:new Date("2026-09-17T23:30:00.000Z"),
    ttlMs:60_000
  });
  assert.throws(()=>verifySignedMeshNodeAdvertisement(future,{now:T1,clockSkewMs:0}),/not yet valid/);
  assert.throws(()=>verifyMeshSignedStatement(statement,{expectedDomain:MESH_RECEIPT_DOMAIN,now:T1,clockSkewMs:0}),/domain mismatch/);
});

test("Replay guard rejects the same signed nonce and prunes only after accepted validity window",()=>{
  const signer=generateMeshNodeIdentity("mesh-node-a");
  const statement=signMeshNodeAdvertisement(advertisement(),signer,{
    nonce:"advertisementnonce0004",
    issuedAt:T1,
    ttlMs:60_000
  });
  const guard=new MeshReplayGuard({maxEntries:100});
  assert.equal(guard.accept(statement,{now:T2,clockSkewMs:0}),true);
  assert.equal(guard.size,1);
  assert.throws(()=>guard.accept(statement,{now:T2,clockSkewMs:0}),/replay detected/);
});

test("trust store pins a node key and requires explicit rotation",()=>{
  const first=generateMeshNodeIdentity("mesh-node-a");
  const second=generateMeshNodeIdentity("mesh-node-a");
  const trust=new MeshIdentityTrustStore();
  trust.trust(first.identity);
  assert.throws(()=>trust.trust(second.identity),/rotation requires explicit replace/);

  const firstStatement=signMeshNodeAdvertisement(advertisement(),first,{
    nonce:"advertisementnonce0005",
    issuedAt:T1,
    ttlMs:60_000
  });
  assert.equal(trust.verify(firstStatement,{now:T2,clockSkewMs:0}),true);

  trust.rotate("mesh-node-a",second.identity,{expectedCurrentFingerprint:first.identity.keyFingerprint});
  assert.throws(()=>trust.verify(firstStatement,{now:T2,clockSkewMs:0}),/not current/);

  const secondStatement=signMeshNodeAdvertisement(advertisement(),second,{
    nonce:"advertisementnonce0006",
    issuedAt:T1,
    ttlMs:60_000
  });
  assert.equal(trust.verify(secondStatement,{now:T2,clockSkewMs:0}),true);
});

test("Mesh receipts can be independently signed by the forwarding node",()=>{
  const signer=generateMeshNodeIdentity("mesh-node-a");
  const statement=signMeshReceipt(receipt(),signer,{
    nonce:"receiptnonce00000001",
    issuedAt:T1,
    ttlMs:60_000
  });
  assert.equal(statement.domain,MESH_RECEIPT_DOMAIN);
  assert.equal(verifySignedMeshReceipt(statement,{now:T2,clockSkewMs:0}),true);
  assert.equal(statement.payload.nodeId,"mesh-node-a");
});

test("private key mismatch and secret-like signed payloads are rejected",()=>{
  const a=generateMeshNodeIdentity("mesh-node-a");
  const b=generateMeshNodeIdentity("mesh-node-b");
  assert.throws(()=>signMeshStatement({nodeId:"mesh-node-a"},{
    identity:a.identity,
    privateKey:b.privateKey,
    domain:MESH_NODE_ADVERTISEMENT_DOMAIN,
    nonce:"advertisementnonce0007",
    issuedAt:T1
  }),/does not match identity/);

  assert.throws(()=>signMeshStatement({nodeId:"mesh-node-a",metadata:{apiKey:"do-not-sign"}},{
    identity:a.identity,
    privateKey:a.privateKey,
    domain:MESH_NODE_ADVERTISEMENT_DOMAIN,
    nonce:"advertisementnonce0008",
    issuedAt:T1
  }),/secret-like field/);
});
