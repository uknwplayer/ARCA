import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  FederationPeerHealthStore,
  federationPeerBindingHash,
  federationPeerEffectiveHealth,
  federationResolutionFailureCategory
} from "../src/machine-bridge/federation-peer-health.mjs";
import {FederationPeerCatalog} from "../src/machine-bridge/federation-peer-catalog.mjs";
import {GitHubMeshMailboxTransport} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";

const T0=new Date("2026-09-18T03:30:00.000Z");

function peerRecord(identity,overrides={}){
  return {
    peerId:"peer-b",
    nodeId:"worker-b",
    transport:{
      kind:"github-mailbox",
      repository:"operator-b/mesh-state",
      ref:"arca-runtime",
      root:"remote-mesh"
    },
    identity:{
      nodeId:"worker-b",
      identityId:identity.identityId,
      keyFingerprint:identity.keyFingerprint
    },
    ...overrides
  };
}

async function withHealth(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-federation-health-"));
  try{
    const health=await new FederationPeerHealthStore({
      root,
      policy:{cooldownAfterFailures:2,baseCooldownMs:1_000,maxCooldownMs:8_000}
    }).init();
    await fn({health,root});
  }finally{await rm(root,{recursive:true,force:true})}
}

async function withCatalog(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-federation-health-catalog-"));
  try{
    const catalog=await new FederationPeerCatalog({root}).init();
    await fn({catalog,root});
  }finally{await rm(root,{recursive:true,force:true})}
}

function makeRepoApi(repository,token){
  const store=new Map();let seq=0;let reads=0;
  const response=(status,body)=>({
    ok:status>=200&&status<300,status,statusText:String(status),
    async text(){return body==null?"":JSON.stringify(body)}
  });
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);
    if(options.headers?.Authorization!==`Bearer ${token}`)return response(401,{message:"bad token"});
    if(!u.pathname.startsWith(`/repos/${repository}/`))return response(404,{message:"wrong repository"});
    const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches"))return response(204,null);
    const marker="/contents/";const index=u.pathname.indexOf(marker);
    if(index<0)return response(404,{message:"Not Found"});
    const raw=u.pathname.slice(index+marker.length);
    const path=raw.split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const text=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text,sha:`sha-${++seq}`});
      return response(201,{content:{path,sha:store.get(path).sha}});
    }
    reads+=1;
    const file=store.get(path);
    if(file)return response(200,{type:"file",name:path.split("/").at(-1),path,sha:file.sha,content:Buffer.from(file.text).toString("base64")});
    const prefix=path.replace(/\/$/,"")+"/";const children=new Map();
    for(const [key,value] of store){
      if(!key.startsWith(prefix))continue;
      const rest=key.slice(prefix.length);const name=rest.split("/")[0];if(!name)continue;
      const childPath=prefix+name;
      if(!children.has(name))children.set(name,rest.includes("/")
        ?{type:"dir",name,path:childPath}
        :{type:"file",name,path:childPath,sha:value.sha});
    }
    return children.size?response(200,[...children.values()]):response(404,{message:"Not Found"});
  };
  return {store,fetchImpl,get reads(){return reads}};
}


test("resolution failure classifier treats stale availability separately from trust rejection",()=>{
  assert.equal(
    federationResolutionFailureCategory(new Error("trusted federated peer unavailable or stale: worker-b")),
    "unavailable"
  );
  assert.equal(
    federationResolutionFailureCategory(new Error("untrusted federated peer identity: worker-b")),
    null
  );
});

