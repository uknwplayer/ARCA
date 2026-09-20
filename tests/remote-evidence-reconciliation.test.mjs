import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CrossPeerRequestOwnershipStore
} from "../src/machine-bridge/cross-peer-request-ownership.mjs";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  RemoteRequestEvidenceLedger,
  createFileRemoteRequestEvidenceStorage
} from "../src/machine-bridge/remote-request-evidence.mjs";
import {
  RemoteEvidenceReconciliationController
} from "../src/machine-bridge/remote-evidence-reconciliation.mjs";

const NOW=new Date("2026-09-18T05:45:00.000Z");
const PAYLOAD_HASH="a".repeat(64);
const RESULT_A="b".repeat(64);
const RESULT_B="c".repeat(64);

async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-reconcile-"));
  try{
    const ownership=await new CrossPeerRequestOwnershipStore({root:join(root,"ownership")}).init();
    const peerA=generateMeshNodeIdentity("peer-a");
    const peerB=generateMeshNodeIdentity("peer-b");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(peerA.identity);
    trustStore.trust(peerB.identity);
    const storageA=createFileRemoteRequestEvidenceStorage({root:join(root,"peer-a")});
    const storageB=createFileRemoteRequestEvidenceStorage({root:join(root,"peer-b")});
    const ledgerA=new RemoteRequestEvidenceLedger({
      nodeId:"peer-a",signer:peerA,trustStore,storage:storageA,now:()=>NOW
    });
    const ledgerB=new RemoteRequestEvidenceLedger({
      nodeId:"peer-b",signer:peerB,trustStore,storage:storageB,now:()=>NOW
    });
    const controller=new RemoteEvidenceReconciliationController({
      ownershipStore:ownership,
      trustStore,
      remoteSources:[
        {nodeId:"peer-a",storage:storageA},
        {nodeId:"peer-b",storage:storageB}
      ],
      now:()=>NOW,
      clockSkewMs:0
    });
    await fn({root,ownership,peerA,peerB,trustStore,storageA,storageB,ledgerA,ledgerB,controller});
  }finally{
    await rm(root,{recursive:true,force:true});
  }
}

async function bind(ownership,id,{peerId="peer-a",dispatch=true,uncertain=false,resultHash=null}={}){
  const requestId="reconcile-req-"+id;
  const jobId="reconcile-job-"+id;
  const reservation=await ownership.reserve({
    requestId,jobId,payloadHash:PAYLOAD_HASH,
    relayNodeId:"relay-origin",selectedNodeId:peerId,now:NOW
  });
  if(dispatch)await ownership.markDispatchStarted(requestId,{now:new Date(NOW.getTime()+1)});
  if(uncertain)await ownership.markUncertain(requestId,{category:"timeout",now:new Date(NOW.getTime()+2)});
  if(resultHash)await ownership.markCompleted(requestId,{resultHash,now:new Date(NOW.getTime()+3)});
  return {
    requestId,jobId,payloadHash:PAYLOAD_HASH,
    ownerBindingHash:reservation.binding.recordHash,
    selectedNodeId:peerId
  };
}

test("snapshot exposes only explicit node ids and no storage/credential details",async()=>{
  await fixture(async({controller})=>{
    const snapshot=controller.snapshot();
    assert.deepEqual(snapshot.configuredNodeIds,["peer-a","peer-b"]);
    assert.equal(snapshot.observationalOnly,true);
    assert.equal(snapshot.canDispatch,false);
    assert.equal(snapshot.automaticFailoverAllowed,false);
    const serialized=JSON.stringify(snapshot);
    assert.equal(serialized.includes("storage"),false);
    assert.equal(serialized.includes("credential"),false);
    assert.equal(serialized.includes("vault://"),false);
  });
});

test("unbound local request does not consult remote sources",async()=>{
  const ownership={
    async status(requestId){
      return {state:"unbound",requestId,selectedNodeId:null};
    },
    async markCompleted(){throw new Error("must not complete")}
  };
  const trustStore={verify(){throw new Error("must not verify")}};
  let reads=0;
  const controller=new RemoteEvidenceReconciliationController({
    ownershipStore:ownership,trustStore,
    remoteSources:[{nodeId:"peer-a",storage:{async read(){reads+=1;throw new Error("must not read")}}}],
    now:()=>NOW
  });
  const result=await controller.reconcile("req-unbound");
  assert.equal(result.state,"unbound");
  assert.equal(result.remoteEvidenceState,"not-read");
  assert.equal(result.reDispatchPerformed,false);
  assert.equal(result.automaticFailoverAllowed,false);
  assert.equal(reads,0);
});

