import {createHash} from "node:crypto";
import {GitHubMachineBridgeTransport} from "./github-transport.mjs";
import {
  verifyOpaqueMeshRpcRequest,
  verifyOpaqueMeshRpcResult
} from "./mesh-opaque-rpc.mjs";

export const ARCA_OPAQUE_RPC_MAILBOX_CLAIM_FORMAT="arca-opaque-rpc-mailbox-claim-v1";
export const ARCA_OPAQUE_RPC_MAILBOX_RESULT_FORMAT="arca-opaque-rpc-mailbox-result-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;

function defaultSleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function stable(value){return JSON.stringify(stableValue(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function dateMs(value,label){const ms=Date.parse(value);if(!Number.isFinite(ms))throw new Error("invalid "+label);return ms}
function activeClaim(claim,now){
  return Boolean(
    claim&&
    claim.format===ARCA_OPAQUE_RPC_MAILBOX_CLAIM_FORMAT&&
    Number.isFinite(Date.parse(claim.leaseUntil))&&
    Date.parse(claim.leaseUntil)>new Date(now).getTime()
  );
}
function resultWrapperHash(value){
  return sha256({
    format:value.format,
    version:value.version,
    requestId:value.requestId,
    requestPacketHash:value.requestPacketHash,
    resultHash:value.resultHash,
    storedAt:value.storedAt
  });
}

export class GitHubOpaqueRpcMailboxTransport{
  constructor({
    repository,
    ref="arca-runtime",
    token,
    root="remote-opaque-rpc",
    apiBase="https://api.github.com",
    fetchImpl=globalThis.fetch,
    trustStore=null,
    requireSignedReceipts=false,
    clockSkewMs=60_000
  }={}){
    this.store=new GitHubMachineBridgeTransport({repository,ref,token,root,apiBase,fetchImpl});
    this.repository=repository;
    this.ref=ref;
    this.root=root.replace(/^\/+|\/+$/g,"");
    this.trustStore=trustStore;
    this.requireSignedReceipts=requireSignedReceipts===true;
    this.clockSkewMs=Number(clockSkewMs);
    if(!Number.isSafeInteger(this.clockSkewMs)||this.clockSkewMs<0||this.clockSkewMs>5*60*1000)throw new Error("invalid opaque RPC mailbox clockSkewMs");
  }
  path(...parts){return this.store.path(...parts)}

  verifyRequest(packet,{now=new Date()}={}){
    return verifyOpaqueMeshRpcRequest(packet,{
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now,
      clockSkewMs:this.clockSkewMs
    });
  }

  async enqueueRequest(nodeId,packet,{notify=true,now=new Date()}={}){
    safeId(nodeId,"opaque RPC mailbox target node");
    this.verifyRequest(packet,{now});
    const lastReceipt=packet.receipts.at(-1);
    if(lastReceipt){
      if(lastReceipt.nextNode!==nodeId)throw new Error("opaque RPC mailbox queue node does not match signed next hop");
    }else if(packet.targetNode!==nodeId){
      throw new Error("opaque RPC mailbox initial queue must target the endpoint");
    }
    const path=this.path("queues",nodeId,packet.requestId+".json");
    if(await this.store.get(path))return false;
    const stored=await this.store.putJson(path,packet,{message:"opaque-rpc: enqueue "+packet.requestId+" for "+nodeId});
    if(stored&&notify)await this.notifyNode(nodeId,packet.requestId);
    return stored;
  }

  async listRequests(nodeId,{now=new Date()}={}){
    safeId(nodeId,"opaque RPC mailbox target node");
    const out=[];
    for(const item of (await this.store.list(this.path("queues",nodeId))).filter(value=>value?.name?.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name))){
      try{
        const loaded=await this.store.getJson(item.path);
        if(!loaded)continue;
        this.verifyRequest(loaded.value,{now});
        out.push({path:item.path,packet:loaded.value,sha:loaded.sha});
      }catch{}
    }
    return out;
  }

  async claimRequest(nodeId,packet,processorId,{leaseMs=120_000,now=new Date()}={}){
    safeId(nodeId,"opaque RPC mailbox target node");
    safeId(packet?.requestId,"opaque RPC mailbox requestId");
    safeId(processorId,"opaque RPC mailbox processorId");
    this.verifyRequest(packet,{now});
    if(!Number.isSafeInteger(leaseMs)||leaseMs<5000||leaseMs>15*60*1000)throw new Error("invalid opaque RPC mailbox leaseMs");
    const queued=await this.store.getJson(this.path("queues",nodeId,packet.requestId+".json"));
    if(!queued)throw new Error("opaque RPC mailbox queued request not found");
    if(queued.value?.packetHash!==packet.packetHash)throw new Error("opaque RPC mailbox queued packet mismatch");
    const path=this.path("claims",nodeId,packet.requestId+".json");
    const current=await this.store.getJson(path);
    if(current&&activeClaim(current.value,now))return null;
    const attempt=current?(Number(current.value.attempt)||0)+1:1;
    const claimedAt=new Date(now).toISOString();
    const claim={
      format:ARCA_OPAQUE_RPC_MAILBOX_CLAIM_FORMAT,
      version:1,
      nodeId,
      requestId:packet.requestId,
      packetHash:packet.packetHash,
      processorId,
      attempt,
      claimedAt,
      leaseUntil:new Date(new Date(now).getTime()+leaseMs).toISOString()
    };
    const stored=await this.store.putJson(path,claim,{
      sha:current?.sha,
      message:"opaque-rpc: claim "+packet.requestId+" at "+nodeId+" by "+processorId
    });
    return stored?claim:null;
  }

  async writeResult(requestPacket,result,{now=new Date()}={}){
    this.verifyRequest(requestPacket,{now});
    verifyOpaqueMeshRpcResult(result,{
      requestPacket,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now,
      clockSkewMs:this.clockSkewMs
    });
    if(result.requestId!==requestPacket.requestId)throw new Error("opaque RPC mailbox result requestId mismatch");
    const path=this.path("results",result.requestId+".json");
    if(await this.store.get(path))return false;
    const wrapper={
      format:ARCA_OPAQUE_RPC_MAILBOX_RESULT_FORMAT,
      version:1,
      requestId:result.requestId,
      requestPacketHash:requestPacket.packetHash,
      resultHash:result.resultHash,
      storedAt:new Date(now).toISOString(),
      requestPacket,
      result
    };
    wrapper.wrapperHash=resultWrapperHash(wrapper);
    return this.store.putJson(path,wrapper,{message:"opaque-rpc: terminal encrypted result "+result.requestId});
  }

  verifyStoredResult(wrapper){
    if(!plain(wrapper)||wrapper.format!==ARCA_OPAQUE_RPC_MAILBOX_RESULT_FORMAT||wrapper.version!==1)throw new Error("invalid opaque RPC mailbox result wrapper");
    safeId(wrapper.requestId,"opaque RPC mailbox result requestId");
    if(typeof wrapper.requestPacketHash!=="string"||!HASH.test(wrapper.requestPacketHash))throw new Error("invalid opaque RPC mailbox request packet hash");
    if(typeof wrapper.resultHash!=="string"||!HASH.test(wrapper.resultHash))throw new Error("invalid opaque RPC mailbox result hash");
    dateMs(wrapper.storedAt,"opaque RPC mailbox storedAt");
    if(wrapper.requestPacket?.packetHash!==wrapper.requestPacketHash)throw new Error("opaque RPC mailbox request packet hash mismatch");
    if(wrapper.result?.resultHash!==wrapper.resultHash)throw new Error("opaque RPC mailbox terminal result hash mismatch");
    if(wrapper.result?.requestId!==wrapper.requestId||wrapper.requestPacket?.requestId!==wrapper.requestId)throw new Error("opaque RPC mailbox stored correlation mismatch");
    if(typeof wrapper.wrapperHash!=="string"||!HASH.test(wrapper.wrapperHash)||wrapper.wrapperHash!==resultWrapperHash(wrapper))throw new Error("opaque RPC mailbox wrapper hash mismatch");
    const historicalNow=new Date(wrapper.result.responseEnvelope?.issuedAt||wrapper.storedAt);
    verifyOpaqueMeshRpcResult(wrapper.result,{
      requestPacket:wrapper.requestPacket,
      trustStore:this.trustStore,
      requireSignedReceipts:this.requireSignedReceipts,
      now:historicalNow,
      clockSkewMs:this.clockSkewMs
    });
    return true;
  }

  async getResult(requestId){
    safeId(requestId,"opaque RPC mailbox requestId");
    const path=this.path("results",requestId+".json");
    const loaded=await this.store.getJson(path);
    if(!loaded)return null;
    this.verifyStoredResult(loaded.value);
    return {path,wrapper:loaded.value,requestPacket:loaded.value.requestPacket,result:loaded.value.result,sha:loaded.sha};
  }

  async waitForResult(requestId,{
    waitTimeoutMs=180_000,
    pollIntervalMs=1000,
    sleepImpl=defaultSleep,
    now=Date.now
  }={}){
    safeId(requestId,"opaque RPC mailbox requestId");
    if(!Number.isSafeInteger(waitTimeoutMs)||waitTimeoutMs<1000||waitTimeoutMs>15*60*1000)throw new Error("invalid opaque RPC mailbox wait timeout");
    if(!Number.isSafeInteger(pollIntervalMs)||pollIntervalMs<100||pollIntervalMs>30_000)throw new Error("invalid opaque RPC mailbox poll interval");
    if(typeof sleepImpl!=="function"||typeof now!=="function")throw new Error("invalid opaque RPC mailbox wait clock");
    const deadline=now()+waitTimeoutMs;
    for(;;){
      const loaded=await this.getResult(requestId);
      if(loaded)return loaded.result;
      if(now()>=deadline)throw new Error("timed out waiting for opaque RPC result: "+requestId);
      await sleepImpl(pollIntervalMs);
    }
  }

  remotePeer(nodeId,{
    capabilities=[],
    reachableCapabilities=capabilities,
    waitTimeoutMs=180_000,
    pollIntervalMs=1000,
    sleepImpl=defaultSleep,
    now=Date.now
  }={}){
    safeId(nodeId,"opaque RPC mailbox peer node");
    const declared=[...new Set(capabilities.map(String).map(value=>value.trim()).filter(Boolean))].sort();
    const reachable=[...new Set(reachableCapabilities.map(String).map(value=>value.trim()).filter(Boolean))].sort();
    return {
      nodeId,
      capabilities:declared,
      reachableCapabilities:reachable,
      forward:async packet=>{
        this.verifyRequest(packet,{now:new Date(now())});
        const existing=await this.getResult(packet.requestId);
        if(existing)return existing.result;
        await this.enqueueRequest(nodeId,packet,{notify:true,now:new Date(now())});
        return this.waitForResult(packet.requestId,{waitTimeoutMs,pollIntervalMs,sleepImpl,now});
      }
    };
  }

  async notifyNode(nodeId,requestId){
    safeId(nodeId,"opaque RPC mailbox target node");
    safeId(requestId,"opaque RPC mailbox requestId");
    await this.store.request(this.store.repoUrl("dispatches"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        event_type:"arca_opaque_rpc_available",
        client_payload:{target_ref:this.ref,node_id:nodeId,request_id:requestId}
      })
    });
    return true;
  }
}