test("peer health starts unknown and becomes degraded then cooldown with bounded exponential backoff",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  const bindingHash=federationPeerBindingHash(peerRecord(identity));
  await withHealth(async({health})=>{
    assert.deepEqual(await health.status("peer-b",{bindingHash,now:T0}),{
      state:"unknown",canAttempt:true,probe:false,waitMs:0,retryAt:null,
      consecutiveFailures:0,lastFailureCategory:null,bindingChanged:false
    });

    const first=await health.recordFailure("peer-b",{bindingHash,category:"unavailable",now:T0});
    assert.equal(first.consecutiveFailures,1);
    assert.equal(first.cooldownUntil,null);
    const degraded=await health.status("peer-b",{bindingHash,now:T0});
    assert.equal(degraded.state,"degraded");
    assert.equal(degraded.canAttempt,true);

    const secondAt=new Date(T0.getTime()+100);
    const second=await health.recordFailure("peer-b",{bindingHash,category:"timeout",now:secondAt});
    assert.equal(second.consecutiveFailures,2);
    assert.equal(second.cooldownUntil,new Date(secondAt.getTime()+1_000).toISOString());

    const cooling=await health.status("peer-b",{bindingHash,now:new Date(secondAt.getTime()+500)});
    assert.equal(cooling.state,"cooldown");
    assert.equal(cooling.canAttempt,false);
    assert.equal(cooling.waitMs,500);
    await assert.rejects(
      ()=>health.assertAttemptAllowed("peer-b",{bindingHash,now:new Date(secondAt.getTime()+500)}),
      error=>error.code==="ARCA_FEDERATION_PEER_COOLDOWN"&&error.waitMs===500
    );

    const after=await health.status("peer-b",{bindingHash,now:new Date(secondAt.getTime()+1_001)});
    assert.equal(after.state,"degraded");
    assert.equal(after.canAttempt,true);
    assert.equal(after.probe,true);

    const thirdAt=new Date(secondAt.getTime()+1_100);
    const third=await health.recordFailure("peer-b",{bindingHash,category:"transport",now:thirdAt});
    assert.equal(third.cooldownUntil,new Date(thirdAt.getTime()+2_000).toISOString());
  });
});

test("successful probe resets consecutive failures and returns peer to healthy",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  const bindingHash=federationPeerBindingHash(peerRecord(identity));
  await withHealth(async({health})=>{
    await health.recordFailure("peer-b",{bindingHash,category:"timeout",now:T0});
    await health.recordFailure("peer-b",{bindingHash,category:"timeout",now:new Date(T0.getTime()+100)});
    const successAt=new Date(T0.getTime()+1_200);
    const success=await health.recordSuccess("peer-b",{bindingHash,now:successAt});
    assert.equal(success.consecutiveFailures,0);
    assert.equal(success.cooldownUntil,null);
    assert.equal(success.totalFailures,2);
    assert.equal(success.totalSuccesses,1);
    const status=await health.status("peer-b",{bindingHash,now:successAt});
    assert.equal(status.state,"healthy");
    assert.equal(status.canAttempt,true);
  });
});

test("health state is bound to transport plus public identity and does not poison a rotated identity",async()=>{
  const first=generateMeshNodeIdentity("worker-b").identity;
  const second=generateMeshNodeIdentity("worker-b").identity;
  const oldBinding=federationPeerBindingHash(peerRecord(first));
  const newBinding=federationPeerBindingHash(peerRecord(second));
  assert.notEqual(oldBinding,newBinding);

  await withHealth(async({health})=>{
    await health.recordFailure("peer-b",{bindingHash:oldBinding,category:"unavailable",now:T0});
    await health.recordFailure("peer-b",{bindingHash:oldBinding,category:"unavailable",now:new Date(T0.getTime()+10)});
    const oldStatus=await health.status("peer-b",{bindingHash:oldBinding,now:new Date(T0.getTime()+20)});
    assert.equal(oldStatus.state,"cooldown");

    const newStatus=await health.status("peer-b",{bindingHash:newBinding,now:new Date(T0.getTime()+20)});
    assert.equal(newStatus.state,"unknown");
    assert.equal(newStatus.canAttempt,true);
    assert.equal(newStatus.bindingChanged,true);
  });
});

test("health wrapper records forward failures and successes without changing peer trust metadata",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  const bindingHash=federationPeerBindingHash(peerRecord(identity));
  await withHealth(async({health})=>{
    let attempts=0;
    let now=T0.getTime();
    const trustedPeer=Object.freeze({
      nodeId:"worker-b",
      capabilities:["reasoning"],
      reachableCapabilities:["reasoning"],
      federation:Object.freeze({
        identity:Object.freeze({keyFingerprint:identity.keyFingerprint})
      }),
      forward:async()=>{
        attempts+=1;
        if(attempts===1)throw new Error("timed out waiting for mesh result");
        return {ok:true};
      }
    });
    const wrapped=await health.wrapPeer("peer-b",{bindingHash,peer:trustedPeer,now:()=>new Date(now)});
    assert.equal(wrapped.federation.identity.keyFingerprint,identity.keyFingerprint);
    await assert.rejects(()=>wrapped.forward({}),/timed out/);
    assert.equal((await health.status("peer-b",{bindingHash,now:new Date(now)})).state,"degraded");

    now+=100;
    assert.deepEqual(await wrapped.forward({}),{ok:true});
    assert.equal((await health.status("peer-b",{bindingHash,now:new Date(now)})).state,"healthy");
  });
});

