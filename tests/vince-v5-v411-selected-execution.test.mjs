import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {
  buildSignedTermuxV41Result
} from "../src/machine-bridge/vince-v4-1-termux-worker.mjs";
import {
  buildSignedTermuxV5Presence,
  routeTermuxV5Candidates
} from "../src/machine-bridge/vince-v5-termux-presence.mjs";
import {
  buildV5SelectedV41Request,
  buildV5SelectedV411Dispatch,
  proveV5SelectedV411ReplayRejected,
  verifyConsumeV5SelectedV411,
  verifyV5SelectedV411Dispatch,
  v5V411Sha256
} from "../src/machine-bridge/vince-v5-v411-selected-execution.mjs";
import {createEmptyV41AcceptedChallengeRegistry} from "../src/machine-bridge/vince-v4-1-durable-challenge-registry.mjs";

const NOW="2026-09-23T10:00:00.000Z";
const LATER="2026-09-23T10:00:01.000Z";

function worker(nodeId){
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const der=Buffer.from(publicKey.export({type:"spki",format:"der"}));
  const identity={
    nodeId,algorithm:"Ed25519",
    publicKeySpki:der.toString("base64"),
    keyFingerprint:createHash("sha256").update(der).digest("hex")
  };
  const pin={
    format:"arca-vince-v4.1-worker-pin",version:1,workerKind:"termux-android",identity,
    source:{repository:"uknwplayer/ARCA",branch:"channel",path:`identity/${nodeId}.json`,blobSha:"a".repeat(40)},
    reviewedAt:NOW,
    policy:{
      action:"git-status",automaticRetryAllowed:false,failoverAllowed:false,
      authorityExpanded:false,coreMutationAllowed:false,trustModificationAllowed:false
    }
  };
  return {identity,privateKey,pin};
}
function routeFixture(){
  const a=worker("vince-termux-a"), b=worker("vince-termux-b");
  const pa=buildSignedTermuxV5Presence({
    identity:a.identity,privateKey:a.privateKey,state:"WITHDRAWN",
    observedAt:"2026-09-23T09:59:50.000Z",ttl:300_000
  });
  const pb=buildSignedTermuxV5Presence({
    identity:b.identity,privateKey:b.privateKey,state:"READY",
    observedAt:"2026-09-23T09:59:55.000Z",ttl:300_000
  });
  const routeProof=routeTermuxV5Candidates({
    pins:[a.pin,b.pin],presences:[pa,pb],now:NOW
  });
  return {a,b,pa,pb,routeProof};
}
function makeDispatch(fx){
  const {request}=buildV5SelectedV41Request({
    jobId:"vince-v41-v5-selected-test-011",
    challenge:Buffer.alloc(32,11).toString("base64url"),
    expiresAt:"2026-09-23T10:15:00.000Z"
  });
  const dispatch=buildV5SelectedV411Dispatch({
    routeProof:fx.routeProof,
    selectedPin:fx.b.pin,
    request,
    presencePaths:["remote-jobs/v5/presence/a.json","remote-jobs/v5/presence/b.json"],
    routePath:"remote-jobs/v5/routes/vince-v41-v5-selected-test-011.json",
    createdAt:NOW
  });
  return {request,dispatch};
}

test("selected dispatch requires exactly one eligible endpoint and binds worker B",()=>{
  const fx=routeFixture();
  const {request,dispatch}=makeDispatch(fx);
  assert.equal(fx.routeProof.route.eligibleCount,1);
  assert.equal(fx.routeProof.route.selectedEndpointId,"vince-termux-b");
  assert.equal(dispatch.selectedEndpointId,"vince-termux-b");
  assert.equal(dispatch.selectedWorkerKeyFingerprint,fx.b.identity.keyFingerprint);
  assert.equal(dispatch.requestSha256,buildV5SelectedV41Request({
    jobId:request.jobId,challenge:request.challenge,expiresAt:request.expiresAt
  }).requestSha256);
});

test("dispatch fails closed when two endpoints are eligible",()=>{
  const a=worker("vince-termux-a"),b=worker("vince-termux-b");
  const pa=buildSignedTermuxV5Presence({
    identity:a.identity,privateKey:a.privateKey,state:"READY",observedAt:"2026-09-23T09:59:50.000Z",ttl:300_000
  });
  const pb=buildSignedTermuxV5Presence({
    identity:b.identity,privateKey:b.privateKey,state:"READY",observedAt:"2026-09-23T09:59:55.000Z",ttl:300_000
  });
  const routeProof=routeTermuxV5Candidates({pins:[a.pin,b.pin],presences:[pa,pb],now:NOW});
  const {request}=buildV5SelectedV41Request({
    jobId:"vince-v41-v5-selected-ambiguous",challenge:Buffer.alloc(32,12).toString("base64url"),
    expiresAt:"2026-09-23T10:15:00.000Z"
  });
  assert.throws(()=>buildV5SelectedV411Dispatch({
    routeProof,selectedPin:b.pin,request,
    presencePaths:["remote-jobs/v5/presence/a.json","remote-jobs/v5/presence/b.json"],
    routePath:"remote-jobs/v5/routes/vince-v41-v5-selected-ambiguous.json",
    createdAt:NOW
  }),/ROUTE_NOT_UNAMBIGUOUS/);
});