test("accepted remote evidence is verified against exact local ownership without mutating dispatch state",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"accepted");
    const accepted=await ledgerA.accept({...record,now:NOW});
    const result=await controller.reconcile(record.requestId);
    assert.equal(result.state,"accepted");
    assert.equal(result.remoteEvidenceState,"accepted");
    assert.equal(result.decisionStatementHash,accepted.statement.statementHash);
    assert.equal(result.localStateBefore,"in-flight");
    assert.equal(result.localStateAfter,"in-flight");
    assert.equal((await ownership.status(record.requestId)).state,"in-flight");
    assert.equal(result.reDispatchPerformed,false);
    assert.equal(result.automaticFailoverAllowed,false);
  });
});

test("uncertain local request plus signed acceptance becomes accepted-uncertain with zero redispatch",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"uncertain",{uncertain:true});
    await ledgerA.accept({...record,now:NOW});
    const result=await controller.reconcile(record.requestId);
    assert.equal(result.state,"accepted-uncertain");
    assert.equal(result.localStateAfter,"uncertain");
    assert.equal(result.reDispatchPerformed,false);
    assert.equal(result.automaticFailoverAllowed,false);
  });
});

test("signed remote completion reconciles uncertain local ownership to completed by resultHash",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"complete",{uncertain:true});
    const accepted=await ledgerA.accept({...record,now:NOW});
    const completed=await ledgerA.complete({...record,resultHash:RESULT_A,now:new Date(NOW.getTime()+1000)});
    const result=await controller.reconcile(record.requestId,{now:new Date(NOW.getTime()+1000)});
    assert.equal(result.state,"completed");
    assert.equal(result.localStateBefore,"uncertain");
    assert.equal(result.localStateAfter,"completed");
    assert.equal(result.decisionStatementHash,accepted.statement.statementHash);
    assert.equal(result.completionStatementHash,completed.statement.statementHash);
    assert.equal(result.resultHash,RESULT_A);
    const local=await ownership.status(record.requestId);
    assert.equal(local.state,"completed");
    assert.equal(local.resultHash,RESULT_A);
  });
});

test("signed rejection is observed but never authorizes failover or mutates local dispatch state",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"rejected");
    const rejected=await ledgerA.reject({...record,rejectionCategory:"policy",now:NOW});
    const result=await controller.reconcile(record.requestId);
    assert.equal(result.state,"rejected");
    assert.equal(result.rejectionCategory,"policy");
    assert.equal(result.decisionStatementHash,rejected.statement.statementHash);
    assert.equal(result.localStateAfter,"in-flight");
    assert.equal(result.automaticFailoverAllowed,false);
    assert.equal(result.reDispatchPerformed,false);
    assert.equal((await ownership.status(record.requestId)).state,"in-flight");
  });
});

test("controller reads only the explicitly selected owner source",async()=>{
  await fixture(async({ownership,ledgerA,trustStore,storageA})=>{
    const record=await bind(ownership,"source");
    await ledgerA.accept({...record,now:NOW});
    let readsA=0,readsB=0;
    const sourceA={async read(key){readsA+=1;return storageA.read(key)}};
    const sourceB={async read(){readsB+=1;throw new Error("wrong source must not be read")}};
    const controller=new RemoteEvidenceReconciliationController({
      ownershipStore:ownership,trustStore,
      remoteSources:[
        {nodeId:"peer-a",storage:sourceA},
        {nodeId:"peer-b",storage:sourceB}
      ],
      now:()=>NOW,clockSkewMs:0
    });
    const result=await controller.reconcile(record.requestId);
    assert.equal(result.state,"accepted");
    assert.ok(readsA>=1);
    assert.equal(readsB,0);
  });
});

test("missing explicit source for selected owner fails closed without scanning another source",async()=>{
  await fixture(async({ownership,trustStore,storageA})=>{
    const record=await bind(ownership,"missing-source",{peerId:"peer-b"});
    let reads=0;
    const controller=new RemoteEvidenceReconciliationController({
      ownershipStore:ownership,trustStore,
      remoteSources:[{nodeId:"peer-a",storage:{async read(key){reads+=1;return storageA.read(key)}}}],
      now:()=>NOW
    });
    await assert.rejects(
      ()=>controller.reconcile(record.requestId),
      error=>error.code==="ARCA_REMOTE_EVIDENCE_SOURCE_MISSING"
    );
    assert.equal(reads,0);
  });
});

