import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  EncryptedCredentialVault,
  createMemoryCredentialStore
} from "../packages/agent/src/credential-vault.ts";
import {
  generateMeshNodeIdentity,
  MeshIdentityTrustStore,
  verifySignedMeshNodeAdvertisement,
  verifySignedMeshReceipt,
  verifySignedMeshRequestEvidence,
  verifySignedMeshCognitiveSubstitutionReceipt,
  verifySignedMeshReconciledFailoverReceipt
} from "../src/machine-bridge/mesh-identity.mjs";
import {createVaultMeshSignerBroker} from "../src/machine-bridge/mesh-signer-broker.mjs";
import {
  MachineBridgeMeshRelay,
  createMeshEnvelope,
  verifyMeshEnvelope
} from "../src/machine-bridge/mesh.mjs";
import {
  RemoteRequestEvidenceLedger,
  createFileRemoteRequestEvidenceStorage
} from "../src/machine-bridge/remote-request-evidence.mjs";

const NOW=new Date("2026-09-18T05:20:00.000Z");
const MASTER="mesh signer broker master";
const KEY_REF="vault://mesh/peer-a/signing-key";

async function fixture(){
  const store=createMemoryCredentialStore();
  const vault=new EncryptedCredentialVault({
    store,
    keyProvider:async()=>MASTER,
    clock:()=>NOW
  });
  const signer=generateMeshNodeIdentity("peer-a");
  const pem=signer.privateKey.export({type:"pkcs8",format:"pem"});
  await vault.storeCredential(KEY_REF,pem,{kind:"mesh-ed25519-signing-key",nodeId:"peer-a"});
  const broker=createVaultMeshSignerBroker({vault,identity:signer.identity,keyRef:KEY_REF});
  return {store,vault,signer,broker};
}

test("vault-backed broker exposes only public identity metadata",async()=>{
  const {broker}=await fixture();
  const descriptor=broker.descriptor();
  assert.equal(descriptor.nodeId,"peer-a");
  assert.equal(descriptor.keySource,"vault");
  assert.equal(descriptor.keyFingerprint,broker.identity.keyFingerprint);
  assert.deepEqual(descriptor.supportedOperations,[
    "node-advertisement",
    "receipt",
    "request-evidence",
    "cognitive-substitution-receipt",
    "reconciled-failover-receipt",
    "vince-recovery-receipt"
  ]);
  const serialized=JSON.stringify(broker);
  assert.equal(serialized.includes("vault://"),false);
  assert.equal(serialized.includes("PRIVATE KEY"),false);
  assert.equal("privateKey" in broker,false);
  assert.equal("keyRef" in broker,false);
  assert.equal(typeof broker.signRequestEvidence,"function");
  assert.equal(typeof broker.signCognitiveSubstitutionReceipt,"function");
  assert.equal(typeof broker.signReconciledFailoverReceipt,"function");
  assert.equal(typeof broker.signVinceRecoveryReceipt,"function");
  assert.equal(typeof broker.signStatement,"undefined");
});

test("broker signs request evidence inside vault boundary and audit contains no private material",async()=>{
  const {vault,broker}=await fixture();
  const evidence={
    format:"arca-remote-request-evidence-v1",
    version:1,
    stage:"accepted",
    nodeId:"peer-a",
    requestId:"req-broker-1",
    jobId:"job-broker-1",
    payloadHash:"a".repeat(64),
    ownerBindingHash:"b".repeat(64),
    evidenceAt:NOW.toISOString()
  };
  const statement=await broker.signRequestEvidence(evidence,{
    issuedAt:NOW,
    ttlMs:60_000,
    nonce:"brokerevidencenonce0001"
  });
  assert.equal(verifySignedMeshRequestEvidence(statement,{expectedNodeId:"peer-a",now:NOW,clockSkewMs:0}),true);
  const audit=await vault.auditCredential(KEY_REF);
  assert.ok(audit.auditEvents.some(event=>
    event.operation==="credential.used"&&
    event.details.purpose==="mesh-sign:request-evidence:peer-a"
  ));
  const serialized=JSON.stringify(audit);
  assert.equal(serialized.includes("PRIVATE KEY"),false);
  assert.equal(serialized.includes(statement.signature),false);
});

