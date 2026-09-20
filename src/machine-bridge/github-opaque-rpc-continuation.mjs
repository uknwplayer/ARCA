import {createHash} from "node:crypto";
import {GitHubOpaqueRpcMailboxTransport} from "./github-opaque-rpc-mailbox.mjs";
import {
  appendOpaqueRpcForwardHop,
  appendOpaqueRpcReplyHop,
  verifyOpaqueMeshRpcRequest,
  verifyOpaqueMeshRpcResult
} from "./mesh-opaque-rpc.mjs";

export const ARCA_OPAQUE_RPC_CONTINUATION_FORMAT="arca-opaque-rpc-continuation-v1";
export const ARCA_OPAQUE_RPC_REPLY_FORMAT="arca-opaque-rpc-reply-mailbox-v1";
export const ARCA_OPAQUE_RPC_REPLY_CLAIM_FORMAT="arca-opaque-rpc-reply-claim-v1";
export const ARCA_OPAQUE_RPC_HANDOFF_FORMAT="arca-opaque-rpc-handoff-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function stable(value){return JSON.stringify(stableValue(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function activeClaim(claim,now){
  return Boolean(
    claim&&
    claim.format===ARCA_OPAQUE_RPC_REPLY_CLAIM_FORMAT&&
    Number.isFinite(Date.parse(claim.leaseUntil))&&
    Date.parse(claim.leaseUntil)>new Date(now).getTime()
  );
}
function continuationHashBody(value){
  return {
    format:value.format,
    version:value.version,
    requestId:value.requestId,
    nodeId:value.nodeId,
    upstreamNode:value.upstreamNode,
    downstreamNode:value.downstreamNode,
    receivedPacketHash:value.receivedPacketHash,
    receivedStateHash:value.receivedStateHash,
    forwardedPacketHash:value.forwardedPacketHash,
    forwardedStateHash:value.forwardedStateHash,
    status:value.status,
    createdAt:value.createdAt,
    updatedAt:value.updatedAt,
    completionResultHash:value.completionResultHash??null
  };
}
function replyHashBody(value){
  return {
    format:value.format,
    version:value.version,
    targetNode:value.targetNode,
    requestId:value.requestId,
    requestPacketHash:value.requestPacketHash,
    resultHash:value.resultHash,
    queuedAt:value.queuedAt
  };
}

export class GitHubOpaqueRpcContinuationTransport{
  constructor({mailbox}={}){
    if(!(mailbox instanceof GitHubOpaqueRpcMailboxTransport))throw new TypeError("GitHubOpaqueRpcMailboxTransport required");
    this.mailbox=mailbox;
    this.store=mailbox.store;
  }
  path(...parts){return this.store.path(...parts)}

  verifyContinuation(value){
    if(!plain(value)||value.format!==ARCA_OPAQUE_RPC_CONTINUATION_FORMAT||value.version!==1)throw new Error("invalid opaque RPC continuation");
    safeId(value.requestId,"opaque RPC continuation requestId");
    safeId(value.nodeId,"opaque RPC continuation nodeId");
    safeId(value.upstreamNode,"opaque RPC continuation upstreamNode");
    safeId(value.downstreamNode,"opaque RPC continuation downstreamNode");
    if(!["waiting-reply","completed"].includes(value.status))throw new Error("invalid opaque RPC continuation status");
    if(typeof value.receivedPacketHash!=="string"||!HASH.test(value.receivedPacketHash))throw new Error("invalid received packet hash");
    if(typeof value.forwardedPacketHash!=="string"||!HASH.test(value.forwardedPacketHash))throw new Error("invalid forwarded packet hash");
    if(typeof value.receivedStateHash!=="string"||!HASH.test(value.receivedStateHash))throw new Error("invalid received state hash");
    if(typeof value.forwardedStateHash!=="string"||!HASH.test(value.forwardedStateHash))throw new Error("invalid forwarded state hash");
    if(value.receivedPacket?.packetHash!==value.receivedPacketHash||sha256(value.receivedPacket)!==value.receivedStateHash)throw new Error("opaque RPC continuation received packet mismatch");
    if(value.forwardedPacket?.packetHash!==value.forwardedPacketHash||sha256(value.forwardedPacket)!==value.forwardedStateHash)throw new Error("opaque RPC continuation forwarded packet mismatch");
    if(value.receivedPacket?.requestId!==value.requestId||value.forwardedPacket?.requestId!==value.requestId)throw new Error("opaque RPC continuation correlation mismatch");
    if(value.forwardedPacket?.route?.at(-1)!==value.nodeId)throw new Error("opaque RPC continuation route/node mismatch");
    if(value.forwardedPacket?.receipts?.at(-1)?.nextNode!==value.downstreamNode)throw new Error("opaque RPC continuation downstream mismatch");
    if(value.status==="completed"&&(typeof value.completionResultHash!=="string"||!HASH.test(value.completionResultHash)))throw new Error("opaque RPC completed continuation missing result hash");
    if(value.continuationHash!==sha256(continuationHashBody(value)))throw new Error("opaque RPC continuation hash mismatch");
    return true;
  }

