import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  RemoteRequestEvidenceLedger,
  createFileRemoteRequestEvidenceStorage,
  createGitHubRemoteRequestEvidenceStorage,
  observeRemoteRequestEvidence,
  readRemoteRequestEvidence,
  verifyRemoteRequestEvidenceStatement
} from "../src/machine-bridge/remote-request-evidence.mjs";
import {CrossPeerRequestOwnershipStore} from "../src/machine-bridge/cross-peer-request-ownership.mjs";

const NOW=new Date("2026-09-18T05:00:00.000Z");
const PAYLOAD_HASH="a".repeat(64);
const BINDING_HASH="b".repeat(64);
const RESULT_HASH="c".repeat(64);

async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-remote-evidence-"));
  try{
    const signer=generateMeshNodeIdentity("peer-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);
    const storage=createFileRemoteRequestEvidenceStorage({root:join(root,"remote")});
    const ledger=new RemoteRequestEvidenceLedger({
      nodeId:"peer-a",
      signer,
      trustStore,
      storage,
      now:()=>NOW
    });
    await fn({root,signer,trustStore,storage,ledger});
  }finally{await rm(root,{recursive:true,force:true})}
}

function input(requestId="req-evidence-1"){
  return {
    requestId,
    jobId:"job-"+requestId,
    payloadHash:PAYLOAD_HASH,
    ownerBindingHash:BINDING_HASH,
    now:NOW
  };
}

test("accepted evidence is signed, trusted and idempotent",async()=>{
  await fixture(async({ledger,trustStore})=>{
    const first=await ledger.accept(input());
    assert.equal(first.created,true);
    assert.equal(first.evidence.stage,"accepted");
    assert.equal(first.statement.signer.nodeId,"peer-a");

    const verified=verifyRemoteRequestEvidenceStatement(first.statement,{
      trustStore,
      expectedNodeId:"peer-a",
      expectedRequestId:"req-evidence-1",
      expectedJobId:"job-req-evidence-1",
      expectedPayloadHash:PAYLOAD_HASH,
      expectedOwnerBindingHash:BINDING_HASH,
      expectedStage:"accepted",
      now:NOW,
      clockSkewMs:0
    });
    assert.equal(verified.evidence.stage,"accepted");

    const replay=await ledger.accept({...input(),now:new Date(NOW.getTime()+1)});
    assert.equal(replay.created,false);
    assert.equal(replay.statement.statementHash,first.statement.statementHash);
  });
});

test("decision path makes accept and reject mutually exclusive under concurrency",async()=>{
  await fixture(async({ledger})=>{
    const values=await Promise.allSettled([
      ledger.accept(input("req-race")),
      ledger.reject({...input("req-race"),rejectionCategory:"policy"})
    ]);
    assert.equal(values.filter(value=>value.status==="fulfilled").length,1);
    assert.equal(values.filter(value=>value.status==="rejected").length,1);
    const state=await ledger.status("req-race");
    assert.ok(["accepted","rejected"].includes(state.state));

    if(state.state==="accepted"){
      await assert.rejects(
        ()=>ledger.reject({...input("req-race"),rejectionCategory:"policy"}),
        error=>error.code==="ARCA_REMOTE_REQUEST_ACCEPTED"
      );
    }else{
      await assert.rejects(
        ()=>ledger.accept(input("req-race")),
        error=>error.code==="ARCA_REMOTE_REQUEST_REJECTED"
      );
    }
  });
});

