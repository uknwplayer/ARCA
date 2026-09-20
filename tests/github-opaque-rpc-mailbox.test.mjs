import test from "node:test";
import assert from "node:assert/strict";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  MeshEncryptedEnvelopeReplayGuard,
  decryptMeshPayload,
  generateMeshEncryptionRecipient
} from "../src/machine-bridge/mesh-encrypted-envelope.mjs";
import {
  MachineBridgeOpaqueRpcEndpoint,
  createOpaqueMeshRpcRequest
} from "../src/machine-bridge/mesh-opaque-rpc.mjs";
import {GitHubOpaqueRpcMailboxTransport} from "../src/machine-bridge/github-opaque-rpc-mailbox.mjs";

const T1=new Date("2026-09-17T23:55:00.000Z");

function makeApi(){
  const store=new Map();let seq=0;const dispatches=[];
  const response=(status,body)=>({
    ok:status>=200&&status<300,
    status,
    statusText:String(status),
    async text(){return body==null?"":JSON.stringify(body)}
  });
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches")){
      dispatches.push(JSON.parse(options.body));
      return response(204,null);
    }
    const marker="/contents/";const index=u.pathname.indexOf(marker);
    if(index<0)return response(404,{message:"Not Found"});
    const raw=u.pathname.slice(index+marker.length);
    const path=raw.split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const text=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text,sha:"sha-"+(++seq)});
      return response(201,{content:{path,sha:store.get(path).sha}});
    }
    const file=store.get(path);
    if(file)return response(200,{
      type:"file",
      name:path.split("/").at(-1),
      path,
      sha:file.sha,
      content:Buffer.from(file.text).toString("base64")
    });
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
  return {store,dispatches,fetchImpl};
}

function bundle(nodeId,trustStore,nonce){
  const signer=generateMeshNodeIdentity(nodeId);
  trustStore.trust(signer.identity);
  const encryption=generateMeshEncryptionRecipient(signer,{
    issuedAt:T1,
    ttlMs:10*60*1000,
    nonce
  });
  return {
    signer,
    recipient:encryption.recipient,
    recipientPrivateKey:encryption.privateKey
  };
}

function mailbox(api,trustStore){
  return new GitHubOpaqueRpcMailboxTransport({
    repository:"owner/repo",
    ref:"main",
    token:"secret-token",
    fetchImpl:api.fetchImpl,
    trustStore,
    requireSignedReceipts:true,
    clockSkewMs:0
  });
}

test("GitHub opaque RPC mailbox defaults encrypted state away from source main",()=>{
  const api=makeApi();
  const transport=new GitHubOpaqueRpcMailboxTransport({repository:"owner/repo",token:"secret-token",fetchImpl:api.fetchImpl});
  assert.equal(transport.ref,"arca-runtime");
});

test("durable opaque mailbox survives transport restart while Git state contains ciphertext only",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=bundle("origin-a",trustStore,"originreplynonce00000001");
  const endpointBundle=bundle("reasoner-b",trustStore,"endpointkeynonce00000001");

  const requestPacket=createOpaqueMeshRpcRequest({
    instruction:"private durable instruction",
    context:{personName:"Example Person",privateNote:"do not persist plaintext"}
  },{
    requestId:"req.durable.opaque.1",
    payloadId:"payload.durable.opaque.1",
    originNode:"origin-a",
    recipient:endpointBundle.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    maxHops:3,
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });

  const first=mailbox(api,trustStore);
  assert.equal(await first.enqueueRequest("reasoner-b",requestPacket,{now:T1}),true);
  assert.equal(await first.enqueueRequest("reasoner-b",requestPacket,{now:T1}),false);
  assert.equal(api.dispatches.length,1);
  assert.equal(api.dispatches[0].event_type,"arca_opaque_rpc_available");
  assert.equal(api.dispatches[0].client_payload.node_id,"reasoner-b");

  const persistedAfterRequest=[...api.store.values()].map(value=>value.text).join("\n");
  assert.equal(persistedAfterRequest.includes("private durable instruction"),false);
  assert.equal(persistedAfterRequest.includes("Example Person"),false);
  assert.equal(persistedAfterRequest.includes("do not persist plaintext"),false);

  // Simulate a new process reading the same Git-backed mailbox.
  const second=mailbox(api,trustStore);
  const queued=await second.listRequests("reasoner-b",{now:T1});
  assert.equal(queued.length,1);
  assert.equal(queued[0].packet.requestId,"req.durable.opaque.1");

  const claim=await second.claimRequest("reasoner-b",queued[0].packet,"processor-a",{
    leaseMs:10_000,
    now:T1
  });
  assert.equal(claim.attempt,1);
  assert.equal(await second.claimRequest("reasoner-b",queued[0].packet,"processor-b",{
    leaseMs:10_000,
    now:new Date("2026-09-17T23:55:05.000Z")
  }),null);

  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointBundle.recipient,
    recipientPrivateKey:endpointBundle.recipientPrivateKey,
    receiptSigner:endpointBundle.signer,
    requireSignedReceipts:true,
    trustStore,
    requestReplayGuard:new MeshEncryptedEnvelopeReplayGuard({maxEntries:100}),
    now:()=>new Date(T1),
    handler:async payload=>{
      assert.equal(payload.context.personName,"Example Person");
      return {
        answer:"private durable response",
        detail:"result must also remain ciphertext in Git"
      };
    }
  });

  const result=await endpoint.forward(queued[0].packet);
  assert.equal(await second.writeResult(queued[0].packet,result,{now:T1}),true);
  assert.equal(await second.writeResult(queued[0].packet,result,{now:T1}),false);

  const persistedAfterResult=[...api.store.values()].map(value=>value.text).join("\n");
  assert.equal(persistedAfterResult.includes("private durable instruction"),false);
  assert.equal(persistedAfterResult.includes("Example Person"),false);
  assert.equal(persistedAfterResult.includes("do not persist plaintext"),false);
  assert.equal(persistedAfterResult.includes("private durable response"),false);
  assert.equal(persistedAfterResult.includes("result must also remain ciphertext in Git"),false);

  // Simulate origin restart and terminal-result recovery.
  const third=mailbox(api,trustStore);
  const loaded=await third.getResult("req.durable.opaque.1");
  assert.equal(loaded.result.requestId,"req.durable.opaque.1");
  assert.equal(loaded.wrapper.requestPacketHash,requestPacket.packetHash);

  const opened=decryptMeshPayload(loaded.result.responseEnvelope,{
    recipient:origin.recipient,
    recipientPrivateKey:origin.recipientPrivateKey,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  assert.equal(opened.payload.answer,"private durable response");
  assert.equal(opened.payload.detail,"result must also remain ciphertext in Git");
});