test("wrong local worker and mutated request are rejected before execution",()=>{
  const fx=routeFixture();
  const {request,dispatch}=makeDispatch(fx);
  assert.throws(()=>verifyV5SelectedV411Dispatch({
    dispatch,request,pin:fx.b.pin,routeProof:fx.routeProof,localIdentity:fx.a.identity,now:new Date(NOW)
  }),/LOCAL_WORKER_NOT_SELECTED/);
  const changed={...request,challenge:Buffer.alloc(32,99).toString("base64url")};
  assert.throws(()=>verifyV5SelectedV411Dispatch({
    dispatch,request:changed,pin:fx.b.pin,routeProof:fx.routeProof,localIdentity:fx.b.identity,now:new Date(NOW)
  }),/REQUEST_BINDING_MISMATCH/);
});

test("selected result is durably consumed and replay proof needs no worker reexecution",async()=>{
  const fx=routeFixture();
  const {request,dispatch}=makeDispatch(fx);
  const result=buildSignedTermuxV41Result({
    request,
    identity:fx.b.identity,
    privateKey:fx.b.privateKey,
    git:{stdout:"## main\n",stderr:"",gitBranch:"main",gitHead:"b".repeat(40),gitDirty:false},
    startedAt:NOW,finishedAt:LATER
  });
  let registry=createEmptyV41AcceptedChallengeRegistry();
  let registrySha="1".repeat(40);
  const store=new Map([
    ["remote-jobs/v5/dispatches/"+request.jobId+".json",dispatch],
    ["remote-jobs/v4.1/requests/"+request.jobId+".json",request],
    ["remote-jobs/v4.1/results/"+request.jobId+".json",result],
    [dispatch.routePath,fx.routeProof],
    ["remote-jobs/v4.1/control/accepted-challenges.json",registry]
  ]);
  const client={
    async readJson({path}){
      if(!store.has(path))throw new Error("missing:"+path);
      return structuredClone(store.get(path));
    },
    async readJsonWithMeta({path}){
      if(!store.has(path))throw new Error("missing:"+path);
      return {value:structuredClone(store.get(path)),blobSha:registrySha};
    },
    async updateJsonCas({path,value,sha}){
      assert.equal(sha,registrySha);
      store.set(path,structuredClone(value));
      registry=value;
      registrySha="2".repeat(40);
      return {ok:true};
    },
    async createJson({path,value}){
      if(store.has(path))throw new Error("already exists");
      store.set(path,structuredClone(value));
      return {ok:true};
    }
  };
  const times=[new Date(NOW),new Date(NOW),new Date(LATER)];
  let i=0;
  const accepted=await verifyConsumeV5SelectedV411({
    jobId:request.jobId,pin:fx.b.pin,channelClient:client,
    clock:()=>times[Math.min(i++,times.length-1)]
  });
  assert.equal(accepted.status,"ATTESTED_VERIFIED_SELECTED_RESULT_DURABLY_CONSUMED");
  assert.equal(accepted.acceptance.selectedEndpointId,"vince-termux-b");
  assert.equal(accepted.acceptance.durableRegistryBlobSha,"2".repeat(40));
  assert.equal(registry.entries.length,1);
  const replay=await proveV5SelectedV411ReplayRejected({
    jobId:request.jobId,channelClient:client
  });
  assert.equal(replay.status,"DURABLE_REPLAY_REJECTED");
  assert.equal(replay.workerReexecuted,false);
  assert.equal(replay.workerNodeId,"vince-termux-b");
});

test("dispatch self-hash detects mutation",()=>{
  const fx=routeFixture();
  const {request,dispatch}=makeDispatch(fx);
  const mutated={...dispatch,selectedEndpointId:"vince-termux-a"};
  assert.notEqual(v5V411Sha256({...mutated,dispatchSha256:undefined}),dispatch.dispatchSha256);
  assert.throws(()=>verifyV5SelectedV411Dispatch({
    dispatch:mutated,request,pin:fx.b.pin,routeProof:fx.routeProof,localIdentity:fx.b.identity,now:new Date(NOW)
  }),/DISPATCH_HASH_MISMATCH|SELECTED_PIN_MISMATCH/);
});
