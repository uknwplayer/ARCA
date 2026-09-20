import test from "node:test";
import assert from "node:assert/strict";
import {FederationRuntimeRefreshController} from "../src/machine-bridge/federation-runtime-refresh.mjs";

const T0=new Date("2026-09-18T04:30:00.000Z");

function record(peerId,{nodeId=peerId+"-node",revision=1,hash="a"}={}){
  return {
    peerId,
    nodeId,
    status:"active",
    revision,
    recordHash:hash.repeat(64)
  };
}

function memoryCatalog(initial){
  const records=new Map(Object.entries(initial).map(([key,value])=>[key,{...value}]));
  const reads=[];
  return {
    reads,
    async get(peerId){
      reads.push(peerId);
      const value=records.get(peerId);
      return value?{...value}:null;
    },
    set(peerId,value){records.set(peerId,{...value})},
    delete(peerId){records.delete(peerId)}
  };
}

function runtimeStub({name="runtime",onForward=async envelope=>({name,envelope}),snapshot={}}={}){
  let forwards=0;
  return {
    async forward(envelope){forwards+=1;return onForward(envelope)},
    advertise(){return {nodeId:name,forward:envelope=>this.forward(envelope)}},
    snapshot(){return {format:"arca-federation-runtime-v1",name,...snapshot}},
    get forwards(){return forwards}
  };
}

function options(catalog,peerConfigs=[
  {peerId:"peer-a",credentialRef:"vault://github/peer-a"}
]){
  return {
    relayNodeId:"relay-a",
    catalog,
    peerConfigs,
    healthStore:{},
    trustStore:{},
    mailboxFactory:async()=>null
  };
}

test("refresh creates a guarded generation and never exposes credential refs",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  const runtime=runtimeStub({name:"generation-1"});
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>runtime,
    now:()=>T0,
    refreshIntervalMs:1_000
  });

  const ready=await controller.refreshOnce();
  assert.equal(ready.state,"ready");
  assert.equal(ready.generation,1);
  assert.equal(ready.lastRefreshAttemptAt,T0.toISOString());
  assert.equal(ready.lastRefreshSuccessAt,T0.toISOString());
  assert.deepEqual(ready.configuredPeerIds,["peer-a"]);
  assert.equal(ready.catalogPins[0].revision,1);
  assert.equal(JSON.stringify(ready).includes("vault://"),false);

  const result=await controller.forward({jobId:"job-1"});
  assert.equal(result.name,"generation-1");
  assert.equal(runtime.forwards,1);
});

test("catalog disable invalidates the generation before old forward can run",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  const runtime=runtimeStub();
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>runtime,
    now:()=>T0
  });
  await controller.refreshOnce();

  catalog.set("peer-a",{...record("peer-a"),status:"disabled",revision:2,recordHash:"b".repeat(64)});

  await assert.rejects(
    ()=>controller.forward({jobId:"blocked"}),
    error=>error.code==="ARCA_FEDERATION_RUNTIME_STALE"
  );
  assert.equal(runtime.forwards,0);
  assert.equal(controller.snapshot().state,"invalid");
  assert.equal(controller.snapshot().lastErrorCode,"ARCA_FEDERATION_RUNTIME_STALE");
});

test("catalog integrity/read failure invalidates the generation before forwarding",async()=>{
  const base=memoryCatalog({"peer-a":record("peer-a")});
  let failReads=false;
  const catalog={
    reads:base.reads,
    async get(peerId){
      if(failReads)throw new Error("federation peer record hash mismatch");
      return base.get(peerId);
    }
  };
  const runtime=runtimeStub();
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>runtime,
    now:()=>T0
  });
  await controller.refreshOnce();
  failReads=true;

  await assert.rejects(
    ()=>controller.forward({jobId:"tampered"}),
    error=>error.code==="ARCA_FEDERATION_RUNTIME_STALE"&&/catalog change/.test(error.message)
  );
  assert.equal(runtime.forwards,0);
  assert.equal(controller.snapshot().state,"invalid");
});

test("identity/catalog rotation invalidates old runtime even when peer remains active",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  const runtime=runtimeStub();
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>runtime,
    now:()=>T0
  });
  await controller.refreshOnce();

  catalog.set("peer-a",record("peer-a",{revision:2,hash:"c"}));

  await assert.rejects(
    ()=>controller.advertise(),
    error=>error.code==="ARCA_FEDERATION_RUNTIME_STALE"
  );
  assert.equal(controller.snapshot().state,"invalid");
});

test("failed refresh discards the previous generation instead of keeping last-known-good routing",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  const runtime=runtimeStub({name:"old"});
  let calls=0;
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>{
      calls+=1;
      if(calls===1)return runtime;
      throw new Error("untrusted federated peer identity: peer-a-node");
    },
    now:()=>T0
  });

  await controller.refreshOnce();
  assert.equal(controller.snapshot().state,"ready");

  await assert.rejects(()=>controller.refreshOnce(),/untrusted federated peer identity/);
  assert.equal(controller.snapshot().state,"invalid");
  assert.equal(controller.snapshot().lastErrorCode,"ARCA_FEDERATION_RUNTIME_TRUST_INVALID");

  await assert.rejects(
    ()=>controller.forward({jobId:"must-not-use-old"}),
    error=>error.code==="ARCA_FEDERATION_RUNTIME_TRUST_INVALID"
  );
  assert.equal(runtime.forwards,0);
});

