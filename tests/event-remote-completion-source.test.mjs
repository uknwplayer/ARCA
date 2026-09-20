import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {MeshIdentityTrustStore,generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";
import {RemoteRequestEvidenceLedger,createFileRemoteRequestEvidenceStorage} from "../src/machine-bridge/remote-request-evidence.mjs";
import {createEventRemoteRequestBindingStore} from "../src/machine-bridge/event-remote-request-binding.mjs";
import {createEventRemoteCompletionSource} from "../src/machine-bridge/event-remote-completion-source.mjs";
import {createEventCompletionEvidenceLedger} from "../src/machine-bridge/event-completion-evidence-ledger.mjs";
import {createEventReconciliationController} from "../src/machine-bridge/event-reconciliation-controller.mjs";
import {createEventRecoveryPolicy} from "../src/machine-bridge/event-recovery-policy.mjs";
import {createFilesystemEventStore} from "../src/machine-bridge/event-filesystem-store.mjs";
import {createEventDeliveryLedger} from "../src/machine-bridge/event-delivery-ledger.mjs";
import {createEventFabric} from "../src/machine-bridge/event-fabric.mjs";

const NOW=new Date("2026-09-19T16:00:00.000Z");
const PAYLOAD_HASH="a".repeat(64);
const OWNER_BINDING_HASH="b".repeat(64);
const RESULT_HASH="c".repeat(64);
const handlerId="agent:remote-auditor";

const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-event-remote-completion-"));

async function fixture(subject="case:remote-completion"){
  const root=tempRoot();
  const eventStore=createFilesystemEventStore({root});
  const persisted=await createEventFabric({store:eventStore,clock:()=>NOW.toISOString()}).publish({
    type:"case.candidate",source:"discovery",subject
  });
  const deliveryLedger=createEventDeliveryLedger({root,clock:()=>NOW.toISOString()});
  deliveryLedger.claim(persisted.eventId,handlerId);

  const signer=generateMeshNodeIdentity("peer-a");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const remoteStorage=createFileRemoteRequestEvidenceStorage({root:path.join(root,"remote-evidence")});
  const remoteLedger=new RemoteRequestEvidenceLedger({
    nodeId:"peer-a",
    signer,
    trustStore,
    storage:remoteStorage,
    now:()=>NOW
  });

  const requestId="req-event-1";
  const jobId="job-event-1";
  const bindingStore=createEventRemoteRequestBindingStore({root,clock:()=>NOW.toISOString()});
  bindingStore.bind({
    eventId:persisted.eventId,
    handlerId,
    nodeId:"peer-a",
    requestId,
    jobId,
    payloadHash:PAYLOAD_HASH,
    ownerBindingHash:OWNER_BINDING_HASH
  });

  const completionSource=createEventRemoteCompletionSource({
    bindingStore,
    remoteSources:[{nodeId:"peer-a",storage:remoteStorage}],
    trustStore,
    now:()=>NOW,
    clockSkewMs:0
  });

  return {
    root,eventStore,persisted,deliveryLedger,remoteLedger,bindingStore,completionSource,
    requestId,jobId,trustStore
  };
}

function remoteInput(s){
  return {
    requestId:s.requestId,
    jobId:s.jobId,
    payloadHash:PAYLOAD_HASH,
    ownerBindingHash:OWNER_BINDING_HASH,
    now:NOW
  };
}

test("event remote request binding is create-only and conflict detecting",async()=>{
  const s=await fixture("case:binding");
  const repeated=s.bindingStore.bind({
    eventId:s.persisted.eventId,
    handlerId,
    nodeId:"peer-a",
    requestId:s.requestId,
    jobId:s.jobId,
    payloadHash:PAYLOAD_HASH,
    ownerBindingHash:OWNER_BINDING_HASH
  });
  assert.equal(repeated.created,false);
  assert.throws(()=>s.bindingStore.bind({
    eventId:s.persisted.eventId,
    handlerId,
    nodeId:"peer-a",
    requestId:"req-other",
    jobId:s.jobId,
    payloadHash:PAYLOAD_HASH,
    ownerBindingHash:OWNER_BINDING_HASH
  }),/ARCA_EVENT_REMOTE_BINDING_CONFLICT/);
});

test("signed remote completion is converted into hash-only Event Fabric completion evidence",async()=>{
  const s=await fixture();
  await s.remoteLedger.accept(remoteInput(s));
  await s.remoteLedger.complete({...remoteInput(s),resultHash:RESULT_HASH});

  const evidence=await s.completionSource.lookupVerified({event:s.eventStore.read(s.persisted.eventId),handlerId});
  assert.equal(evidence.eventId,s.persisted.eventId);
  assert.equal(evidence.handlerId,handlerId);
  assert.equal(evidence.resultHash,RESULT_HASH);
  assert.match(evidence.evidenceHash,/^[0-9a-f]{64}$/);
  assert.equal(evidence.sourceId,"mesh:peer-a");
  assert.equal(Object.hasOwn(evidence,"result"),false);
});

test("accepted but incomplete remote request does not become completion evidence",async()=>{
  const s=await fixture("case:accepted-only");
  await s.remoteLedger.accept(remoteInput(s));
  const evidence=await s.completionSource.lookupVerified({event:s.eventStore.read(s.persisted.eventId),handlerId});
  assert.equal(evidence,null);
});

test("signed remote completion flows through reconciliation without handler replay",async()=>{
  const s=await fixture("case:end-to-end-reconcile");
  await s.remoteLedger.accept(remoteInput(s));
  await s.remoteLedger.complete({...remoteInput(s),resultHash:RESULT_HASH});

  const evidenceLedger=createEventCompletionEvidenceLedger({root:s.root,clock:()=>NOW.toISOString()});
  const recoveryPolicy=createEventRecoveryPolicy({rules:{
    [handlerId]:{unclaimed:"first-claim",claimed:"reconcile-only",failed:"reconcile-only"}
  }});
  const reconciler=createEventReconciliationController({
    store:s.eventStore,
    deliveryLedger:s.deliveryLedger,
    evidenceLedger,
    recoveryPolicy,
    completionSource:s.completionSource
  });

  const result=await reconciler.reconcile(s.persisted.eventId,handlerId);
  assert.equal(result.status,"completed-evidenced");
  assert.equal(result.resultHash,RESULT_HASH);
  assert.equal(s.deliveryLedger.get(s.persisted.eventId,handlerId).status,"claimed");
});

test("remote completion fingerprint drift fails cryptographic correlation",async()=>{
  const s=await fixture("case:fingerprint-drift");
  await s.remoteLedger.accept(remoteInput(s));
  await s.remoteLedger.complete({...remoteInput(s),resultHash:RESULT_HASH});

  const badRoot=tempRoot();
  const badBinding=createEventRemoteRequestBindingStore({root:badRoot,clock:()=>NOW.toISOString()});
  badBinding.bind({
    eventId:s.persisted.eventId,
    handlerId,
    nodeId:"peer-a",
    requestId:s.requestId,
    jobId:"job-different",
    payloadHash:PAYLOAD_HASH,
    ownerBindingHash:OWNER_BINDING_HASH
  });
  const badSource=createEventRemoteCompletionSource({
    bindingStore:badBinding,
    remoteSources:[{nodeId:"peer-a",storage:createFileRemoteRequestEvidenceStorage({root:path.join(s.root,"remote-evidence")})}],
    trustStore:s.trustStore,
    now:()=>NOW,
    clockSkewMs:0
  });

  await assert.rejects(
    ()=>badSource.lookupVerified({event:s.eventStore.read(s.persisted.eventId),handlerId}),
    /jobId|evidence/i
  );
});
