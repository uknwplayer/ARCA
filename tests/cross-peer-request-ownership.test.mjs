import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CrossPeerRequestOwnershipStore,
  crossPeerFailureCategory
} from "../src/machine-bridge/cross-peer-request-ownership.mjs";
import {
  MachineBridgeMeshRelay,
  createMeshEnvelope
} from "../src/machine-bridge/mesh.mjs";

const T0=new Date("2026-09-18T04:45:00.000Z");
const HASH_A="a".repeat(64);
const HASH_B="b".repeat(64);

async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-cross-peer-"));
  try{
    const store=await new CrossPeerRequestOwnershipStore({root}).init();
    await fn({root,store});
  }finally{await rm(root,{recursive:true,force:true})}
}

function job(suffix="1"){
  return {
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"ownership-job-"+suffix,
    requestId:"ownership-req-"+suffix,
    action:"worker.ping",
    requires:[],
    params:{echo:suffix}
  };
}

function meshResult(envelope,{status="completed"}={}){
  const route=[...envelope.route,"worker-a"];
  const result={
    format:"arca-result-v1",
    protocolVersion:3,
    jobId:envelope.job.jobId,
    requestId:envelope.requestId,
    workerId:"worker-a",
    attempt:1,
    status,
    startedAt:"2026-09-18T04:45:01.000Z",
    completedAt:"2026-09-18T04:45:02.000Z",
    output:{ok:true}
  };
  return {
    format:"arca-mesh-result-v1",
    meshVersion:1,
    requestId:envelope.requestId,
    jobId:envelope.job.jobId,
    route,
    replyRoute:[...route].reverse(),
    receipts:[],
    result,
    resultHash:HASH_B
  };
}

test("ownership reservation is create-once and binds request fingerprint to one selected node",async()=>{
  await fixture(async({store})=>{
    const first=await store.reserve({
      requestId:"req-a",jobId:"job-a",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    });
    assert.equal(first.created,true);
    assert.equal((await store.status("req-a")).state,"reserved");

    const same=await store.reserve({
      requestId:"req-a",jobId:"job-a",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:new Date(T0.getTime()+1)
    });
    assert.equal(same.created,false);
    assert.equal(same.binding.recordHash,first.binding.recordHash);

    await assert.rejects(
      ()=>store.reserve({
        requestId:"req-a",jobId:"job-a",payloadHash:HASH_A,
        relayNodeId:"relay-a",selectedNodeId:"peer-b",now:T0
      }),
      error=>error.code==="ARCA_CROSS_PEER_OWNERSHIP_CONFLICT"
    );

    await assert.rejects(
      ()=>store.reserve({
        requestId:"req-a",jobId:"job-other",payloadHash:HASH_A,
        relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
      }),
      error=>error.code==="ARCA_CROSS_PEER_REQUEST_CONFLICT"
    );
  });
});

test("advanced relay guard reserves ownership before marking dispatch",async()=>{
  await fixture(async({store})=>{
    const guard=store.asRelayGuard();
    const context={
      requestId:"req-split-dispatch",jobId:"job-split-dispatch",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    };
    const token=await guard.reserveForward(context);
    assert.equal(token.selectedNodeId,"peer-a");
    assert.match(token.bindingHash,/^[a-f0-9]{64}$/);
    assert.equal((await store.status("req-split-dispatch")).state,"reserved");

    await guard.markForwardStarted(token,{now:new Date(T0.getTime()+1)});
    assert.equal((await store.status("req-split-dispatch")).state,"in-flight");

    await assert.rejects(
      ()=>guard.markForwardStarted(token,{now:new Date(T0.getTime()+2)}),
      error=>error.code==="ARCA_CROSS_PEER_DISPATCH_ALREADY_STARTED"
    );
  });
});

test("dispatch evidence makes replay fail closed before a second network call",async()=>{
  await fixture(async({store})=>{
    const guard=store.asRelayGuard();
    const context={
      requestId:"req-dispatch",jobId:"job-dispatch",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    };
    const token=await guard.beginForward(context);
    assert.equal(token.selectedNodeId,"peer-a");
    assert.equal((await store.status("req-dispatch")).state,"in-flight");

    await assert.rejects(
      ()=>guard.beginForward({...context,now:new Date(T0.getTime()+1)}),
      error=>error.code==="ARCA_CROSS_PEER_DISPATCH_ALREADY_STARTED"
    );
  });
});