test("completion requires accepted decision and binds result to acceptance statement",async()=>{
  await fixture(async({ledger,trustStore})=>{
    await assert.rejects(
      ()=>ledger.complete({...input("req-no-accept"),resultHash:RESULT_HASH}),
      error=>error.code==="ARCA_REMOTE_REQUEST_NOT_ACCEPTED"
    );

    const accepted=await ledger.accept(input("req-complete"));
    const completed=await ledger.complete({...input("req-complete"),resultHash:RESULT_HASH,now:new Date(NOW.getTime()+1000)});
    assert.equal(completed.created,true);
    assert.equal(completed.evidence.acceptedStatementHash,accepted.statement.statementHash);
    assert.equal(completed.evidence.resultHash,RESULT_HASH);

    verifyRemoteRequestEvidenceStatement(completed.statement,{
      trustStore,
      expectedNodeId:"peer-a",
      expectedRequestId:"req-complete",
      expectedStage:"completed",
      now:new Date(NOW.getTime()+1000),
      clockSkewMs:0
    });

    const replay=await ledger.complete({...input("req-complete"),resultHash:RESULT_HASH,now:new Date(NOW.getTime()+2000)});
    assert.equal(replay.created,false);
    await assert.rejects(
      ()=>ledger.complete({...input("req-complete"),resultHash:"d".repeat(64),now:new Date(NOW.getTime()+3000)}),
      error=>error.code==="ARCA_REMOTE_REQUEST_RESULT_CONFLICT"
    );
  });
});

test("rejected request can never produce completion evidence",async()=>{
  await fixture(async({ledger})=>{
    const rejected=await ledger.reject({...input("req-rejected"),rejectionCategory:"invalid-request"});
    assert.equal(rejected.evidence.stage,"rejected");
    await assert.rejects(
      ()=>ledger.complete({...input("req-rejected"),resultHash:RESULT_HASH}),
      error=>error.code==="ARCA_REMOTE_REQUEST_REJECTED"
    );
    assert.equal((await ledger.status("req-rejected")).state,"rejected");
  });
});

test("untrusted or rotated signer evidence is rejected by trust store",async()=>{
  await fixture(async({ledger,trustStore,signer})=>{
    const accepted=await ledger.accept(input("req-trust"));
    const replacement=generateMeshNodeIdentity("peer-a");
    trustStore.rotate("peer-a",replacement.identity,{expectedCurrentFingerprint:signer.identity.keyFingerprint});
    assert.throws(
      ()=>verifyRemoteRequestEvidenceStatement(accepted.statement,{
        trustStore,
        expectedNodeId:"peer-a",
        now:NOW,
        clockSkewMs:0
      }),
      /not current/
    );
  });
});

test("tampered signed evidence fails before semantic use",async()=>{
  await fixture(async({ledger,trustStore})=>{
    const accepted=await ledger.accept(input("req-tamper"));
    const tampered={
      ...accepted.statement,
      payload:{...accepted.statement.payload,payloadHash:"f".repeat(64)}
    };
    assert.throws(
      ()=>verifyRemoteRequestEvidenceStatement(tampered,{
        trustStore,
        expectedNodeId:"peer-a",
        now:NOW,
        clockSkewMs:0
      }),
      /payload hash mismatch|statement hash mismatch|signature invalid/
    );
  });
});

test("ledger detects tampered durable decision record",async()=>{
  await fixture(async({root,ledger})=>{
    await ledger.accept(input("req-file-tamper"));
    const path=join(root,"remote","peer-a","req-file-tamper","decision.json");
    const statement=JSON.parse(await readFile(path,"utf8"));
    statement.payload.jobId="job-evil";
    await writeFile(path,JSON.stringify(statement,null,2)+"\n","utf8");
    await assert.rejects(
      ()=>ledger.status("req-file-tamper"),
      /payload hash mismatch|statement hash mismatch|signature invalid/
    );
  });
});