  async putContinuation({
    nodeId,
    receivedPacket,
    forwardedPacket,
    upstreamNode,
    downstreamNode,
    now=new Date()
  }={}){
    safeId(nodeId,"opaque RPC continuation nodeId");
    safeId(upstreamNode,"opaque RPC continuation upstreamNode");
    safeId(downstreamNode,"opaque RPC continuation downstreamNode");
    this.mailbox.verifyRequest(receivedPacket,{now});
    this.mailbox.verifyRequest(forwardedPacket,{now});
    if(receivedPacket.requestId!==forwardedPacket.requestId)throw new Error("opaque RPC continuation packet correlation mismatch");
    if(forwardedPacket.route.at(-1)!==nodeId)throw new Error("opaque RPC continuation forwarded route mismatch");
    if(forwardedPacket.receipts.at(-1)?.nextNode!==downstreamNode)throw new Error("opaque RPC continuation next hop mismatch");
    const path=this.path("continuations",nodeId,receivedPacket.requestId+".json");
    const current=await this.store.getJson(path);
    if(current){
      this.verifyContinuation(current.value);
      const same=
        current.value.receivedPacketHash===receivedPacket.packetHash&&
        current.value.forwardedPacketHash===forwardedPacket.packetHash&&
        current.value.receivedStateHash===sha256(receivedPacket)&&
        current.value.forwardedStateHash===sha256(forwardedPacket)&&
        current.value.upstreamNode===upstreamNode&&
        current.value.downstreamNode===downstreamNode;
      if(!same)throw new Error("opaque RPC continuation conflict");
      return current.value;
    }
    const timestamp=new Date(now).toISOString();
    const value={
      format:ARCA_OPAQUE_RPC_CONTINUATION_FORMAT,
      version:1,
      requestId:receivedPacket.requestId,
      nodeId,
      upstreamNode,
      downstreamNode,
      receivedPacketHash:receivedPacket.packetHash,
      forwardedPacketHash:forwardedPacket.packetHash,
      receivedStateHash:sha256(receivedPacket),
      forwardedStateHash:sha256(forwardedPacket),
      status:"waiting-reply",
      createdAt:timestamp,
      updatedAt:timestamp,
      completionResultHash:null,
      receivedPacket,
      forwardedPacket
    };
    value.continuationHash=sha256(continuationHashBody(value));
    const stored=await this.store.putJson(path,value,{message:"opaque-rpc: persist continuation "+value.requestId+" at "+nodeId});
    if(!stored){
      const raced=await this.store.getJson(path);
      if(!raced)throw new Error("opaque RPC continuation persistence conflict");
      this.verifyContinuation(raced.value);
      return raced.value;
    }
    return value;
  }

  async getContinuation(nodeId,requestId){
    safeId(nodeId,"opaque RPC continuation nodeId");
    safeId(requestId,"opaque RPC continuation requestId");
    const path=this.path("continuations",nodeId,requestId+".json");
    const loaded=await this.store.getJson(path);
    if(!loaded)return null;
    this.verifyContinuation(loaded.value);
    return {path,continuation:loaded.value,sha:loaded.sha};
  }

  async completeContinuation(nodeId,requestId,resultHash,{now=new Date()}={}){
    safeId(nodeId,"opaque RPC continuation nodeId");
    safeId(requestId,"opaque RPC continuation requestId");
    if(typeof resultHash!=="string"||!HASH.test(resultHash))throw new Error("invalid opaque RPC continuation resultHash");
    const path=this.path("continuations",nodeId,requestId+".json");
    const loaded=await this.store.getJson(path);
    if(!loaded)throw new Error("opaque RPC continuation not found");
    this.verifyContinuation(loaded.value);
    if(loaded.value.status==="completed"){
      if(loaded.value.completionResultHash!==resultHash)throw new Error("opaque RPC continuation completion conflict");
      return loaded.value;
    }
    const value={
      ...loaded.value,
      status:"completed",
      updatedAt:new Date(now).toISOString(),
      completionResultHash:resultHash
    };
    value.continuationHash=sha256(continuationHashBody(value));
    const stored=await this.store.putJson(path,value,{
      sha:loaded.sha,
      message:"opaque-rpc: complete continuation "+requestId+" at "+nodeId
    });
    if(!stored)throw new Error("opaque RPC continuation completion conflict");
    return value;
  }