test("timeout becomes uncertain and never authorizes another peer",async()=>{
  await fixture(async({store})=>{
    const guard=store.asRelayGuard();
    const token=await guard.beginForward({
      requestId:"req-timeout",jobId:"job-timeout",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    });
    await guard.failForward(token,new Error("timed out waiting for mesh result"),{now:new Date(T0.getTime()+1000)});

    const state=await store.status("req-timeout");
    assert.equal(state.state,"uncertain");
    assert.equal(state.failureCategory,"timeout");
    assert.equal(state.crossPeerFailoverAllowed,false);

    await assert.rejects(
      ()=>guard.beginForward({
        requestId:"req-timeout",jobId:"job-timeout",payloadHash:HASH_A,
        relayNodeId:"relay-a",selectedNodeId:"peer-b",now:new Date(T0.getTime()+2000)
      }),
      error=>error.code==="ARCA_CROSS_PEER_OWNERSHIP_CONFLICT"
    );
  });
});

test("late durable result reconciles uncertain request to completed without redispatch",async()=>{
  await fixture(async({store})=>{
    const guard=store.asRelayGuard();
    const token=await guard.beginForward({
      requestId:"req-late",jobId:"job-late",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    });
    await guard.failForward(token,new Error("network timeout"),{now:new Date(T0.getTime()+1000)});

    let lookups=0;
    const after=await store.reconcileCompletion("req-late",{
      now:new Date(T0.getTime()+5000),
      lookupResult:async context=>{
        lookups+=1;
        assert.equal(context.selectedNodeId,"peer-a");
        return {requestId:"req-late",jobId:"job-late",resultHash:HASH_B};
      }
    });
    assert.equal(lookups,1);
    assert.equal(after.state,"completed");
    assert.equal(after.resultHash,HASH_B);
    assert.equal(after.crossPeerFailoverAllowed,false);
  });
});

test("absence of a result is not proof of non-execution",async()=>{
  await fixture(async({store})=>{
    const guard=store.asRelayGuard();
    const token=await guard.beginForward({
      requestId:"req-none",jobId:"job-none",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    });
    await guard.failForward(token,new TypeError("fetch failed"),{now:new Date(T0.getTime()+1000)});

    const state=await store.reconcileCompletion("req-none",{lookupResult:async()=>null,now:new Date(T0.getTime()+9000)});
    assert.equal(state.state,"uncertain");
    assert.equal(state.crossPeerFailoverAllowed,false);
  });
});

test("completion result hash is create-once and conflicting evidence is rejected",async()=>{
  await fixture(async({store})=>{
    await store.reserve({
      requestId:"req-complete",jobId:"job-complete",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    });
    await store.markDispatchStarted("req-complete",{now:T0});
    await store.markCompleted("req-complete",{resultHash:HASH_B,now:new Date(T0.getTime()+1000)});
    const replay=await store.markCompleted("req-complete",{resultHash:HASH_B,now:new Date(T0.getTime()+2000)});
    assert.equal(replay.created,false);
    await assert.rejects(
      ()=>store.markCompleted("req-complete",{resultHash:"c".repeat(64),now:new Date(T0.getTime()+3000)}),
      error=>error.code==="ARCA_CROSS_PEER_RESULT_CONFLICT"
    );
  });
});

test("tampered durable evidence fails integrity validation",async()=>{
  await fixture(async({root,store})=>{
    await store.reserve({
      requestId:"req-tamper",jobId:"job-tamper",payloadHash:HASH_A,
      relayNodeId:"relay-a",selectedNodeId:"peer-a",now:T0
    });
    const path=join(root,"req-tamper","binding.json");
    const value=JSON.parse(await readFile(path,"utf8"));
    value.selectedNodeId="peer-evil";
    await writeFile(path,JSON.stringify(value,null,2)+"\n","utf8");
    await assert.rejects(()=>store.status("req-tamper"),/record hash mismatch/);
  });
});