test("opaque mailbox claim can be reacquired after lease expiry",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=bundle("origin-a",trustStore,"originreplynonce00000002");
  const endpointBundle=bundle("reasoner-b",trustStore,"endpointkeynonce00000002");
  const packet=createOpaqueMeshRpcRequest({instruction:"lease"},{
    requestId:"req.durable.claim.1",
    payloadId:"payload.durable.claim.1",
    originNode:"origin-a",
    recipient:endpointBundle.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const box=mailbox(api,trustStore);
  await box.enqueueRequest("reasoner-b",packet,{notify:false,now:T1});
  const first=await box.claimRequest("reasoner-b",packet,"processor-a",{leaseMs:5000,now:T1});
  assert.equal(first.attempt,1);
  const second=await box.claimRequest("reasoner-b",packet,"processor-b",{
    leaseMs:5000,
    now:new Date("2026-09-17T23:55:06.000Z")
  });
  assert.equal(second.attempt,2);
  assert.equal(second.processorId,"processor-b");
});

test("tampering with stored terminal ciphertext is detected on recovery",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=bundle("origin-a",trustStore,"originreplynonce00000003");
  const endpointBundle=bundle("reasoner-b",trustStore,"endpointkeynonce00000003");
  const packet=createOpaqueMeshRpcRequest({instruction:"tamper-check"},{
    requestId:"req.durable.tamper.1",
    payloadId:"payload.durable.tamper.1",
    originNode:"origin-a",
    recipient:endpointBundle.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointBundle.recipient,
    recipientPrivateKey:endpointBundle.recipientPrivateKey,
    receiptSigner:endpointBundle.signer,
    requireSignedReceipts:true,
    trustStore,
    now:()=>new Date(T1),
    handler:async()=>({answer:"encrypted-only"})
  });
  const result=await endpoint.forward(packet);
  const box=mailbox(api,trustStore);
  await box.writeResult(packet,result,{now:T1});

  const path="remote-opaque-rpc/results/req.durable.tamper.1.json";
  const current=api.store.get(path);
  const wrapper=JSON.parse(current.text);
  const bytes=Buffer.from(wrapper.result.responseEnvelope.ciphertext,"base64url");
  bytes[0]^=1;
  wrapper.result.responseEnvelope.ciphertext=bytes.toString("base64url");
  api.store.set(path,{...current,text:JSON.stringify(wrapper)});

  await assert.rejects(()=>box.getResult("req.durable.tamper.1"),/ciphertext hash mismatch|envelope hash mismatch|terminal result hash mismatch|wrapper hash mismatch/);
});

test("expired queued opaque requests are excluded from active listing",async()=>{
  const api=makeApi();
  const trustStore=new MeshIdentityTrustStore();
  const origin=bundle("origin-a",trustStore,"originreplynonce00000004");
  const endpointBundle=bundle("reasoner-b",trustStore,"endpointkeynonce00000004");
  const packet=createOpaqueMeshRpcRequest({instruction:"short"},{
    requestId:"req.durable.expired.1",
    payloadId:"payload.durable.expired.1",
    originNode:"origin-a",
    recipient:endpointBundle.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:5000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const box=mailbox(api,trustStore);
  await box.enqueueRequest("reasoner-b",packet,{notify:false,now:T1});
  const active=await box.listRequests("reasoner-b",{
    now:new Date("2026-09-17T23:55:06.000Z")
  });
  assert.deepEqual(active,[]);
});