  verifyReplyWrapper(wrapper,{now=new Date()}={}){
    if(!plain(wrapper)||wrapper.format!==ARCA_OPAQUE_RPC_REPLY_FORMAT||wrapper.version!==1)throw new Error("invalid opaque RPC reply wrapper");
    safeId(wrapper.targetNode,"opaque RPC reply targetNode");
    safeId(wrapper.requestId,"opaque RPC reply requestId");
    if(wrapper.requestPacket?.packetHash!==wrapper.requestPacketHash)throw new Error("opaque RPC reply request packet mismatch");
    if(wrapper.result?.resultHash!==wrapper.resultHash)throw new Error("opaque RPC reply result hash mismatch");
    if(wrapper.requestPacket?.requestId!==wrapper.requestId||wrapper.result?.requestId!==wrapper.requestId)throw new Error("opaque RPC reply correlation mismatch");
    if(wrapper.result?.replyReceipts?.at(-1)?.nextNode!==wrapper.targetNode)throw new Error("opaque RPC reply target does not match signed next hop");
    verifyOpaqueMeshRpcResult(wrapper.result,{
      requestPacket:wrapper.requestPacket,
      trustStore:this.mailbox.trustStore,
      requireSignedReceipts:this.mailbox.requireSignedReceipts,
      allowPartialReply:true,
      now,
      clockSkewMs:this.mailbox.clockSkewMs
    });
    if(wrapper.replyHash!==sha256(replyHashBody(wrapper)))throw new Error("opaque RPC reply wrapper hash mismatch");
    return true;
  }

  async enqueueReply(targetNode,requestPacket,result,{notify=true,now=new Date()}={}){
    safeId(targetNode,"opaque RPC reply targetNode");
    verifyOpaqueMeshRpcResult(result,{
      requestPacket,
      trustStore:this.mailbox.trustStore,
      requireSignedReceipts:this.mailbox.requireSignedReceipts,
      allowPartialReply:true,
      now,
      clockSkewMs:this.mailbox.clockSkewMs
    });
    if(result.replyReceipts.at(-1)?.nextNode!==targetNode)throw new Error("opaque RPC reply queue node does not match signed next hop");
    const path=this.path("replies",targetNode,result.requestId+".json");
    const wrapper={
      format:ARCA_OPAQUE_RPC_REPLY_FORMAT,
      version:1,
      targetNode,
      requestId:result.requestId,
      requestPacketHash:requestPacket.packetHash,
      resultHash:result.resultHash,
      queuedAt:new Date(now).toISOString(),
      requestPacket,
      result
    };
    wrapper.replyHash=sha256(replyHashBody(wrapper));
    const current=await this.store.getJson(path);
    if(current){
      this.verifyReplyWrapper(current.value,{now});
      if(current.value.resultHash!==result.resultHash)throw new Error("opaque RPC reply queue conflict");
      return false;
    }
    const stored=await this.store.putJson(path,wrapper,{message:"opaque-rpc: enqueue encrypted reply "+result.requestId+" for "+targetNode});
    if(stored&&notify)await this.notifyReply(targetNode,result.requestId);
    return stored;
  }

  async getReply(targetNode,requestId,{now=new Date()}={}){
    safeId(targetNode,"opaque RPC reply targetNode");
    safeId(requestId,"opaque RPC reply requestId");
    const path=this.path("replies",targetNode,requestId+".json");
    const loaded=await this.store.getJson(path);
    if(!loaded)return null;
    this.verifyReplyWrapper(loaded.value,{now});
    return {path,wrapper:loaded.value,requestPacket:loaded.value.requestPacket,result:loaded.value.result,sha:loaded.sha};
  }