test("relay timeout pins the first selected peer and blocks later selector drift to another peer",async()=>{
  await fixture(async({store})=>{
    const j=job("relay-timeout");
    const envelope=createMeshEnvelope(j,{originNode:"origin-a",requiredCapabilities:["reasoning"],now:T0});
    let selectorCalls=0,peerACalls=0,peerBCalls=0;
    const relay=new MachineBridgeMeshRelay({
      nodeId:"relay-a",
      peers:[
        {
          nodeId:"peer-a",capabilities:["reasoning"],reachableCapabilities:["reasoning"],
          async forward(){peerACalls+=1;throw new Error("timed out waiting for mesh result")}
        },
        {
          nodeId:"peer-b",capabilities:["reasoning"],reachableCapabilities:["reasoning"],
          async forward(){peerBCalls+=1;return {requestId:j.requestId,jobId:j.jobId,resultHash:HASH_B}}
        }
      ],
      peerSelector:async()=>{
        selectorCalls+=1;
        return selectorCalls===1?"peer-a":"peer-b";
      },
      requestOwnership:store.asRelayGuard(),
      now:()=>T0
    });

    await assert.rejects(()=>relay.forward(envelope),/timed out/);
    assert.equal((await store.status(j.requestId)).state,"uncertain");

    await assert.rejects(
      ()=>relay.forward(envelope),
      error=>error.code==="ARCA_CROSS_PEER_OWNERSHIP_CONFLICT"
    );
    assert.equal(peerACalls,1);
    assert.equal(peerBCalls,0);
  });
});

test("concurrent duplicate relay calls produce only one downstream forward",async()=>{
  await fixture(async({store})=>{
    const j=job("concurrent");
    const envelope=createMeshEnvelope(j,{originNode:"origin-a",requiredCapabilities:["reasoning"],now:T0});
    let downstream=0;
    let release;
    const gate=new Promise(resolve=>{release=resolve});
    const relay=new MachineBridgeMeshRelay({
      nodeId:"relay-a",
      peers:[{
        nodeId:"peer-a",capabilities:["reasoning"],reachableCapabilities:["reasoning"],
        async forward(next){
          downstream+=1;
          await gate;
          return {requestId:next.requestId,jobId:next.job.jobId,resultHash:HASH_B};
        }
      }],
      requestOwnership:store.asRelayGuard(),
      now:()=>T0
    });

    const first=relay.forward(envelope);
    const second=relay.forward(envelope);
    await new Promise(resolve=>setImmediate(resolve));
    release();
    const settled=await Promise.allSettled([first,second]);
    assert.equal(downstream,1);
    assert.equal(settled.filter(value=>value.status==="fulfilled").length,1);
    const rejected=settled.find(value=>value.status==="rejected");
    assert.ok([
      "ARCA_CROSS_PEER_DISPATCH_ALREADY_STARTED",
      "ARCA_CROSS_PEER_REQUEST_COMPLETED"
    ].includes(rejected.reason.code));
    assert.equal((await store.status(j.requestId)).state,"completed");
  });
});

test("relay completion evidence validates request/job correlation before returning success",async()=>{
  await fixture(async({store})=>{
    const j=job("bad-result");
    const envelope=createMeshEnvelope(j,{originNode:"origin-a",requiredCapabilities:["reasoning"],now:T0});
    const relay=new MachineBridgeMeshRelay({
      nodeId:"relay-a",
      peers:[{
        nodeId:"peer-a",capabilities:["reasoning"],reachableCapabilities:["reasoning"],
        async forward(){return {requestId:"other-request",jobId:j.jobId,resultHash:HASH_B}}
      }],
      requestOwnership:store.asRelayGuard(),
      now:()=>T0
    });
    await assert.rejects(
      ()=>relay.forward(envelope),
      error=>error.code==="ARCA_CROSS_PEER_RESULT_INVALID"
    );
    assert.equal((await store.status(j.requestId)).state,"uncertain");
    assert.equal((await store.status(j.requestId)).failureCategory,"protocol");
  });
});

test("failure categories expose only a bounded sanitized classification",()=>{
  assert.equal(crossPeerFailureCategory(new Error("timed out waiting")),"timeout");
  const transport=new TypeError("fetch failed");
  assert.equal(crossPeerFailureCategory(transport),"transport");
  assert.equal(crossPeerFailureCategory(new Error("mesh correlation mismatch")),"protocol");
  assert.equal(crossPeerFailureCategory(new Error("something private happened")),"unknown");
});