test("broker supports closed advertisement and receipt signing operations",async()=>{
  const {broker}=await fixture();
  const advertisement={
    format:"arca-mesh-node-v1",
    meshVersion:1,
    nodeId:"peer-a",
    kind:"endpoint",
    capabilities:["reasoning"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:NOW.toISOString(),
    metadata:{runtime:"fixture"},
    transport:{kind:"private-direct"}
  };
  const ad=await broker.signNodeAdvertisement(advertisement,{
    issuedAt:NOW,ttlMs:60_000,nonce:"brokeradvertisement0001"
  });
  assert.equal(verifySignedMeshNodeAdvertisement(ad,{now:NOW,clockSkewMs:0}),true);

  const receipt={
    nodeId:"peer-a",
    nextNode:"peer-b",
    hop:1,
    requestId:"req-broker-receipt",
    jobId:"job-broker-receipt",
    forwardedAt:NOW.toISOString(),
    previousHash:"c".repeat(64),
    receiptHash:"d".repeat(64)
  };
  const signedReceipt=await broker.signReceipt(receipt,{
    issuedAt:NOW,ttlMs:60_000,nonce:"brokerreceiptnonce0001"
  });
  assert.equal(verifySignedMeshReceipt(signedReceipt,{now:NOW,clockSkewMs:0}),true);

  const cognitiveReceipt={
    format:"arca-cognitive-substitution-receipt-v1",
    version:1,
    issuerNodeId:"peer-a",
    roleId:"research.public",
    receiptHash:"f".repeat(64),
    completedAt:NOW.toISOString()
  };
  const signedCognitive=await broker.signCognitiveSubstitutionReceipt(cognitiveReceipt,{
    issuedAt:NOW,ttlMs:60_000,nonce:"brokercognitivereceipt01"
  });
  assert.equal(verifySignedMeshCognitiveSubstitutionReceipt(signedCognitive,{now:NOW,clockSkewMs:0}),true);

  const failoverReceipt={
    format:"arca-reconciled-failover-receipt-v1",
    version:1,
    issuerNodeId:"peer-a",
    executionId:"exec-"+("1".repeat(40)),
    policyBindingHash:"a".repeat(64),
    authorizedAt:NOW.toISOString(),
    receiptHash:"b".repeat(64)
  };
  const signedFailover=await broker.signReconciledFailoverReceipt(failoverReceipt,{
    issuedAt:NOW,ttlMs:60_000,nonce:"brokerfailoverreceipt001"
  });
  assert.equal(verifySignedMeshReconciledFailoverReceipt(signedFailover,{now:NOW,clockSkewMs:0}),true);
});

test("Mesh Relay can use vault broker directly for signed ownership receipts",async()=>{
  const {broker,signer}=await fixture();
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  let captured=null;
  const relay=new MachineBridgeMeshRelay({
    nodeId:"peer-a",
    peers:[{
      nodeId:"peer-b",
      capabilities:["reasoning"],
      reachableCapabilities:["reasoning"],
      async forward(envelope){
        captured=envelope;
        throw new Error("capture");
      }
    }],
    receiptSigner:broker,
    requestOwnership:{
      async reserveForward(context){
        return {requestId:context.requestId,jobId:context.jobId,selectedNodeId:context.selectedNodeId,bindingHash:"e".repeat(64)};
      },
      async markForwardStarted(){},
      async beginForward(){throw new Error("advanced ownership path expected")},
      async completeForward(){},
      async failForward(){}
    },
    now:()=>NOW
  });
  const meshJob={
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"job-broker-relay",
    requestId:"req-broker-relay",
    action:"worker.ping",
    requires:["reasoning"],
    params:{}
  };
  const envelope=createMeshEnvelope(meshJob,{originNode:"origin-a",requiredCapabilities:["reasoning"],now:NOW});
  await assert.rejects(()=>relay.forward(envelope),/capture/);
  assert.ok(captured);
  assert.equal(captured.receipts[0].ownershipBindingHash,"e".repeat(64));
  assert.equal(verifyMeshEnvelope(captured,{requireSignedReceipts:true,trustStore}),true);
});

test("wrong vault key fails closed with sanitized identity mismatch",async()=>{
  const store=createMemoryCredentialStore();
  const vault=new EncryptedCredentialVault({store,keyProvider:async()=>MASTER,clock:()=>NOW});
  const expected=generateMeshNodeIdentity("peer-a");
  const wrong=generateMeshNodeIdentity("peer-a");
  await vault.storeCredential(KEY_REF,wrong.privateKey.export({type:"pkcs8",format:"pem"}));
  const broker=createVaultMeshSignerBroker({vault,identity:expected.identity,keyRef:KEY_REF});
  await assert.rejects(
    ()=>broker.signRequestEvidence({
      format:"arca-remote-request-evidence-v1",
      version:1,
      stage:"accepted",
      nodeId:"peer-a",
      requestId:"req-wrong-key",
      jobId:"job-wrong-key",
      payloadHash:"a".repeat(64),
      ownerBindingHash:"b".repeat(64),
      evidenceAt:NOW.toISOString()
    },{issuedAt:NOW}),
    error=>{
      assert.equal(error.code,"ARCA_MESH_SIGNER_IDENTITY_MISMATCH");
      assert.equal(error.message.includes(KEY_REF),false);
      assert.equal(error.message.includes("PRIVATE"),false);
      return true;
    }
  );
});

test("missing or malformed key material produces a sanitized unavailable error",async()=>{
  const signer=generateMeshNodeIdentity("peer-a");
  const store=createMemoryCredentialStore();
  const vault=new EncryptedCredentialVault({store,keyProvider:async()=>MASTER,clock:()=>NOW});
  const missing=createVaultMeshSignerBroker({vault,identity:signer.identity,keyRef:KEY_REF});
  await assert.rejects(
    ()=>missing.signRequestEvidence({
      format:"arca-remote-request-evidence-v1",version:1,stage:"accepted",nodeId:"peer-a",
      requestId:"req-missing-key",jobId:"job-missing-key",payloadHash:"a".repeat(64),
      ownerBindingHash:"b".repeat(64),evidenceAt:NOW.toISOString()
    },{issuedAt:NOW}),
    error=>error.code==="ARCA_MESH_SIGNER_KEY_UNAVAILABLE"&&!error.message.includes(KEY_REF)
  );

  await vault.storeCredential(KEY_REF,"not a private key");
  const malformed=createVaultMeshSignerBroker({vault,identity:signer.identity,keyRef:KEY_REF});
  await assert.rejects(
    ()=>malformed.signRequestEvidence({
      format:"arca-remote-request-evidence-v1",version:1,stage:"accepted",nodeId:"peer-a",
      requestId:"req-malformed-key",jobId:"job-malformed-key",payloadHash:"a".repeat(64),
      ownerBindingHash:"b".repeat(64),evidenceAt:NOW.toISOString()
    },{issuedAt:NOW}),
    error=>error.code==="ARCA_MESH_SIGNER_KEY_UNAVAILABLE"
  );
});

test("Remote Request Evidence ledger can sign entirely through the broker interface",async()=>{
  const {broker,trustStore:unused}=await fixture().then(async value=>{
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(value.signer.identity);
    return {...value,trustStore};
  });
  const root=await mkdtemp(join(tmpdir(),"arca-broker-ledger-"));
  try{
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(broker.identity);
    const ledger=new RemoteRequestEvidenceLedger({
      nodeId:"peer-a",
      signer:broker,
      trustStore,
      storage:createFileRemoteRequestEvidenceStorage({root}),
      now:()=>NOW
    });
    const accepted=await ledger.accept({
      requestId:"req-ledger-broker",
      jobId:"job-ledger-broker",
      payloadHash:"a".repeat(64),
      ownerBindingHash:"b".repeat(64),
      now:NOW
    });
    assert.equal(accepted.evidence.stage,"accepted");
    assert.equal(verifySignedMeshRequestEvidence(accepted.statement,{expectedNodeId:"peer-a",now:NOW}),true);
    assert.equal("privateKey" in ledger.signer,false);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test("broker rejects non-vault references before any credential access",async()=>{
  const signer=generateMeshNodeIdentity("peer-a");
  const vault={async withCredential(){throw new Error("must not run")}};
  assert.throws(
    ()=>createVaultMeshSignerBroker({vault,identity:signer.identity,keyRef:"raw/private/key"}),
    /requires vault:\/\//
  );
});