  async claimReply(targetNode,requestId,processorId,{leaseMs=120_000,now=new Date()}={}){
    safeId(targetNode,"opaque RPC reply targetNode");
    safeId(requestId,"opaque RPC reply requestId");
    safeId(processorId,"opaque RPC reply processorId");
    if(!Number.isSafeInteger(leaseMs)||leaseMs<5000||leaseMs>15*60*1000)throw new Error("invalid opaque RPC reply claim leaseMs");
    const reply=await this.getReply(targetNode,requestId,{now});
    if(!reply)throw new Error("opaque RPC reply not found");
    const path=this.path("reply-claims",targetNode,requestId+".json");
    const current=await this.store.getJson(path);
    if(current&&activeClaim(current.value,now))return null;
    const attempt=current?(Number(current.value.attempt)||0)+1:1;
    const claim={
      format:ARCA_OPAQUE_RPC_REPLY_CLAIM_FORMAT,
      version:1,
      targetNode,
      requestId,
      replyHash:reply.wrapper.replyHash,
      resultHash:reply.result.resultHash,
      processorId,
      attempt,
      claimedAt:new Date(now).toISOString(),
      leaseUntil:new Date(new Date(now).getTime()+leaseMs).toISOString()
    };
    const stored=await this.store.putJson(path,claim,{
      sha:current?.sha,
      message:"opaque-rpc: claim encrypted reply "+requestId+" at "+targetNode+" by "+processorId
    });
    return stored?claim:null;
  }

  async notifyReply(nodeId,requestId){
    safeId(nodeId,"opaque RPC reply targetNode");
    safeId(requestId,"opaque RPC reply requestId");
    await this.store.request(this.store.repoUrl("dispatches"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        event_type:"arca_opaque_rpc_reply_available",
        client_payload:{target_ref:this.mailbox.ref,node_id:nodeId,request_id:requestId}
      })
    });
    return true;
  }
}

export class DurableOpaqueRpcRelayContinuation{
  constructor({
    nodeId,
    mailbox,
    continuationTransport,
    receiptSigner=null,
    trustStore=null,
    requireSignedReceipts=false,
    now=()=>new Date()
  }={}){
    this.nodeId=safeId(nodeId,"durable opaque relay nodeId");
    if(!(mailbox instanceof GitHubOpaqueRpcMailboxTransport))throw new TypeError("GitHubOpaqueRpcMailboxTransport required");
    if(!(continuationTransport instanceof GitHubOpaqueRpcContinuationTransport))throw new TypeError("GitHubOpaqueRpcContinuationTransport required");
    if(typeof now!=="function")throw new TypeError("durable opaque relay clock required");
    this.mailbox=mailbox;
    this.continuations=continuationTransport;
    this.receiptSigner=receiptSigner;
    this.trustStore=trustStore;
    this.requireSignedReceipts=requireSignedReceipts===true;
    this.now=now;
  }

  async forwardAndReturn(packet,{
    nextNode,
    processorId,
    claimQueued=true,
    leaseMs=120_000
  }={}){
    safeId(nextNode,"durable opaque relay nextNode");
    safeId(processorId,"durable opaque relay processorId");
    const now=new Date(this.now());
    verifyOpaqueMeshRpcRequest(packet,{
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now,
      clockSkewMs:this.mailbox.clockSkewMs
    });
    if(packet.route.includes(this.nodeId))throw new Error("durable opaque relay loop detected at "+this.nodeId);
    if(claimQueued){
      const claim=await this.mailbox.claimRequest(this.nodeId,packet,processorId,{leaseMs,now});
      if(!claim)return Object.freeze({
        format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
        version:1,
        requestId:packet.requestId,
        nodeId:this.nodeId,
        state:"already-claimed"
      });
    }
    const upstreamNode=packet.route.at(-1)||packet.originNode;
    const forwarded=appendOpaqueRpcForwardHop(packet,{
      nodeId:this.nodeId,
      nextNode,
      receiptSigner:this.receiptSigner,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now
    });
    const continuation=await this.continuations.putContinuation({
      nodeId:this.nodeId,
      receivedPacket:packet,
      forwardedPacket:forwarded,
      upstreamNode,
      downstreamNode:nextNode,
      now
    });
    await this.mailbox.enqueueRequest(nextNode,forwarded,{notify:true,now});
    return Object.freeze({
      format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
      version:1,
      requestId:packet.requestId,
      nodeId:this.nodeId,
      state:"waiting-reply",
      upstreamNode,
      downstreamNode:nextNode,
      continuationHash:continuation.continuationHash,
      forwardedPacketHash:forwarded.packetHash,
      forwardedStateHash:sha256(forwarded),
      returnedImmediately:true
    });
  }