test("catalog changes during a generation build fail closed",async()=>{
  const first=record("peer-a");
  const catalog=memoryCatalog({"peer-a":first});
  let changed=false;
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>{
      if(!changed){
        changed=true;
        catalog.set("peer-a",record("peer-a",{revision:2,hash:"b"}));
      }
      return runtimeStub();
    },
    now:()=>T0
  });

  await assert.rejects(()=>controller.refreshOnce(),/catalog changed during generation build/);
  assert.equal(controller.snapshot().state,"invalid");
  assert.equal(controller.snapshot().generation,0);
});

test("refresh serializes overlapping rebuilds and advances generation only after success",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  let active=0,maxActive=0,calls=0;
  const assembler=async()=>{
    calls+=1;
    active+=1;
    maxActive=Math.max(maxActive,active);
    await Promise.resolve();
    active-=1;
    return runtimeStub({name:"runtime-"+calls});
  };
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler,
    now:()=>T0
  });

  const [one,two,three]=await Promise.all([
    controller.refreshOnce(),
    controller.refreshOnce(),
    controller.refreshOnce()
  ]);
  assert.equal(maxActive,1);
  assert.equal(one.generation,1);
  assert.equal(two.generation,2);
  assert.equal(three.generation,3);
  assert.equal(controller.snapshot().generation,3);
});

test("recovery refresh can replace a partial runtime with a recovered peer set without changing configured peers",async()=>{
  const catalog=memoryCatalog({
    "peer-a":record("peer-a",{hash:"a"}),
    "peer-b":record("peer-b",{hash:"b"})
  });
  const peerConfigs=[
    {peerId:"peer-a",credentialRef:"vault://github/a"},
    {peerId:"peer-b",credentialRef:"vault://github/b"}
  ];
  let available=false;
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog,peerConfigs),
    assembler:async()=>runtimeStub({
      name:available?"both":"partial",
      snapshot:{
        configuredPeerCount:2,
        resolvedPeerCount:available?2:1,
        unavailablePeerCount:available?0:1
      }
    }),
    now:()=>T0
  });

  await controller.refreshOnce();
  assert.equal(controller.snapshot().runtime.resolvedPeerCount,1);
  assert.deepEqual(controller.snapshot().configuredPeerIds,["peer-a","peer-b"]);

  available=true;
  await controller.refreshOnce();
  assert.equal(controller.snapshot().runtime.resolvedPeerCount,2);
  assert.equal(controller.snapshot().generation,2);
  assert.deepEqual(controller.snapshot().configuredPeerIds,["peer-a","peer-b"]);
});

test("new catalog peers are never discovered into the immutable configured set",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>runtimeStub(),
    now:()=>T0
  });
  await controller.refreshOnce();

  catalog.set("peer-new",record("peer-new",{hash:"d"}));
  await controller.refreshOnce();

  assert.deepEqual(controller.snapshot().configuredPeerIds,["peer-a"]);
  assert.equal(controller.snapshot().catalogPins.some(value=>value.peerId==="peer-new"),false);
  assert.equal(catalog.reads.includes("peer-new"),false);
});

test("external mutation of the original peer config array cannot expand controller scope",async()=>{
  const catalog=memoryCatalog({
    "peer-a":record("peer-a"),
    "peer-b":record("peer-b",{hash:"b"})
  });
  const peerConfigs=[{peerId:"peer-a",credentialRef:"vault://github/a"}];
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog,peerConfigs),
    assembler:async()=>runtimeStub(),
    now:()=>T0
  });

  peerConfigs.push({peerId:"peer-b",credentialRef:"vault://github/b"});
  await controller.refreshOnce();

  assert.deepEqual(controller.snapshot().configuredPeerIds,["peer-a"]);
});

test("start performs an initial safe refresh and stop disables the interval controller",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  let calls=0;
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>{calls+=1;return runtimeStub()},
    now:()=>T0,
    refreshIntervalMs:1_000
  });

  const started=await controller.start();
  assert.equal(started.running,true);
  assert.equal(started.generation,1);
  assert.equal(calls,1);

  const stopped=await controller.stop();
  assert.equal(stopped.running,false);
  assert.equal(controller.running,false);
});

test("forward before first successful refresh fails closed",async()=>{
  const catalog=memoryCatalog({"peer-a":record("peer-a")});
  const controller=new FederationRuntimeRefreshController({
    assemblyOptions:options(catalog),
    assembler:async()=>runtimeStub(),
    now:()=>T0
  });
  await assert.rejects(
    ()=>controller.forward({}),
    error=>error.code==="ARCA_FEDERATION_RUNTIME_UNAVAILABLE"
  );
});