test("observer binds remote evidence to local owner and completion only records result hash",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-remote-observer-"));
  try{
    const signer=generateMeshNodeIdentity("peer-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);

    const ownership=await new CrossPeerRequestOwnershipStore({root:join(root,"ownership")}).init();
    const reservation=await ownership.reserve({
      requestId:"req-observe",
      jobId:"job-observe",
      payloadHash:PAYLOAD_HASH,
      relayNodeId:"relay-a",
      selectedNodeId:"peer-a",
      now:NOW
    });
    await ownership.markDispatchStarted("req-observe",{now:NOW});

    const ledger=new RemoteRequestEvidenceLedger({
      nodeId:"peer-a",
      signer,
      trustStore,
      storage:createFileRemoteRequestEvidenceStorage({root:join(root,"remote")}),
      now:()=>NOW
    });

    const accepted=await ledger.accept({
      requestId:"req-observe",
      jobId:"job-observe",
      payloadHash:PAYLOAD_HASH,
      ownerBindingHash:reservation.binding.recordHash,
      now:NOW
    });
    const observedAccept=await observeRemoteRequestEvidence(accepted.statement,{
      trustStore,ownershipStore:ownership,now:NOW,clockSkewMs:0
    });
    assert.equal(observedAccept.stage,"accepted");
    assert.equal(observedAccept.automaticFailoverAllowed,false);
    assert.equal((await ownership.status("req-observe")).state,"in-flight");

    const completed=await ledger.complete({
      requestId:"req-observe",
      jobId:"job-observe",
      payloadHash:PAYLOAD_HASH,
      ownerBindingHash:reservation.binding.recordHash,
      resultHash:RESULT_HASH,
      now:new Date(NOW.getTime()+1000)
    });
    const observedComplete=await observeRemoteRequestEvidence(completed.statement,{
      trustStore,ownershipStore:ownership,now:new Date(NOW.getTime()+1000),clockSkewMs:0
    });
    assert.equal(observedComplete.stage,"completed");
    assert.equal(observedComplete.resultHash,RESULT_HASH);
    const state=await ownership.status("req-observe");
    assert.equal(state.state,"completed");
    assert.equal(state.resultHash,RESULT_HASH);
  }finally{await rm(root,{recursive:true,force:true})}
});

test("signed rejection remains evidence only and never authorizes automatic failover",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-remote-rejection-"));
  try{
    const signer=generateMeshNodeIdentity("peer-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);
    const ownership=await new CrossPeerRequestOwnershipStore({root:join(root,"ownership")}).init();
    const reservation=await ownership.reserve({
      requestId:"req-reject-observe",jobId:"job-reject-observe",payloadHash:PAYLOAD_HASH,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:NOW
    });
    const ledger=new RemoteRequestEvidenceLedger({
      nodeId:"peer-a",signer,trustStore,
      storage:createFileRemoteRequestEvidenceStorage({root:join(root,"remote")}),
      now:()=>NOW
    });
    const rejected=await ledger.reject({
      requestId:"req-reject-observe",jobId:"job-reject-observe",payloadHash:PAYLOAD_HASH,
      ownerBindingHash:reservation.binding.recordHash,rejectionCategory:"policy",now:NOW
    });
    const observed=await observeRemoteRequestEvidence(rejected.statement,{
      trustStore,ownershipStore:ownership,now:NOW,clockSkewMs:0
    });
    assert.equal(observed.stage,"rejected");
    assert.equal(observed.rejectionCategory,"policy");
    assert.equal(observed.automaticFailoverAllowed,false);
    const state=await ownership.status("req-reject-observe");
    assert.equal(state.state,"reserved");
    assert.equal(state.crossPeerFailoverAllowed,false);
  }finally{await rm(root,{recursive:true,force:true})}
});

