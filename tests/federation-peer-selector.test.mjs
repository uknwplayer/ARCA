import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {FederationPeerSelector} from "../src/machine-bridge/federation-peer-selector.mjs";
import {FederationPeerCatalog} from "../src/machine-bridge/federation-peer-catalog.mjs";
import {
  MachineBridgeMeshRelay,
  createMeshEnvelope
} from "../src/machine-bridge/mesh.mjs";
import {generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";

const NOW=new Date("2026-09-18T04:00:00.000Z");
const HASH_A="a".repeat(64);
const HASH_B="b".repeat(64);

function candidate(nodeId,reachableCapabilities=["reasoning"]){
  return {nodeId,capabilities:[...reachableCapabilities],reachableCapabilities:[...reachableCapabilities]};
}

function healthStore(states){
  return {
    async status(peerId){
      return states[peerId]||{
        state:"unknown",canAttempt:true,probe:false,waitMs:0,retryAt:null,
        consecutiveFailures:0,lastFailureCategory:null,bindingChanged:false
      };
    }
  };
}

function binding(peerId,nodeId,bindingHash){
  return {peerId,nodeId,bindingHash};
}

function job(overrides={}){
  return {
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"selection-job-001",
    requestId:"selection-req-001",
    action:"worker.ping",
    requires:[],
    params:{echo:"selection"},
    ...overrides
  };
}

test("selector prefers healthy over unknown and degraded candidates deterministically",async()=>{
  const selector=new FederationPeerSelector({
    healthStore:healthStore({
      "peer-a":{state:"unknown",canAttempt:true,consecutiveFailures:0,retryAt:null},
      "peer-b":{state:"healthy",canAttempt:true,consecutiveFailures:0,retryAt:null},
      "peer-c":{state:"degraded",canAttempt:true,consecutiveFailures:1,retryAt:null}
    }),
    bindings:[
      binding("peer-a","node-a",HASH_A),
      binding("peer-b","node-b",HASH_B),
      binding("peer-c","node-c","c".repeat(64))
    ],
    now:()=>NOW
  });

  const decision=await selector.select({
    candidates:[candidate("node-a"),candidate("node-c"),candidate("node-b")],
    requiredCapabilities:["reasoning"],
    requestId:"selection-req-001",
    jobId:"selection-job-001"
  });
  assert.equal(decision.selectedNodeId,"node-b");
  assert.equal(decision.selectedPeerId,"peer-b");
  assert.equal(decision.healthState,"healthy");
  assert.equal(decision.candidateCount,3);
  assert.equal(decision.attemptableCount,3);
});

test("selector excludes cooldown candidates and chooses a degraded probe when necessary",async()=>{
  const selector=new FederationPeerSelector({
    healthStore:healthStore({
      "peer-a":{
        state:"cooldown",canAttempt:false,consecutiveFailures:3,
        retryAt:"2026-09-18T04:00:30.000Z"
      },
      "peer-b":{state:"degraded",canAttempt:true,consecutiveFailures:2,retryAt:null}
    }),
    bindings:[binding("peer-a","node-a",HASH_A),binding("peer-b","node-b",HASH_B)],
    now:()=>NOW
  });
  const decision=await selector.select({
    candidates:[candidate("node-a"),candidate("node-b")],
    requiredCapabilities:["reasoning"]
  });
  assert.equal(decision.selectedNodeId,"node-b");
  assert.equal(decision.healthState,"degraded");
  assert.equal(decision.attemptableCount,1);
});

test("selector reports earliest retry when every compatible peer is cooling down",async()=>{
  const selector=new FederationPeerSelector({
    healthStore:healthStore({
      "peer-a":{state:"cooldown",canAttempt:false,consecutiveFailures:2,retryAt:"2026-09-18T04:00:20.000Z"},
      "peer-b":{state:"cooldown",canAttempt:false,consecutiveFailures:4,retryAt:"2026-09-18T04:00:10.000Z"}
    }),
    bindings:[binding("peer-a","node-a",HASH_A),binding("peer-b","node-b",HASH_B)],
    now:()=>NOW
  });
  await assert.rejects(
    ()=>selector.select({candidates:[candidate("node-a"),candidate("node-b")],requiredCapabilities:["reasoning"]}),
    error=>error.code==="ARCA_FEDERATION_NO_ATTEMPTABLE_PEER"&&error.retryAt==="2026-09-18T04:00:10.000Z"
  );
});

test("selector fails closed when the relay exposes a candidate without explicit selector binding",async()=>{
  const selector=new FederationPeerSelector({
    healthStore:healthStore({}),
    bindings:[binding("peer-a","node-a",HASH_A)],
    now:()=>NOW
  });
  await assert.rejects(
    ()=>selector.select({candidates:[candidate("node-a"),candidate("node-unbound")]}),
    /candidate is not explicitly bound/
  );
});

test("selector applies capability compatibility before health ranking",async()=>{
  const selector=new FederationPeerSelector({
    healthStore:healthStore({
      "peer-a":{state:"unknown",canAttempt:true,consecutiveFailures:0,retryAt:null},
      "peer-b":{state:"healthy",canAttempt:true,consecutiveFailures:0,retryAt:null}
    }),
    bindings:[binding("peer-a","node-a",HASH_A),binding("peer-b","node-b",HASH_B)],
    now:()=>NOW
  });
  const decision=await selector.select({
    candidates:[
      candidate("node-a",["reasoning"]),
      candidate("node-b",["document.read"])
    ],
    requiredCapabilities:["reasoning"]
  });
  assert.equal(decision.selectedNodeId,"node-a");
});

test("equal-health selection is stable by peerId then nodeId",async()=>{
  const selector=new FederationPeerSelector({
    healthStore:healthStore({
      "peer-z":{state:"healthy",canAttempt:true,consecutiveFailures:0,retryAt:null},
      "peer-a":{state:"healthy",canAttempt:true,consecutiveFailures:0,retryAt:null}
    }),
    bindings:[
      binding("peer-z","node-a",HASH_A),
      binding("peer-a","node-z",HASH_B)
    ],
    now:()=>NOW
  });
  const decision=await selector.select({candidates:[candidate("node-a"),candidate("node-z")]});
  assert.equal(decision.selectedPeerId,"peer-a");
  assert.equal(decision.selectedNodeId,"node-z");
});

test("Mesh relay uses selector result but never permits selection outside compatible candidates",async()=>{
  let a=0,b=0,forwarded=null;
  const peerA={nodeId:"node-a",capabilities:["reasoning"],reachableCapabilities:["reasoning"],forward:async envelope=>{a+=1;return envelope}};
  const peerB={nodeId:"node-b",capabilities:["reasoning"],reachableCapabilities:["reasoning"],forward:async envelope=>{b+=1;forwarded=envelope;return envelope}};
  const selector=new FederationPeerSelector({
    healthStore:healthStore({
      "peer-a":{state:"unknown",canAttempt:true,consecutiveFailures:0,retryAt:null},
      "peer-b":{state:"healthy",canAttempt:true,consecutiveFailures:0,retryAt:null}
    }),
    bindings:[binding("peer-a","node-a",HASH_A),binding("peer-b","node-b",HASH_B)],
    now:()=>NOW
  });
  const relay=new MachineBridgeMeshRelay({
    nodeId:"relay-a",
    peers:[peerA,peerB],
    now:()=>NOW,
    peerSelector:selector.asMeshPeerSelector()
  });
  const envelope=createMeshEnvelope(job(),{
    originNode:"bridge-a",requiredCapabilities:["reasoning"],ttlMs:60_000,now:NOW
  });
  await relay.forward(envelope);
  assert.equal(a,0);
  assert.equal(b,1);
  assert.equal(forwarded.receipts[0].nextNode,"node-b");

  const invalidRelay=new MachineBridgeMeshRelay({
    nodeId:"relay-x",
    peers:[peerA],
    now:()=>NOW,
    peerSelector:async()=> "node-outside"
  });
  await assert.rejects(()=>invalidRelay.forward(envelope),/selector returned unavailable candidate/);
});

test("relay gives selectors an immutable routing-only context",async()=>{
  let observed=false;
  const peer={nodeId:"node-a",capabilities:["reasoning"],reachableCapabilities:["reasoning"],forward:async envelope=>envelope};
  const relay=new MachineBridgeMeshRelay({
    nodeId:"relay-a",
    peers:[peer],
    now:()=>NOW,
    peerSelector:async context=>{
      assert.equal(Object.isFrozen(context),true);
      assert.equal(Object.isFrozen(context.candidates),true);
      assert.equal(Object.isFrozen(context.candidates[0]),true);
      assert.equal(Object.isFrozen(context.candidates[0].capabilities),true);
      assert.equal(Object.isFrozen(context.candidates[0].reachableCapabilities),true);
      assert.equal(Object.isFrozen(context.requiredCapabilities),true);
      assert.throws(()=>context.requiredCapabilities.push("extra"),TypeError);
      observed=true;
      return "node-a";
    }
  });
  const envelope=createMeshEnvelope(job({jobId:"selection-job-frozen",requestId:"selection-req-frozen"}),{
    originNode:"bridge-a",requiredCapabilities:["reasoning"],ttlMs:60_000,now:NOW
  });
  await relay.forward(envelope);
  assert.equal(observed,true);
});

test("relay never automatically retries a second peer after the selected forward starts",async()=>{
  let a=0,b=0;
  const peerA={nodeId:"node-a",capabilities:["reasoning"],reachableCapabilities:["reasoning"],forward:async()=>{a+=1;return {ok:true}}};
  const peerB={nodeId:"node-b",capabilities:["reasoning"],reachableCapabilities:["reasoning"],forward:async()=>{b+=1;throw new Error("timed out after remote enqueue")}};
  const selector=new FederationPeerSelector({
    healthStore:healthStore({
      "peer-a":{state:"unknown",canAttempt:true,consecutiveFailures:0,retryAt:null},
      "peer-b":{state:"healthy",canAttempt:true,consecutiveFailures:0,retryAt:null}
    }),
    bindings:[binding("peer-a","node-a",HASH_A),binding("peer-b","node-b",HASH_B)],
    now:()=>NOW
  });
  const relay=new MachineBridgeMeshRelay({
    nodeId:"relay-a",
    peers:[peerA,peerB],
    now:()=>NOW,
    peerSelector:selector.asMeshPeerSelector()
  });
  const envelope=createMeshEnvelope(job({jobId:"selection-job-fail",requestId:"selection-req-fail"}),{
    originNode:"bridge-a",requiredCapabilities:["reasoning"],ttlMs:60_000,now:NOW
  });
  await assert.rejects(()=>relay.forward(envelope),/timed out after remote enqueue/);
  assert.equal(b,1);
  assert.equal(a,0);
});

test("fromCatalog requires an explicit active peer list and uses catalog-validated bindings",async()=>{
  const root=await mkdtemp(join(tmpdir(),"arca-selection-catalog-"));
  try{
    const catalog=await new FederationPeerCatalog({root}).init();
    const one=generateMeshNodeIdentity("node-a").identity;
    const two=generateMeshNodeIdentity("node-b").identity;
    await catalog.enroll({
      peerId:"peer-a",nodeId:"node-a",
      transport:{kind:"github-mailbox",repository:"operator-a/state",ref:"arca-runtime",root:"remote-mesh"},
      identity:{nodeId:"node-a",identityId:one.identityId,keyFingerprint:one.keyFingerprint},
      now:NOW
    });
    await catalog.enroll({
      peerId:"peer-b",nodeId:"node-b",
      transport:{kind:"github-mailbox",repository:"operator-b/state",ref:"arca-runtime",root:"remote-mesh"},
      identity:{nodeId:"node-b",identityId:two.identityId,keyFingerprint:two.keyFingerprint},
      now:NOW
    });
    await catalog.disable("peer-b",{now:new Date(NOW.getTime()+1)});

    const selector=await FederationPeerSelector.fromCatalog({
      catalog,peerIds:["peer-a"],healthStore:healthStore({}),now:()=>NOW
    });
    assert.equal(selector.bindings().length,1);
    assert.equal(selector.bindings()[0].peerId,"peer-a");

    await assert.rejects(()=>FederationPeerSelector.fromCatalog({
      catalog,peerIds:["peer-b"],healthStore:healthStore({}),now:()=>NOW
    }),/peer disabled/);
    await assert.rejects(()=>FederationPeerSelector.fromCatalog({
      catalog,peerIds:[],healthStore:healthStore({}),now:()=>NOW
    }),/explicit peerIds required/);
  }finally{await rm(root,{recursive:true,force:true})}
});
