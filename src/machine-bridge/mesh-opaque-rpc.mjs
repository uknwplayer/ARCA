import {createHash} from "node:crypto";
import {
  decryptMeshPayload,
  encryptMeshPayload,
  verifyMeshEncryptedEnvelope,
  verifyMeshEncryptionRecipient
} from "./mesh-encrypted-envelope.mjs";
import {
  MESH_RECEIPT_DOMAIN,
  signMeshReceipt,
  verifySignedMeshReceipt
} from "./mesh-identity.mjs";

export const ARCA_OPAQUE_MESH_RPC_REQUEST_FORMAT="arca-mesh-opaque-rpc-request-v1";
export const ARCA_OPAQUE_MESH_RPC_RESULT_FORMAT="arca-mesh-opaque-rpc-result-v1";
export const ARCA_OPAQUE_MESH_RPC_CALL_FORMAT="arca-mesh-opaque-rpc-call-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const MAX_HOPS=16;
const MAX_TTL_MS=15*60*1000;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);
    return out;
  }
  return value;
}
function stable(value){return JSON.stringify(canonicalize(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function normalizeCapabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("opaque RPC capabilities must be an array");
  const out=[...new Set(values.map(String).map(value=>value.trim()).filter(Boolean))].sort();
  if(out.some(value=>value.length>160))throw new Error("opaque RPC capability too long");
  return out;
}
function hasAll(have,need){const set=new Set(have);return need.every(value=>set.has(value))}
function dateMs(value,label){const ms=Date.parse(value);if(!Number.isFinite(ms))throw new Error("invalid "+label);return ms}
function immutableRequestBody(packet){
  return {
    format:packet.format,
    version:packet.version,
    requestId:packet.requestId,
    payloadId:packet.payloadId,
    originNode:packet.originNode,
    targetNode:packet.targetNode,
    requiredCapabilities:packet.requiredCapabilities,
    maxHops:packet.maxHops,
    createdAt:packet.createdAt,
    expiresAt:packet.expiresAt,
    requestEnvelopeHash:packet.requestEnvelope?.envelopeHash,
    recipientStatementHash:packet.recipient?.statementHash,
    replyRecipientStatementHash:packet.replyRecipient?.statementHash
  };
}
function receiptBody({direction,nodeId,nextNode,hop,requestId,payloadId,forwardedAt,previousHash}){
  return {direction,nodeId,nextNode,hop,requestId,payloadId,forwardedAt,previousHash};
}
function receiptPayload(receipt){
  return {...receiptBody(receipt),receiptHash:receipt.receiptHash};
}
function verifyReceipt(receipt,{direction,requestId,payloadId,previousHash,expectedHop,requireSignedReceipts=false,trustStore=null}={}){
  if(!plain(receipt))throw new Error("invalid opaque RPC receipt");
  if(receipt.direction!==direction||receipt.requestId!==requestId||receipt.payloadId!==payloadId)throw new Error("opaque RPC receipt correlation mismatch");
  safeId(receipt.nodeId,"opaque RPC receipt nodeId");
  safeId(receipt.nextNode,"opaque RPC receipt nextNode");
  if(receipt.hop!==expectedHop||receipt.previousHash!==previousHash)throw new Error("opaque RPC receipt chain mismatch");
  dateMs(receipt.forwardedAt,"opaque RPC receipt forwardedAt");
  if(receipt.receiptHash!==sha256(receiptBody(receipt)))throw new Error("opaque RPC receipt hash mismatch");
  if(!receipt.signedReceipt){
    if(requireSignedReceipts)throw new Error("opaque RPC signed receipt required");
    return true;
  }
  verifySignedMeshReceipt(receipt.signedReceipt,{now:new Date(receipt.forwardedAt),clockSkewMs:0});
  if(stable(receipt.signedReceipt.payload)!==stable(receiptPayload(receipt)))throw new Error("opaque RPC signed receipt payload mismatch");
  if(trustStore){
    trustStore.verify(receipt.signedReceipt,{
      expectedDomain:MESH_RECEIPT_DOMAIN,
      expectedNodeId:receipt.nodeId,
      now:new Date(receipt.forwardedAt),
      clockSkewMs:0
    });
  }
  return true;
}
function appendReceipt(collection,{direction,nodeId,nextNode,requestId,payloadId,now,baseHash,signer,expiresAt}){
  const previousHash=collection.at(-1)?.receiptHash||baseHash;
  const body=receiptBody({
    direction,
    nodeId,
    nextNode,
    hop:collection.length+1,
    requestId,
    payloadId,
    forwardedAt:new Date(now).toISOString(),
    previousHash
  });
  let receipt={...body,receiptHash:sha256(body)};
  if(signer){
    const remaining=Math.max(1000,Math.min(MAX_TTL_MS,dateMs(expiresAt,"opaque RPC expiresAt")-new Date(now).getTime()));
    receipt={...receipt,signedReceipt:signMeshReceipt(receipt,signer,{issuedAt:new Date(now),ttlMs:remaining})};
  }
  return receipt;
}
function resultHashBody(value){
  return {
    format:value.format,
    version:value.version,
    requestId:value.requestId,
    payloadId:value.payloadId,
    responsePayloadId:value.responsePayloadId,
    endpointNode:value.endpointNode,
    route:value.route,
    replyRoute:value.replyRoute,
    receipts:value.receipts,
    replyReceipts:value.replyReceipts,
    responseEnvelope:value.responseEnvelope
  };
}
function normalizePeer(peer){
  if(!plain(peer))throw new TypeError("invalid opaque RPC peer");
  safeId(peer.nodeId,"opaque RPC peer nodeId");
  if(typeof peer.forward!=="function")throw new TypeError("opaque RPC peer forward required");
  return {
    nodeId:peer.nodeId,
    capabilities:normalizeCapabilities(peer.capabilities||[]),
    reachableCapabilities:normalizeCapabilities(peer.reachableCapabilities||peer.capabilities||[]),
    forward:peer.forward
  };
}

export function createOpaqueMeshRpcRequest(payload,{
  requestId,
  payloadId,
  originNode,
  recipient,
  replyRecipient,
  requiredCapabilities=[],
  maxHops=8,
  ttlMs=5*60*1000,
  trustStore=null,
  now=new Date(),
  clockSkewMs=60_000
}={}){
  safeId(requestId,"opaque RPC requestId");
  safeId(payloadId,"opaque RPC payloadId");
  safeId(originNode,"opaque RPC originNode");
  if(!Number.isSafeInteger(maxHops)||maxHops<1||maxHops>MAX_HOPS)throw new Error("invalid opaque RPC maxHops");
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>MAX_TTL_MS)throw new Error("invalid opaque RPC ttlMs");
  verifyMeshEncryptionRecipient(recipient,{trustStore,now,clockSkewMs});
  verifyMeshEncryptionRecipient(replyRecipient,{trustStore,now,clockSkewMs});
  if(replyRecipient.payload.nodeId!==originNode)throw new Error("opaque RPC reply recipient must belong to originNode");
  const requestEnvelope=encryptMeshPayload(payload,{
    requestId,
    payloadId,
    originNode,
    recipient,
    trustStore,
    now,
    ttlMs,
    clockSkewMs
  });
  const createdAt=new Date(now).toISOString();
  const packet={
    format:ARCA_OPAQUE_MESH_RPC_REQUEST_FORMAT,
    version:1,
    requestId,
    payloadId,
    originNode,
    targetNode:recipient.payload.nodeId,
    requiredCapabilities:normalizeCapabilities(requiredCapabilities),
    maxHops,
    createdAt,
    expiresAt:requestEnvelope.expiresAt,
    recipient,
    replyRecipient,
    requestEnvelope,
    route:[],
    receipts:[]
  };
  return Object.freeze({...packet,packetHash:sha256(immutableRequestBody(packet))});
}

export function verifyOpaqueMeshRpcRequest(packet,{
  trustStore=null,
  requireSignedReceipts=false,
  now=new Date(),
  clockSkewMs=60_000
}={}){
  if(!plain(packet)||packet.format!==ARCA_OPAQUE_MESH_RPC_REQUEST_FORMAT||packet.version!==1)throw new Error("invalid opaque RPC request");
  safeId(packet.requestId,"opaque RPC requestId");
  safeId(packet.payloadId,"opaque RPC payloadId");
  safeId(packet.originNode,"opaque RPC originNode");
  safeId(packet.targetNode,"opaque RPC targetNode");
  const capabilities=normalizeCapabilities(packet.requiredCapabilities);
  if(stable(capabilities)!==stable(packet.requiredCapabilities))throw new Error("opaque RPC capabilities not normalized");
  if(!Number.isSafeInteger(packet.maxHops)||packet.maxHops<1||packet.maxHops>MAX_HOPS)throw new Error("invalid opaque RPC maxHops");
  const createdMs=dateMs(packet.createdAt,"opaque RPC createdAt");
  const expiresMs=dateMs(packet.expiresAt,"opaque RPC expiresAt");
  if(expiresMs<=createdMs||expiresMs-createdMs>MAX_TTL_MS)throw new Error("invalid opaque RPC validity window");
  if(new Date(now).getTime()>=expiresMs+clockSkewMs)throw new Error("opaque RPC request expired");
  verifyMeshEncryptionRecipient(packet.recipient,{trustStore,now,clockSkewMs});
  verifyMeshEncryptionRecipient(packet.replyRecipient,{trustStore,now,clockSkewMs});
  if(packet.recipient.payload.nodeId!==packet.targetNode)throw new Error("opaque RPC target/recipient mismatch");
  if(packet.replyRecipient.payload.nodeId!==packet.originNode)throw new Error("opaque RPC origin/reply recipient mismatch");
  verifyMeshEncryptedEnvelope(packet.requestEnvelope,{recipient:packet.recipient,trustStore,now,clockSkewMs});
  if(packet.requestEnvelope.requestId!==packet.requestId||packet.requestEnvelope.payloadId!==packet.payloadId)throw new Error("opaque RPC encrypted request correlation mismatch");
  if(packet.requestEnvelope.originNode!==packet.originNode||packet.requestEnvelope.recipientNode!==packet.targetNode)throw new Error("opaque RPC encrypted request route mismatch");
  if(packet.requestEnvelope.expiresAt!==packet.expiresAt)throw new Error("opaque RPC envelope lifetime mismatch");
  if(packet.packetHash!==sha256(immutableRequestBody(packet)))throw new Error("opaque RPC packet hash mismatch");
  if(!Array.isArray(packet.route)||!Array.isArray(packet.receipts)||packet.route.length!==packet.receipts.length)throw new Error("invalid opaque RPC route");
  if(packet.route.length>packet.maxHops)throw new Error("opaque RPC max hops exceeded");
  let previousHash=packet.packetHash;
  for(let index=0;index<packet.receipts.length;index+=1){
    if(packet.route[index]!==packet.receipts[index].nodeId)throw new Error("opaque RPC forward route mismatch");
    verifyReceipt(packet.receipts[index],{
      direction:"forward",
      requestId:packet.requestId,
      payloadId:packet.payloadId,
      previousHash,
      expectedHop:index+1,
      requireSignedReceipts,
      trustStore
    });
    previousHash=packet.receipts[index].receiptHash;
  }
  return true;
}

export function verifyOpaqueMeshRpcResult(result,{
  requestPacket,
  trustStore=null,
  requireSignedReceipts=false,
  allowPartialReply=false,
  now=new Date(),
  clockSkewMs=60_000
}={}){
  if(!plain(result)||result.format!==ARCA_OPAQUE_MESH_RPC_RESULT_FORMAT||result.version!==1)throw new Error("invalid opaque RPC result");
  if(!requestPacket)throw new Error("opaque RPC requestPacket required for result verification");
  verifyOpaqueMeshRpcRequest(requestPacket,{trustStore,requireSignedReceipts,now,clockSkewMs});
  if(result.requestId!==requestPacket.requestId||result.payloadId!==requestPacket.payloadId)throw new Error("opaque RPC result correlation mismatch");
  safeId(result.responsePayloadId,"opaque RPC responsePayloadId");
  if(result.endpointNode!==requestPacket.targetNode)throw new Error("opaque RPC endpoint mismatch");
  if(!Array.isArray(result.route)||!Array.isArray(result.receipts)||result.route.length!==result.receipts.length)throw new Error("invalid opaque RPC result route");
  if(result.route.length<1||result.route.at(-1)!==result.endpointNode)throw new Error("opaque RPC endpoint route mismatch");
  let previousForward=requestPacket.packetHash;
  for(let index=0;index<result.receipts.length;index+=1){
    if(result.route[index]!==result.receipts[index].nodeId)throw new Error("opaque RPC result forward route mismatch");
    verifyReceipt(result.receipts[index],{
      direction:"forward",
      requestId:result.requestId,
      payloadId:result.payloadId,
      previousHash:previousForward,
      expectedHop:index+1,
      requireSignedReceipts,
      trustStore
    });
    previousForward=result.receipts[index].receiptHash;
  }
  verifyMeshEncryptedEnvelope(result.responseEnvelope,{
    recipient:requestPacket.replyRecipient,
    trustStore,
    now,
    clockSkewMs
  });
  if(result.responseEnvelope.requestId!==result.requestId||result.responseEnvelope.payloadId!==result.responsePayloadId)throw new Error("opaque RPC encrypted response correlation mismatch");
  if(result.responseEnvelope.originNode!==result.endpointNode||result.responseEnvelope.recipientNode!==requestPacket.originNode)throw new Error("opaque RPC encrypted response route mismatch");
  if(!Array.isArray(result.replyRoute)||!Array.isArray(result.replyReceipts)||result.replyRoute.length!==result.replyReceipts.length)throw new Error("invalid opaque RPC reply route");
  if(!allowPartialReply&&result.replyRoute.length!==result.route.length)throw new Error("opaque RPC incomplete reply route");
  if(result.replyRoute.length>result.route.length)throw new Error("opaque RPC reply route too long");
  const expectedReply=[...result.route].reverse().slice(0,result.replyRoute.length);
  if(stable(expectedReply)!==stable(result.replyRoute))throw new Error("opaque RPC reply route mismatch");
  let previousReply=result.responseEnvelope.envelopeHash;
  for(let index=0;index<result.replyReceipts.length;index+=1){
    if(result.replyRoute[index]!==result.replyReceipts[index].nodeId)throw new Error("opaque RPC reply receipt route mismatch");
    verifyReceipt(result.replyReceipts[index],{
      direction:"reply",
      requestId:result.requestId,
      payloadId:result.responsePayloadId,
      previousHash:previousReply,
      expectedHop:index+1,
      requireSignedReceipts,
      trustStore
    });
    previousReply=result.replyReceipts[index].receiptHash;
  }
  if(result.resultHash!==sha256(resultHashBody(result)))throw new Error("opaque RPC result hash mismatch");
  return true;
}

export function appendOpaqueRpcForwardHop(packet,{
  nodeId,
  nextNode,
  receiptSigner=null,
  trustStore=null,
  requireSignedReceipts=false,
  now=new Date()
}={}){
  safeId(nodeId,"opaque RPC forward nodeId");
  safeId(nextNode,"opaque RPC forward nextNode");
  verifyOpaqueMeshRpcRequest(packet,{trustStore,requireSignedReceipts,now});
  if(packet.route.includes(nodeId))throw new Error("opaque RPC loop detected at "+nodeId);
  if(packet.route.length>=packet.maxHops)throw new Error("opaque RPC max hops exceeded");
  const receipt=appendReceipt(packet.receipts,{
    direction:"forward",
    nodeId,
    nextNode,
    requestId:packet.requestId,
    payloadId:packet.payloadId,
    now,
    baseHash:packet.packetHash,
    signer:receiptSigner,
    expiresAt:packet.expiresAt
  });
  const routed={...packet,route:[...packet.route,nodeId],receipts:[...packet.receipts,receipt]};
  verifyOpaqueMeshRpcRequest(routed,{trustStore,requireSignedReceipts,now});
  return routed;
}

export function appendOpaqueRpcReplyHop(result,{
  requestPacket,
  nodeId,
  nextNode,
  receiptSigner=null,
  trustStore=null,
  requireSignedReceipts=false,
  now=new Date()
}={}){
  safeId(nodeId,"opaque RPC reply nodeId");
  safeId(nextNode,"opaque RPC reply nextNode");
  verifyOpaqueMeshRpcResult(result,{
    requestPacket,
    trustStore,
    requireSignedReceipts,
    allowPartialReply:true,
    now
  });
  const expectedNode=result.route.slice().reverse()[result.replyRoute.length];
  if(expectedNode!==nodeId)throw new Error("opaque RPC reply continuation node mismatch");
  const receipt=appendReceipt(result.replyReceipts,{
    direction:"reply",
    nodeId,
    nextNode,
    requestId:result.requestId,
    payloadId:result.responsePayloadId,
    now,
    baseHash:result.responseEnvelope.envelopeHash,
    signer:receiptSigner,
    expiresAt:result.responseEnvelope.expiresAt
  });
  const updated={
    ...result,
    replyRoute:[...result.replyRoute,nodeId],
    replyReceipts:[...result.replyReceipts,receipt]
  };
  updated.resultHash=sha256(resultHashBody(updated));
  verifyOpaqueMeshRpcResult(updated,{
    requestPacket,
    trustStore,
    requireSignedReceipts,
    allowPartialReply:true,
    now
  });
  return updated;
}

export class MachineBridgeOpaqueRpcRelay{
  #peers=new Map();
  constructor({nodeId,peers=[],now=()=>new Date(),receiptSigner=null,requireSignedReceipts=false,trustStore=null}={}){
    this.nodeId=safeId(nodeId,"opaque RPC relay nodeId");
    if(typeof now!=="function")throw new TypeError("opaque RPC relay clock required");
    this.now=now;
    this.receiptSigner=receiptSigner;
    this.requireSignedReceipts=requireSignedReceipts===true;
    this.trustStore=trustStore;
    for(const peer of peers)this.addPeer(peer);
  }
  addPeer(peer){
    const normalized=normalizePeer(peer);
    if(normalized.nodeId===this.nodeId)throw new Error("opaque RPC relay cannot peer with itself");
    this.#peers.set(normalized.nodeId,normalized);
    return this;
  }
  advertise(){
    return {
      nodeId:this.nodeId,
      capabilities:["mesh.opaque-relay"],
      reachableCapabilities:[...new Set([...this.#peers.values()].flatMap(peer=>peer.reachableCapabilities))].sort(),
      forward:packet=>this.forward(packet)
    };
  }
  async forward(packet){
    const now=new Date(this.now());
    verifyOpaqueMeshRpcRequest(packet,{
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now
    });
    if(packet.route.includes(this.nodeId))throw new Error("opaque RPC loop detected at "+this.nodeId);
    if(packet.route.length>=packet.maxHops)throw new Error("opaque RPC max hops exceeded");
    const visited=new Set([packet.originNode,...packet.route,this.nodeId]);
    const candidates=[...this.#peers.values()]
      .filter(peer=>!visited.has(peer.nodeId)&&hasAll(peer.reachableCapabilities,packet.requiredCapabilities))
      .sort((a,b)=>a.nodeId.localeCompare(b.nodeId));
    if(!candidates.length)throw new Error("opaque RPC no route from "+this.nodeId);
    const peer=candidates[0];
    const forwardReceipt=appendReceipt(packet.receipts,{
      direction:"forward",
      nodeId:this.nodeId,
      nextNode:peer.nodeId,
      requestId:packet.requestId,
      payloadId:packet.payloadId,
      now,
      baseHash:packet.packetHash,
      signer:this.receiptSigner,
      expiresAt:packet.expiresAt
    });
    const next={...packet,route:[...packet.route,this.nodeId],receipts:[...packet.receipts,forwardReceipt]};
    const result=await peer.forward(next);
    verifyOpaqueMeshRpcResult(result,{
      requestPacket:next,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      allowPartialReply:true,
      now:new Date(this.now())
    });
    const upstream=packet.route.at(-1)||packet.originNode;
    const replyReceipt=appendReceipt(result.replyReceipts,{
      direction:"reply",
      nodeId:this.nodeId,
      nextNode:upstream,
      requestId:result.requestId,
      payloadId:result.responsePayloadId,
      now:new Date(this.now()),
      baseHash:result.responseEnvelope.envelopeHash,
      signer:this.receiptSigner,
      expiresAt:result.responseEnvelope.expiresAt
    });
    const updated={
      ...result,
      replyRoute:[...result.replyRoute,this.nodeId],
      replyReceipts:[...result.replyReceipts,replyReceipt]
    };
    updated.resultHash=sha256(resultHashBody(updated));
    verifyOpaqueMeshRpcResult(updated,{
      requestPacket:next,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      allowPartialReply:true,
      now:new Date(this.now())
    });
    return updated;
  }
}

export class MachineBridgeOpaqueRpcEndpoint{
  constructor({
    nodeId,
    capabilities=[],
    recipient,
    recipientPrivateKey,
    handler,
    now=()=>new Date(),
    receiptSigner=null,
    requireSignedReceipts=false,
    trustStore=null,
    requestReplayGuard=null
  }={}){
    this.nodeId=safeId(nodeId,"opaque RPC endpoint nodeId");
    this.capabilities=normalizeCapabilities(capabilities);
    if(recipient?.payload?.nodeId!==this.nodeId)throw new Error("opaque RPC endpoint recipient node mismatch");
    if(!recipientPrivateKey)throw new TypeError("opaque RPC endpoint recipientPrivateKey required");
    if(typeof handler!=="function")throw new TypeError("opaque RPC endpoint handler required");
    if(typeof now!=="function")throw new TypeError("opaque RPC endpoint clock required");
    this.recipient=recipient;
    this.recipientPrivateKey=recipientPrivateKey;
    this.handler=handler;
    this.now=now;
    this.receiptSigner=receiptSigner;
    this.requireSignedReceipts=requireSignedReceipts===true;
    this.trustStore=trustStore;
    this.requestReplayGuard=requestReplayGuard;
  }
  advertise(){
    return {
      nodeId:this.nodeId,
      capabilities:[...this.capabilities],
      reachableCapabilities:[...this.capabilities],
      forward:packet=>this.forward(packet)
    };
  }
  async forward(packet){
    const now=new Date(this.now());
    verifyOpaqueMeshRpcRequest(packet,{
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now
    });
    if(packet.targetNode!==this.nodeId)throw new Error("opaque RPC endpoint target mismatch");
    if(packet.route.includes(this.nodeId))throw new Error("opaque RPC loop detected at "+this.nodeId);
    if(packet.route.length>=packet.maxHops)throw new Error("opaque RPC max hops exceeded");
    if(!hasAll(this.capabilities,packet.requiredCapabilities))throw new Error("opaque RPC endpoint capability mismatch: "+this.nodeId);
    if(packet.recipient.statementHash!==this.recipient.statementHash)throw new Error("opaque RPC endpoint encryption recipient mismatch");
    const forwardReceipt=appendReceipt(packet.receipts,{
      direction:"forward",
      nodeId:this.nodeId,
      nextNode:"local-executor",
      requestId:packet.requestId,
      payloadId:packet.payloadId,
      now,
      baseHash:packet.packetHash,
      signer:this.receiptSigner,
      expiresAt:packet.expiresAt
    });
    const routed={...packet,route:[...packet.route,this.nodeId],receipts:[...packet.receipts,forwardReceipt]};
    const opened=decryptMeshPayload(routed.requestEnvelope,{
      recipient:this.recipient,
      recipientPrivateKey:this.recipientPrivateKey,
      trustStore:this.trustStore,
      replayGuard:this.requestReplayGuard,
      now
    });
    const output=await this.handler(opened.payload,{
      requestId:routed.requestId,
      payloadId:routed.payloadId,
      requestProof:opened.proof,
      route:[...routed.route]
    });
    const responsePayloadId="reply."+sha256(routed.requestId+":"+routed.payloadId).slice(0,48);
    const remaining=Math.min(
      dateMs(routed.expiresAt,"opaque RPC expiresAt"),
      dateMs(routed.replyRecipient.expiresAt,"opaque RPC reply recipient expiresAt")
    )-now.getTime();
    if(remaining<1000)throw new Error("opaque RPC insufficient lifetime for encrypted response");
    const responseEnvelope=encryptMeshPayload(output,{
      requestId:routed.requestId,
      payloadId:responsePayloadId,
      originNode:this.nodeId,
      recipient:routed.replyRecipient,
      trustStore:this.trustStore,
      now,
      ttlMs:Math.min(MAX_TTL_MS,remaining),
      clockSkewMs:0
    });
    const upstream=routed.route.length>1?routed.route.at(-2):routed.originNode;
    const replyReceipt=appendReceipt([],{
      direction:"reply",
      nodeId:this.nodeId,
      nextNode:upstream,
      requestId:routed.requestId,
      payloadId:responsePayloadId,
      now,
      baseHash:responseEnvelope.envelopeHash,
      signer:this.receiptSigner,
      expiresAt:responseEnvelope.expiresAt
    });
    const result={
      format:ARCA_OPAQUE_MESH_RPC_RESULT_FORMAT,
      version:1,
      requestId:routed.requestId,
      payloadId:routed.payloadId,
      responsePayloadId,
      endpointNode:this.nodeId,
      route:routed.route,
      replyRoute:[this.nodeId],
      receipts:routed.receipts,
      replyReceipts:[replyReceipt],
      responseEnvelope
    };
    result.resultHash=sha256(resultHashBody(result));
    verifyOpaqueMeshRpcResult(result,{
      requestPacket:routed,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      allowPartialReply:true,
      now
    });
    return result;
  }
}

export class MachineBridgeOpaqueRpcClient{
  constructor({
    originNode,
    entry,
    replyRecipient,
    replyPrivateKey,
    now=()=>new Date(),
    trustStore=null,
    requireSignedReceipts=false,
    responseReplayGuard=null
  }={}){
    this.originNode=safeId(originNode,"opaque RPC originNode");
    if(!entry||typeof entry.forward!=="function")throw new TypeError("opaque RPC entry required");
    if(replyRecipient?.payload?.nodeId!==this.originNode)throw new Error("opaque RPC reply recipient node mismatch");
    if(!replyPrivateKey)throw new TypeError("opaque RPC replyPrivateKey required");
    if(typeof now!=="function")throw new TypeError("opaque RPC client clock required");
    this.entry=entry;
    this.replyRecipient=replyRecipient;
    this.replyPrivateKey=replyPrivateKey;
    this.now=now;
    this.trustStore=trustStore;
    this.requireSignedReceipts=requireSignedReceipts===true;
    this.responseReplayGuard=responseReplayGuard;
  }
  async call(payload,{
    requestId,
    payloadId,
    recipient,
    requiredCapabilities=[],
    maxHops=8,
    ttlMs=5*60*1000
  }={}){
    const packet=createOpaqueMeshRpcRequest(payload,{
      requestId,
      payloadId,
      originNode:this.originNode,
      recipient,
      replyRecipient:this.replyRecipient,
      requiredCapabilities,
      maxHops,
      ttlMs,
      trustStore:this.trustStore,
      now:new Date(this.now())
    });
    const result=await this.entry.forward(packet);
    verifyOpaqueMeshRpcResult(result,{
      requestPacket:packet,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now:new Date(this.now())
    });
    const opened=decryptMeshPayload(result.responseEnvelope,{
      recipient:this.replyRecipient,
      recipientPrivateKey:this.replyPrivateKey,
      trustStore:this.trustStore,
      replayGuard:this.responseReplayGuard,
      now:new Date(this.now())
    });
    return Object.freeze({
      format:ARCA_OPAQUE_MESH_RPC_CALL_FORMAT,
      version:1,
      requestId:result.requestId,
      payloadId:result.payloadId,
      responsePayloadId:result.responsePayloadId,
      endpointNode:result.endpointNode,
      route:[...result.route],
      replyRoute:[...result.replyRoute],
      requestEnvelopeHash:packet.requestEnvelope.envelopeHash,
      responseEnvelopeHash:result.responseEnvelope.envelopeHash,
      resultHash:result.resultHash,
      responseProof:opened.proof,
      output:opened.payload
    });
  }
}