test("evidence from a different node or ownership binding is rejected",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-remote-binding-"));
  try{
    const a=generateMeshNodeIdentity("peer-a");
    const b=generateMeshNodeIdentity("peer-b");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(a.identity);
    trustStore.trust(b.identity);
    const ownership=await new CrossPeerRequestOwnershipStore({root:join(root,"ownership")}).init();
    const reservation=await ownership.reserve({
      requestId:"req-binding",jobId:"job-binding",payloadHash:PAYLOAD_HASH,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:NOW
    });

    const wrongNodeLedger=new RemoteRequestEvidenceLedger({
      nodeId:"peer-b",signer:b,trustStore,
      storage:createFileRemoteRequestEvidenceStorage({root:join(root,"remote-b")}),
      now:()=>NOW
    });
    const wrongNode=await wrongNodeLedger.accept({
      requestId:"req-binding",jobId:"job-binding",payloadHash:PAYLOAD_HASH,
      ownerBindingHash:reservation.binding.recordHash,now:NOW
    });
    await assert.rejects(
      ()=>observeRemoteRequestEvidence(wrongNode.statement,{trustStore,ownershipStore:ownership,now:NOW,clockSkewMs:0}),
      /node mismatch|signer/
    );

    const aLedger=new RemoteRequestEvidenceLedger({
      nodeId:"peer-a",signer:a,trustStore,
      storage:createFileRemoteRequestEvidenceStorage({root:join(root,"remote-a")}),
      now:()=>NOW
    });
    const wrongBinding=await aLedger.accept({
      requestId:"req-binding",jobId:"job-binding",payloadHash:PAYLOAD_HASH,
      ownerBindingHash:"e".repeat(64),now:NOW
    });
    await assert.rejects(
      ()=>observeRemoteRequestEvidence(wrongBinding.statement,{trustStore,ownershipStore:ownership,now:NOW,clockSkewMs:0}),
      /ownership mismatch/
    );
  }finally{await rm(root,{recursive:true,force:true})}
});

test("GitHub mailbox storage adapter preserves create-only decision semantics",async()=>{
  const files=new Map();
  const mailbox={
    path:(...parts)=>["remote-mesh",...parts].join("/"),
    store:{
      async getJson(path){
        return files.has(path)?{value:files.get(path),sha:"sha"}:null;
      },
      async putJson(path,value){
        if(files.has(path))return false;
        files.set(path,value);
        return true;
      }
    }
  };
  const signer=generateMeshNodeIdentity("peer-a");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const ledger=new RemoteRequestEvidenceLedger({
    nodeId:"peer-a",signer,trustStore,
    storage:createGitHubRemoteRequestEvidenceStorage({mailbox}),
    now:()=>NOW
  });
  const accepted=await ledger.accept(input("req-github"));
  assert.equal(accepted.created,true);
  assert.equal(files.size,1);
  const replay=await ledger.accept(input("req-github"));
  assert.equal(replay.created,false);
  assert.equal(files.size,1);
});

test("independent reader validates remote decision/completion without private key access",async()=>{
  await fixture(async({storage,ledger,trustStore})=>{
    await ledger.accept(input("req-reader"));
    let observed=await readRemoteRequestEvidence({
      storage,nodeId:"peer-a",requestId:"req-reader",trustStore,now:NOW,clockSkewMs:0
    });
    assert.equal(observed.state,"accepted");
    assert.equal(observed.completion,null);

    await ledger.complete({...input("req-reader"),resultHash:RESULT_HASH,now:new Date(NOW.getTime()+1000)});
    observed=await readRemoteRequestEvidence({
      storage,nodeId:"peer-a",requestId:"req-reader",trustStore,now:new Date(NOW.getTime()+1000),clockSkewMs:0
    });
    assert.equal(observed.state,"completed");
    assert.equal(observed.completion.payload.resultHash,RESULT_HASH);
  });
});

test("evidence storage contains no semantic request/result body",async()=>{
  await fixture(async({root,ledger})=>{
    await ledger.accept(input("req-minimal"));
    await ledger.complete({...input("req-minimal"),resultHash:RESULT_HASH,now:new Date(NOW.getTime()+1000)});
    const decision=await readFile(join(root,"remote","peer-a","req-minimal","decision.json"),"utf8");
    const completion=await readFile(join(root,"remote","peer-a","req-minimal","completion.json"),"utf8");
    const serialized=decision+completion;
    assert.equal(serialized.includes("params"),false);
    assert.equal(serialized.includes("output"),false);
    assert.equal(serialized.includes("rawError"),false);
    assert.equal(serialized.includes("credential"),false);
  });
});