test("remote evidence with wrong ownerBindingHash is rejected and local state is unchanged",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"wrong-binding",{uncertain:true});
    await ledgerA.accept({...record,ownerBindingHash:"d".repeat(64),now:NOW});
    await assert.rejects(
      ()=>controller.reconcile(record.requestId),
      /ownership mismatch/
    );
    assert.equal((await ownership.status(record.requestId)).state,"uncertain");
  });
});

test("remote evidence before local dispatch marker is treated as a state conflict",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"reserved",{dispatch:false});
    await ledgerA.accept({...record,now:NOW});
    await assert.rejects(
      ()=>controller.reconcile(record.requestId),
      error=>error.code==="ARCA_REMOTE_EVIDENCE_LOCAL_DISPATCH_MISSING"
    );
    assert.equal((await ownership.status(record.requestId)).state,"reserved");
  });
});

test("remote rejection cannot coexist with local completed ownership",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"reject-conflict",{resultHash:RESULT_A});
    await ledgerA.reject({...record,rejectionCategory:"policy",now:NOW});
    await assert.rejects(
      ()=>controller.reconcile(record.requestId),
      error=>error.code==="ARCA_REMOTE_EVIDENCE_STATE_CONFLICT"
    );
    const local=await ownership.status(record.requestId);
    assert.equal(local.state,"completed");
    assert.equal(local.resultHash,RESULT_A);
  });
});

test("remote completed resultHash conflict fails closed and preserves local completion",async()=>{
  await fixture(async({ownership,ledgerA,controller})=>{
    const record=await bind(ownership,"result-conflict",{resultHash:RESULT_A});
    await ledgerA.accept({...record,now:NOW});
    await ledgerA.complete({...record,resultHash:RESULT_B,now:new Date(NOW.getTime()+1000)});
    await assert.rejects(
      ()=>controller.reconcile(record.requestId,{now:new Date(NOW.getTime()+1000)}),
      error=>error.code==="ARCA_CROSS_PEER_RESULT_CONFLICT"
    );
    const local=await ownership.status(record.requestId);
    assert.equal(local.resultHash,RESULT_A);
  });
});

test("unseen remote evidence preserves local uncertain state and never widens authority",async()=>{
  await fixture(async({ownership,controller})=>{
    const record=await bind(ownership,"unseen",{uncertain:true});
    const result=await controller.reconcile(record.requestId);
    assert.equal(result.state,"uncertain");
    assert.equal(result.remoteEvidenceState,"unseen");
    assert.equal(result.localStateAfter,"uncertain");
    assert.equal(result.reDispatchPerformed,false);
    assert.equal(result.automaticFailoverAllowed,false);
  });
});

test("runOnce is bounded, deduplicates request ids and sanitizes failures",async()=>{
  await fixture(async({ownership,ledgerA,trustStore,storageA})=>{
    const good=await bind(ownership,"batch-good");
    await ledgerA.accept({...good,now:NOW});
    const missing=await bind(ownership,"batch-missing",{peerId:"peer-b"});
    const limited=new RemoteEvidenceReconciliationController({
      ownershipStore:ownership,
      trustStore,
      remoteSources:[{nodeId:"peer-a",storage:storageA}],
      now:()=>NOW,
      clockSkewMs:0
    });
    const scan=await limited.runOnce({requestIds:[good.requestId,good.requestId,missing.requestId]});
    assert.equal(scan.requested,2);
    assert.equal(scan.results.length,2);
    assert.equal(scan.results[0].state,"accepted");
    assert.equal(scan.results[1].state,"error");
    assert.equal(scan.results[1].errorCode,"ARCA_REMOTE_EVIDENCE_SOURCE_MISSING");
    assert.equal("message" in scan.results[1],false);
    assert.equal(JSON.stringify(scan).includes("params"),false);
    assert.equal(JSON.stringify(scan).includes("credential"),false);
    await assert.rejects(
      ()=>limited.runOnce({requestIds:Array.from({length:101},(_,index)=>"req-"+index)}),
      /batch exceeds/
    );
  });
});

test("duplicate source node ids are rejected at construction",async()=>{
  const signer=generateMeshNodeIdentity("peer-a");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const ownership={async status(){return {state:"unbound"}},async markCompleted(){}};
  const storage={async read(){return null}};
  assert.throws(
    ()=>new RemoteEvidenceReconciliationController({
      ownershipStore:ownership,trustStore,
      remoteSources:[{nodeId:"peer-a",storage},{nodeId:"peer-a",storage}]
    }),
    /duplicate remote evidence source/
  );
});