test("tampered health records fail validation instead of silently changing cooldown",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  const bindingHash=federationPeerBindingHash(peerRecord(identity));
  await withHealth(async({health,root})=>{
    await health.recordFailure("peer-b",{bindingHash,category:"unavailable",now:T0});
    const path=join(root,"peer-b.json");
    const value=JSON.parse(await readFile(path,"utf8"));
    value.cooldownUntil=new Date(T0.getTime()+86_400_000).toISOString();
    await writeFile(path,JSON.stringify(value,null,2)+"\n");
    await assert.rejects(()=>health.get("peer-b"),/record hash mismatch/);
  });
});

test("catalog availability failures enter cooldown and cooldown blocks remote reads",async()=>{
  const signer=generateMeshNodeIdentity("worker-b");
  const trustStore=new MeshIdentityTrustStore();
  trustStore.trust(signer.identity);
  const api=makeRepoApi("operator-b/mesh-state","token-b");
  const mailbox=new GitHubMeshMailboxTransport({
    repository:"operator-b/mesh-state",ref:"arca-runtime",token:"token-b",fetchImpl:api.fetchImpl,
    identityPolicy:"require-trusted",trustStore
  });

  await withCatalog(async({catalog})=>{
    await catalog.enroll({...peerRecord(signer.identity),now:T0});
    await withHealth(async({health})=>{
      let now=T0.getTime();
      const options={
        mailbox,trustStore,healthStore:health,healthNow:()=>new Date(now),
        resolverOptions:{now:()=>new Date(now),maxAgeMs:60_000,clockSkewMs:0}
      };
      await assert.rejects(()=>catalog.resolve("peer-b",options),/trusted federated peer not found/);
      now+=10;
      await assert.rejects(()=>catalog.resolve("peer-b",options),/trusted federated peer not found/);
      const readsAfterFailures=api.reads;
      now+=10;
      await assert.rejects(
        ()=>catalog.resolve("peer-b",options),
        error=>error.code==="ARCA_FEDERATION_PEER_COOLDOWN"
      );
      assert.equal(api.reads,readsAfterFailures);
    });
  });
});

test("identity mismatch remains a trust failure and does not create health backoff",async()=>{
  const trusted=generateMeshNodeIdentity("worker-b");
  const impostor=generateMeshNodeIdentity("worker-b");
  const originTrust=new MeshIdentityTrustStore();
  originTrust.trust(trusted.identity);
  const hostTrust=new MeshIdentityTrustStore();
  hostTrust.trust(impostor.identity);

  const api=makeRepoApi("operator-b/mesh-state","token-b");
  const hostMailbox=new GitHubMeshMailboxTransport({
    repository:"operator-b/mesh-state",ref:"arca-runtime",token:"token-b",fetchImpl:api.fetchImpl,
    identityPolicy:"require-trusted",trustStore:hostTrust
  });
  await hostMailbox.registerSignedNode({
    nodeId:"worker-b",kind:"endpoint",capabilities:["reasoning"],heartbeatAt:T0.toISOString()
  },{signer:impostor,now:T0,ttlMs:120_000,clockSkewMs:0});

  const originMailbox=new GitHubMeshMailboxTransport({
    repository:"operator-b/mesh-state",ref:"arca-runtime",token:"token-b",fetchImpl:api.fetchImpl,
    identityPolicy:"require-trusted",trustStore:originTrust
  });

  await withCatalog(async({catalog})=>{
    await catalog.enroll({...peerRecord(trusted.identity),now:T0});
    const bindingHash=federationPeerBindingHash(peerRecord(trusted.identity));
    await withHealth(async({health})=>{
      await assert.rejects(()=>catalog.resolve("peer-b",{
        mailbox:originMailbox,
        trustStore:originTrust,
        healthStore:health,
        healthNow:()=>T0,
        resolverOptions:{now:()=>T0,maxAgeMs:60_000,clockSkewMs:0}
      }),/untrusted federated peer identity|key fingerprint mismatch|not current/);
      const status=await health.status("peer-b",{bindingHash,now:T0});
      assert.equal(status.state,"unknown");
      assert.equal(status.consecutiveFailures,0);
    });
  });
});

test("effective health validates a supplied record before interpreting binding changes",async()=>{
  const identity=generateMeshNodeIdentity("worker-b").identity;
  const bindingHash=federationPeerBindingHash(peerRecord(identity));
  await withHealth(async({health})=>{
    const record=await health.recordFailure("peer-b",{bindingHash,category:"remote",now:T0});
    const tampered={...record,bindingHash:"f".repeat(64)};
    assert.throws(()=>federationPeerEffectiveHealth(tampered,{bindingHash,now:T0}),/record hash mismatch/);
  });
});
