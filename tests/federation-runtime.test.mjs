import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  assembleFederationRuntime,
  createBrokeredGitHubMeshMailboxFactory
} from "../src/machine-bridge/federation-runtime.mjs";
import {FederationPeerCatalog} from "../src/machine-bridge/federation-peer-catalog.mjs";
import {
  FederationPeerHealthStore,
  federationPeerBindingHash
} from "../src/machine-bridge/federation-peer-health.mjs";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity,
  signMeshNodeAdvertisement
} from "../src/machine-bridge/mesh-identity.mjs";
import {normalizeMeshNodeAdvertisement} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {createMeshEnvelope} from "../src/machine-bridge/mesh.mjs";

const NOW=new Date("2026-09-18T04:15:00.000Z");

async function withStores(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-federation-runtime-"));
  try{
    const catalog=await new FederationPeerCatalog({root:join(root,"catalog")}).init();
    const healthStore=await new FederationPeerHealthStore({root:join(root,"health")}).init();
    await fn({root,catalog,healthStore});
  }finally{await rm(root,{recursive:true,force:true})}
}

function peerRecord(identity,{peerId,nodeId,repository}){
  return {
    peerId,
    nodeId,
    transport:{kind:"github-mailbox",repository,ref:"arca-runtime",root:"remote-mesh"},
    identity:{nodeId,identityId:identity.identityId,keyFingerprint:identity.keyFingerprint},
    now:NOW
  };
}

function trustedMailbox({record,signer,trustStore,onForward=async envelope=>envelope,available=true,identityTrusted=true}){
  const node=normalizeMeshNodeAdvertisement({
    nodeId:record.nodeId,
    kind:"endpoint",
    capabilities:["reasoning"],
    reachableCapabilities:["reasoning"],
    heartbeatAt:NOW.toISOString()
  },{now:NOW});
  node.transport={
    kind:"github-mailbox",
    repository:record.transport.repository,
    ref:record.transport.ref,
    root:record.transport.root
  };
  const statement=signMeshNodeAdvertisement(node,signer,{issuedAt:NOW,ttlMs:60_000});
  const candidate={node,statement,signed:true,identityTrusted,stale:false,sha:"test-sha",path:"nodes/"+record.nodeId+".json"};
  return {
    repository:record.transport.repository,
    ref:record.transport.ref,
    root:record.transport.root,
    identityPolicy:"require-trusted",
    trustStore,
    async listNodes(){return available&&identityTrusted?[candidate]:[]},
    async inspectNode(){
      if(!available)return null;
      return {valid:true,signed:true,identityTrusted,stale:false,node,statement,sha:"test-sha",path:"nodes/"+record.nodeId+".json"};
    },
    remotePeer(nodeId){
      return {
        nodeId,
        capabilities:["reasoning"],
        reachableCapabilities:["reasoning"],
        forward:onForward
      };
    }
  };
}

function job(id){
  return {
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"runtime-job-"+id,
    requestId:"runtime-req-"+id,
    action:"worker.ping",
    requires:[],
    params:{echo:id}
  };
}

test("runtime assembles explicit trusted peers and selector routes once to the healthy peer",async()=>{
  await withStores(async({catalog,healthStore})=>{
    const relaySigner=generateMeshNodeIdentity("relay-a");
    const a=generateMeshNodeIdentity("worker-a");
    const b=generateMeshNodeIdentity("worker-b");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(relaySigner.identity);
    trustStore.trust(a.identity);
    trustStore.trust(b.identity);

    const recordA=await catalog.enroll(peerRecord(a.identity,{peerId:"peer-a",nodeId:"worker-a",repository:"operator-a/state"}));
    const recordB=await catalog.enroll(peerRecord(b.identity,{peerId:"peer-b",nodeId:"worker-b",repository:"operator-b/state"}));
    await healthStore.recordSuccess("peer-b",{bindingHash:federationPeerBindingHash(recordB),now:NOW});

    let forwardedA=0,forwardedB=0;
    const signers=new Map([["peer-a",a],["peer-b",b]]);
    const records=new Map([["peer-a",recordA],["peer-b",recordB]]);
    const runtime=await assembleFederationRuntime({
      relayNodeId:"relay-a",
      catalog,
      healthStore,
      trustStore,
      peerConfigs:[
        {peerId:"peer-a",credentialRef:"vault://github/peer-a"},
        {peerId:"peer-b",credentialRef:"vault://github/peer-b"}
      ],
      mailboxFactory:async({peerId})=>trustedMailbox({
        record:records.get(peerId),
        signer:signers.get(peerId),
        trustStore,
        onForward:async envelope=>{
          if(peerId==="peer-a")forwardedA+=1;
          else forwardedB+=1;
          return {peerId,envelope};
        }
      }),
      now:()=>NOW,
      receiptSigner:relaySigner,
      requireSignedReceipts:true
    });

    const snapshot=runtime.snapshot();
    assert.equal(snapshot.assembledAt,NOW.toISOString());
    assert.equal(snapshot.configuredPeerCount,2);
    assert.equal(snapshot.resolvedPeerCount,2);
    assert.equal(snapshot.unavailablePeerCount,0);
    assert.equal(JSON.stringify(snapshot).includes("vault://"),false);

    const envelope=createMeshEnvelope(job("select"),{
      originNode:"bridge-a",
      requiredCapabilities:["reasoning"],
      ttlMs:60_000,
      now:NOW
    });
    const result=await runtime.forward(envelope);
    assert.equal(result.peerId,"peer-b");
    assert.equal(forwardedB,1);
    assert.equal(forwardedA,0);
    assert.equal(result.envelope.receipts[0].nextNode,"worker-b");
  });
});