  async resumeReplyAndReturn(requestId,{
    processorId,
    leaseMs=120_000
  }={}){
    safeId(requestId,"durable opaque relay requestId");
    safeId(processorId,"durable opaque relay processorId");
    const now=new Date(this.now());
    const loaded=await this.continuations.getContinuation(this.nodeId,requestId);
    if(!loaded)throw new Error("durable opaque relay continuation not found");
    const continuation=loaded.continuation;
    if(continuation.status==="completed"){
      return Object.freeze({
        format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
        version:1,
        requestId,
        nodeId:this.nodeId,
        state:"completed",
        resultHash:continuation.completionResultHash,
        idempotent:true,
        returnedImmediately:true
      });
    }
    const claim=await this.continuations.claimReply(this.nodeId,requestId,processorId,{leaseMs,now});
    if(!claim)return Object.freeze({
      format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
      version:1,
      requestId,
      nodeId:this.nodeId,
      state:"reply-already-claimed",
      returnedImmediately:true
    });
    const reply=await this.continuations.getReply(this.nodeId,requestId,{now});
    const updated=appendOpaqueRpcReplyHop(reply.result,{
      requestPacket:continuation.forwardedPacket,
      nodeId:this.nodeId,
      nextNode:continuation.upstreamNode,
      receiptSigner:this.receiptSigner,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now
    });
    let destination;
    if(continuation.upstreamNode===continuation.receivedPacket.originNode){
      const stored=await this.mailbox.writeResult(continuation.receivedPacket,updated,{now});
      if(!stored){
        const existing=await this.mailbox.getResult(requestId);
        if(!existing||existing.result.resultHash!==updated.resultHash)throw new Error("durable opaque relay terminal result conflict");
      }
      destination="terminal";
    }else{
      await this.continuations.enqueueReply(
        continuation.upstreamNode,
        continuation.receivedPacket,
        updated,
        {notify:true,now}
      );
      destination=continuation.upstreamNode;
    }
    await this.continuations.completeContinuation(this.nodeId,requestId,updated.resultHash,{now});
    return Object.freeze({
      format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
      version:1,
      requestId,
      nodeId:this.nodeId,
      state:"completed",
      destination,
      resultHash:updated.resultHash,
      returnedImmediately:true
    });
  }
}

export async function processDurableOpaqueRpcEndpoint({
  nodeId,
  mailbox,
  continuationTransport,
  endpoint,
  packet,
  processorId,
  leaseMs=120_000,
  now=new Date()
}={}){
  safeId(nodeId,"durable opaque endpoint nodeId");
  safeId(processorId,"durable opaque endpoint processorId");
  if(!(mailbox instanceof GitHubOpaqueRpcMailboxTransport))throw new TypeError("GitHubOpaqueRpcMailboxTransport required");
  if(!(continuationTransport instanceof GitHubOpaqueRpcContinuationTransport))throw new TypeError("GitHubOpaqueRpcContinuationTransport required");
  if(!endpoint||typeof endpoint.forward!=="function")throw new TypeError("opaque RPC endpoint required");
  const claim=await mailbox.claimRequest(nodeId,packet,processorId,{leaseMs,now});
  if(!claim)return Object.freeze({
    format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
    version:1,
    requestId:packet.requestId,
    nodeId,
    state:"already-claimed",
    returnedImmediately:true
  });
  const upstreamNode=packet.route.at(-1)||packet.originNode;
  if(upstreamNode===packet.originNode){
    const existing=await mailbox.getResult(packet.requestId);
    if(existing)return Object.freeze({
      format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
      version:1,
      requestId:packet.requestId,
      nodeId,
      state:"completed",
      destination:"terminal",
      resultHash:existing.result.resultHash,
      idempotent:true,
      returnedImmediately:true
    });
  }else{
    const existing=await continuationTransport.getReply(upstreamNode,packet.requestId,{now});
    if(existing)return Object.freeze({
      format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
      version:1,
      requestId:packet.requestId,
      nodeId,
      state:"completed",
      destination:upstreamNode,
      resultHash:existing.result.resultHash,
      idempotent:true,
      returnedImmediately:true
    });
  }
  const result=await endpoint.forward(packet);
  if(upstreamNode===packet.originNode){
    await mailbox.writeResult(packet,result,{now});
  }else{
    await continuationTransport.enqueueReply(upstreamNode,packet,result,{notify:true,now});
  }
  return Object.freeze({
    format:ARCA_OPAQUE_RPC_HANDOFF_FORMAT,
    version:1,
    requestId:packet.requestId,
    nodeId,
    state:"completed",
    destination:upstreamNode===packet.originNode?"terminal":upstreamNode,
    resultHash:result.resultHash,
    returnedImmediately:true
  });
}
