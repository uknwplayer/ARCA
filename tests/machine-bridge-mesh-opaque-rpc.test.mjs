import test from "node:test";
import assert from "node:assert/strict";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  MeshEncryptedEnvelopeReplayGuard,
  generateMeshEncryptionRecipient
} from "../src/machine-bridge/mesh-encrypted-envelope.mjs";
import {
  ARCA_OPAQUE_MESH_RPC_CALL_FORMAT,
  MachineBridgeOpaqueRpcClient,
  MachineBridgeOpaqueRpcEndpoint,
  MachineBridgeOpaqueRpcRelay,
  createOpaqueMeshRpcRequest,
  verifyOpaqueMeshRpcRequest,
  verifyOpaqueMeshRpcResult
} from "../src/machine-bridge/mesh-opaque-rpc.mjs";

const T1=new Date("2026-09-17T23:45:00.000Z");
const fixedNow=()=>new Date(T1);

function identityBundle(nodeId,trustStore){
  const signer=generateMeshNodeIdentity(nodeId);
  trustStore.trust(signer.identity);
  const encryption=generateMeshEncryptionRecipient(signer,{
    issuedAt:T1,
    ttlMs:10*60*1000,
    nonce:(nodeId.replace(/[^A-Za-z0-9]/g,"")+"0000000000000000").slice(0,24)
  });
  return {
    signer,
    identity:signer.identity,
    signingPrivateKey:signer.privateKey,
    recipient:encryption.recipient,
    recipientPrivateKey:encryption.privateKey
  };
}

function setupMesh(){
  const trustStore=new MeshIdentityTrustStore();
  const origin=identityBundle("origin-a",trustStore);
  const relayAIdentity=generateMeshNodeIdentity("relay-a");
  const relayBIdentity=generateMeshNodeIdentity("relay-b");
  trustStore.trust(relayAIdentity.identity);
  trustStore.trust(relayBIdentity.identity);
  const endpointIdentity=identityBundle("reasoner-b",trustStore);
  return {trustStore,origin,relayAIdentity,relayBIdentity,endpointIdentity};
}

test("opaque request packet contains ciphertext and public metadata but no private plaintext",()=>{
  const {trustStore,origin,endpointIdentity}=setupMesh();
  const packet=createOpaqueMeshRpcRequest({
    instruction:"private instruction alpha",
    context:{personName:"Example Person",privateNote:"relay must never read this"}
  },{
    requestId:"req.opaque.1",
    payloadId:"payload.opaque.1",
    originNode:"origin-a",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    trustStore,
    now:T1,
    ttlMs:60_000,
    clockSkewMs:0
  });
  assert.equal(verifyOpaqueMeshRpcRequest(packet,{trustStore,now:T1,clockSkewMs:0}),true);
  const serialized=JSON.stringify(packet);
  assert.equal(serialized.includes("private instruction alpha"),false);
  assert.equal(serialized.includes("Example Person"),false);
  assert.equal(serialized.includes("relay must never read this"),false);
  assert.equal(packet.targetNode,"reasoner-b");
  assert.equal(packet.requestEnvelope.recipientNode,"reasoner-b");
});

test("strict multi-hop opaque RPC encrypts request and response while preserving signed routes",async()=>{
  const {trustStore,origin,relayAIdentity,relayBIdentity,endpointIdentity}=setupMesh();
  const transit=[];
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    requestReplayGuard:new MeshEncryptedEnvelopeReplayGuard({maxEntries:100}),
    now:fixedNow,
    handler:async(payload,context)=>{
      assert.equal(payload.instruction,"analyze private case");
      assert.equal(payload.context.personName,"Example Person");
      assert.equal(context.requestId,"req.opaque.multi.1");
      return {
        answer:"private reasoning result",
        finding:{summary:"confidential output beta"}
      };
    }
  });

  const endpointPeer=endpoint.advertise();
  const relayB=new MachineBridgeOpaqueRpcRelay({
    nodeId:"relay-b",
    receiptSigner:relayBIdentity,
    requireSignedReceipts:true,
    trustStore,
    now:fixedNow,
    peers:[{
      ...endpointPeer,
      forward:async packet=>{
        transit.push({stage:"endpoint-in",json:JSON.stringify(packet)});
        const result=await endpointPeer.forward(packet);
        transit.push({stage:"endpoint-out",json:JSON.stringify(result)});
        return result;
      }
    }]
  });
  const relayBPeer=relayB.advertise();
  const relayA=new MachineBridgeOpaqueRpcRelay({
    nodeId:"relay-a",
    receiptSigner:relayAIdentity,
    requireSignedReceipts:true,
    trustStore,
    now:fixedNow,
    peers:[{
      ...relayBPeer,
      forward:async packet=>{
        transit.push({stage:"relay-b-in",json:JSON.stringify(packet)});
        const result=await relayBPeer.forward(packet);
        transit.push({stage:"relay-b-out",json:JSON.stringify(result)});
        return result;
      }
    }]
  });

  const client=new MachineBridgeOpaqueRpcClient({
    originNode:"origin-a",
    entry:relayA,
    replyRecipient:origin.recipient,
    replyPrivateKey:origin.recipientPrivateKey,
    trustStore,
    requireSignedReceipts:true,
    responseReplayGuard:new MeshEncryptedEnvelopeReplayGuard({maxEntries:100}),
    now:fixedNow
  });

  const result=await client.call({
    instruction:"analyze private case",
    context:{personName:"Example Person",privateNote:"request secret gamma"}
  },{
    requestId:"req.opaque.multi.1",
    payloadId:"payload.opaque.multi.1",
    recipient:endpointIdentity.recipient,
    requiredCapabilities:["reasoning"],
    maxHops:5,
    ttlMs:60_000
  });

  assert.equal(result.format,ARCA_OPAQUE_MESH_RPC_CALL_FORMAT);
  assert.equal(result.requestId,"req.opaque.multi.1");
  assert.deepEqual(result.route,["relay-a","relay-b","reasoner-b"]);
  assert.deepEqual(result.replyRoute,["reasoner-b","relay-b","relay-a"]);
  assert.equal(result.output.answer,"private reasoning result");
  assert.equal(result.output.finding.summary,"confidential output beta");
  assert.match(result.requestEnvelopeHash,/^[a-f0-9]{64}$/);
  assert.match(result.responseEnvelopeHash,/^[a-f0-9]{64}$/);

  for(const item of transit){
    assert.equal(item.json.includes("analyze private case"),false,item.stage+" leaked request instruction");
    assert.equal(item.json.includes("Example Person"),false,item.stage+" leaked personal context");
    assert.equal(item.json.includes("request secret gamma"),false,item.stage+" leaked request note");
    assert.equal(item.json.includes("private reasoning result"),false,item.stage+" leaked response");
    assert.equal(item.json.includes("confidential output beta"),false,item.stage+" leaked response finding");
  }
});