test("cooldown skips credential/mailbox resolution before any secret boundary is touched",async()=>{
  await withStores(async({catalog,healthStore})=>{
    const relaySigner=generateMeshNodeIdentity("relay-a");
    const worker=generateMeshNodeIdentity("worker-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(relaySigner.identity);
    trustStore.trust(worker.identity);
    const record=await catalog.enroll(peerRecord(worker.identity,{peerId:"peer-a",nodeId:"worker-a",repository:"operator-a/state"}));
    const bindingHash=federationPeerBindingHash(record);
    await healthStore.recordFailure("peer-a",{bindingHash,category:"unavailable",now:NOW});
    await healthStore.recordFailure("peer-a",{bindingHash,category:"unavailable",now:new Date(NOW.getTime()+1)});

    let mailboxCalls=0;
    const runtime=await assembleFederationRuntime({
      relayNodeId:"relay-a",
      catalog,
      healthStore,
      trustStore,
      peerConfigs:[{peerId:"peer-a",credentialRef:"vault://github/peer-a"}],
      mailboxFactory:async()=>{mailboxCalls+=1;throw new Error("must not be called")},
      now:()=>new Date(NOW.getTime()+2),
      receiptSigner:relaySigner
    });

    assert.equal(mailboxCalls,0);
    assert.equal(runtime.snapshot().resolvedPeerCount,0);
    assert.equal(runtime.snapshot().unavailablePeers[0].category,"cooldown");
  });
});

test("operationally unavailable peer is omitted while another explicit trusted peer remains usable",async()=>{
  await withStores(async({catalog,healthStore})=>{
    const relaySigner=generateMeshNodeIdentity("relay-a");
    const a=generateMeshNodeIdentity("worker-a");
    const b=generateMeshNodeIdentity("worker-b");
    const trustStore=new MeshIdentityTrustStore();
    for(const identity of [relaySigner.identity,a.identity,b.identity])trustStore.trust(identity);
    const recordA=await catalog.enroll(peerRecord(a.identity,{peerId:"peer-a",nodeId:"worker-a",repository:"operator-a/state"}));
    const recordB=await catalog.enroll(peerRecord(b.identity,{peerId:"peer-b",nodeId:"worker-b",repository:"operator-b/state"}));

    const runtime=await assembleFederationRuntime({
      relayNodeId:"relay-a",
      catalog,
      healthStore,
      trustStore,
      peerConfigs:[
        {peerId:"peer-a",credentialRef:"vault://github/peer-a"},
        {peerId:"peer-b",credentialRef:"vault://github/peer-b"}
      ],
      mailboxFactory:async({peerId})=>peerId==="peer-a"
        ?trustedMailbox({record:recordA,signer:a,trustStore,available:false})
        :trustedMailbox({record:recordB,signer:b,trustStore}),
      now:()=>NOW,
      receiptSigner:relaySigner
    });

    const snapshot=runtime.snapshot();
    assert.equal(snapshot.resolvedPeerCount,1);
    assert.equal(snapshot.resolvedPeers[0].peerId,"peer-b");
    assert.equal(snapshot.unavailablePeerCount,1);
    assert.equal(snapshot.unavailablePeers[0].peerId,"peer-a");
    assert.equal(snapshot.unavailablePeers[0].category,"unavailable");
  });
});

test("cryptographic trust rejection aborts assembly instead of being treated as availability",async()=>{
  await withStores(async({catalog,healthStore})=>{
    const relaySigner=generateMeshNodeIdentity("relay-a");
    const expected=generateMeshNodeIdentity("worker-a");
    const impostor=generateMeshNodeIdentity("worker-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(relaySigner.identity);
    trustStore.trust(expected.identity);
    const record=await catalog.enroll(peerRecord(expected.identity,{peerId:"peer-a",nodeId:"worker-a",repository:"operator-a/state"}));

    await assert.rejects(()=>assembleFederationRuntime({
      relayNodeId:"relay-a",
      catalog,
      healthStore,
      trustStore,
      peerConfigs:[{peerId:"peer-a",credentialRef:"vault://github/peer-a"}],
      mailboxFactory:async()=>trustedMailbox({
        record,signer:impostor,trustStore,identityTrusted:false
      }),
      now:()=>NOW,
      receiptSigner:relaySigner
    }),/untrusted federated peer identity/);
  });
});

test("runtime aborts if the durable catalog record changes during assembly",async()=>{
  await withStores(async({catalog,healthStore})=>{
    const relaySigner=generateMeshNodeIdentity("relay-a");
    const worker=generateMeshNodeIdentity("worker-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(relaySigner.identity);
    trustStore.trust(worker.identity);
    const record=await catalog.enroll(peerRecord(worker.identity,{peerId:"peer-a",nodeId:"worker-a",repository:"operator-a/state"}));

    const changingCatalog={
      get:(...args)=>catalog.get(...args),
      resolve:async(...args)=>{
        const peer=await catalog.resolve(...args);
        await catalog.disable("peer-a",{now:new Date(NOW.getTime()+1)});
        return peer;
      }
    };

    await assert.rejects(()=>assembleFederationRuntime({
      relayNodeId:"relay-a",
      catalog:changingCatalog,
      healthStore,
      trustStore,
      peerConfigs:[{peerId:"peer-a",credentialRef:"vault://github/peer-a"}],
      mailboxFactory:async()=>trustedMailbox({record,signer:worker,trustStore}),
      now:()=>NOW,
      receiptSigner:relaySigner
    }),/catalog changed during assembly/);
  });
});

test("runtime rejects raw credential material and duplicate peer configuration",async()=>{
  await withStores(async({catalog,healthStore})=>{
    const relaySigner=generateMeshNodeIdentity("relay-a");
    const worker=generateMeshNodeIdentity("worker-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(relaySigner.identity);
    trustStore.trust(worker.identity);
    await catalog.enroll(peerRecord(worker.identity,{peerId:"peer-a",nodeId:"worker-a",repository:"operator-a/state"}));

    await assert.rejects(()=>assembleFederationRuntime({
      relayNodeId:"relay-a",catalog,healthStore,trustStore,
      peerConfigs:[{peerId:"peer-a",credentialRef:"ghp_RAW_SECRET"}],
      mailboxFactory:async()=>null,now:()=>NOW,receiptSigner:relaySigner
    }),/requires vault:\/\/ credentialRef/);

    await assert.rejects(()=>assembleFederationRuntime({
      relayNodeId:"relay-a",catalog,healthStore,trustStore,
      peerConfigs:[
        {peerId:"peer-a",credentialRef:"vault://github/a"},
        {peerId:"peer-a",credentialRef:"vault://github/b"}
      ],
      mailboxFactory:async()=>null,now:()=>NOW,receiptSigner:relaySigner
    }),/duplicate federation runtime peerId/);
  });
});

test("strict runtime requires a receipt signer for the local relay identity",async()=>{
  await withStores(async({catalog,healthStore})=>{
    const worker=generateMeshNodeIdentity("worker-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(worker.identity);
    await catalog.enroll(peerRecord(worker.identity,{peerId:"peer-a",nodeId:"worker-a",repository:"operator-a/state"}));
    await assert.rejects(()=>assembleFederationRuntime({
      relayNodeId:"relay-a",catalog,healthStore,trustStore,
      peerConfigs:[{peerId:"peer-a",credentialRef:"vault://github/a"}],
      mailboxFactory:async()=>null,
      now:()=>NOW
    }),/requires relay receipt signer/);
  });
});

test("brokered GitHub mailbox factory delegates Authorization injection to credential broker",async()=>{
  const seen=[];
  const response=(status,body)=>({
    ok:status>=200&&status<300,
    status,
    statusText:String(status),
    async text(){return body==null?"":JSON.stringify(body)}
  });
  const credentialBroker={
    async authorizedFetch({auth,url,init}){
      seen.push({credentialRef:auth.credentialRef,originalAuthorization:init.headers.Authorization});
      const headers={...init.headers,Authorization:"Bearer REAL-SECRET"};
      assert.equal(headers.Authorization,"Bearer REAL-SECRET");
      return response(404,{message:"Not Found"});
    }
  };
  const trustStore=new MeshIdentityTrustStore();
  const factory=createBrokeredGitHubMeshMailboxFactory({credentialBroker});
  const mailbox=await factory({
    credentialRef:"vault://github/peer-a",
    transport:{kind:"github-mailbox",repository:"operator-a/state",ref:"arca-runtime",root:"remote-mesh"},
    trustStore
  });
  const nodes=await mailbox.listNodes({now:NOW});
  assert.deepEqual(nodes,[]);
  assert.equal(seen.length,1);
  assert.equal(seen[0].credentialRef,"vault://github/peer-a");
  assert.equal(seen[0].originalAuthorization,"Bearer arca-credential-broker-managed");
  assert.equal(JSON.stringify(mailbox).includes("REAL-SECRET"),false);
});