test("endpoint replay guard rejects the same encrypted request after successful execution",async()=>{
  const {trustStore,origin,endpointIdentity}=setupMesh();
  let calls=0;
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    requestReplayGuard:new MeshEncryptedEnvelopeReplayGuard({maxEntries:100}),
    now:fixedNow,
    handler:async()=>{calls+=1;return {ok:true}}
  });
  const packet=createOpaqueMeshRpcRequest({instruction:"once"},{
    requestId:"req.opaque.replay.1",
    payloadId:"payload.opaque.replay.1",
    originNode:"origin-a",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    maxHops:2,
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const first=await endpoint.forward(packet);
  assert.equal(verifyOpaqueMeshRpcResult(first,{
    requestPacket:packet,
    trustStore,
    requireSignedReceipts:true,
    now:T1,
    clockSkewMs:0
  }),true);
  assert.equal(calls,1);
  await assert.rejects(()=>endpoint.forward(packet),/replay detected/);
  assert.equal(calls,1);
});

test("opaque relay fails closed when no reachable peer satisfies required capability",async()=>{
  const {trustStore,origin,relayAIdentity,endpointIdentity}=setupMesh();
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["document.read"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    receiptSigner:endpointIdentity.signer,
    requireSignedReceipts:true,
    trustStore,
    now:fixedNow,
    handler:async()=>({ok:true})
  });
  const relay=new MachineBridgeOpaqueRpcRelay({
    nodeId:"relay-a",
    receiptSigner:relayAIdentity,
    requireSignedReceipts:true,
    trustStore,
    now:fixedNow,
    peers:[endpoint.advertise()]
  });
  const client=new MachineBridgeOpaqueRpcClient({
    originNode:"origin-a",
    entry:relay,
    replyRecipient:origin.recipient,
    replyPrivateKey:origin.recipientPrivateKey,
    trustStore,
    requireSignedReceipts:true,
    now:fixedNow
  });
  await assert.rejects(()=>client.call({instruction:"need reasoning"},{
    requestId:"req.opaque.no-route.1",
    payloadId:"payload.opaque.no-route.1",
    recipient:endpointIdentity.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:60_000
  }),/no route/);
});

test("wrong origin reply private key cannot decrypt a valid opaque RPC response",async()=>{
  const {trustStore,origin,endpointIdentity}=setupMesh();
  const wrongOrigin=generateMeshNodeIdentity("wrong-origin");
  const wrongReply=generateMeshEncryptionRecipient(wrongOrigin,{
    issuedAt:T1,
    ttlMs:10*60*1000,
    nonce:"wrongoriginnonce000000001"
  });
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    trustStore,
    now:fixedNow,
    handler:async()=>({answer:"encrypted"})
  });
  const client=new MachineBridgeOpaqueRpcClient({
    originNode:"origin-a",
    entry:endpoint,
    replyRecipient:origin.recipient,
    replyPrivateKey:wrongReply.privateKey,
    trustStore,
    now:fixedNow
  });
  await assert.rejects(()=>client.call({instruction:"x"},{
    requestId:"req.opaque.wrong-reply.1",
    payloadId:"payload.opaque.wrong-reply.1",
    recipient:endpointIdentity.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:60_000
  }),/does not match recipient/);
});

test("request packet tampering fails before any endpoint handler is called",async()=>{
  const {trustStore,origin,endpointIdentity}=setupMesh();
  let calls=0;
  const endpoint=new MachineBridgeOpaqueRpcEndpoint({
    nodeId:"reasoner-b",
    capabilities:["reasoning"],
    recipient:endpointIdentity.recipient,
    recipientPrivateKey:endpointIdentity.recipientPrivateKey,
    trustStore,
    now:fixedNow,
    handler:async()=>{calls+=1;return {ok:true}}
  });
  const packet=createOpaqueMeshRpcRequest({instruction:"private"},{
    requestId:"req.opaque.tamper.1",
    payloadId:"payload.opaque.tamper.1",
    originNode:"origin-a",
    recipient:endpointIdentity.recipient,
    replyRecipient:origin.recipient,
    requiredCapabilities:["reasoning"],
    ttlMs:60_000,
    trustStore,
    now:T1,
    clockSkewMs:0
  });
  const tampered={...packet,requiredCapabilities:["reasoning","repository"]};
  await assert.rejects(()=>endpoint.forward(tampered),/packet hash mismatch/);
  assert.equal(calls,0);
});
