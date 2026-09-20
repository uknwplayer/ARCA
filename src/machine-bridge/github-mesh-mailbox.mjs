import {GitHubMachineBridgeTransport} from "./github-transport.mjs";
import {verifyMeshEnvelope,verifyMeshResult} from "./mesh.mjs";
import {
  MESH_NODE_ADVERTISEMENT_DOMAIN,
  signMeshNodeAdvertisement,
  verifySignedMeshNodeAdvertisement
} from "./mesh-identity.mjs";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const NODE_FORMAT="arca-mesh-node-v1";
const CLAIM_FORMAT="arca-mesh-envelope-claim-v1";
const IDENTITY_POLICIES=new Set(["legacy","require-signed","require-trusted"]);

function defaultSleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function safeId(value,label){if(!SAFE_ID.test(value||""))throw new Error(`invalid ${label}`);return value}
function capabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("capabilities must be an array");
  const out=[...new Set(values.map(String).map(value=>value.trim()).filter(Boolean))].sort();
  if(out.some(value=>value.length>160))throw new Error("capability too long");
  return out;
}
function validDate(value){return Number.isFinite(Date.parse(value))}
function activeClaim(claim,now){return Boolean(claim&&claim.format===CLAIM_FORMAT&&validDate(claim.leaseUntil)&&Date.parse(claim.leaseUntil)>new Date(now).getTime())}

export function normalizeMeshNodeAdvertisement(node,{now=new Date()}={}){
  if(!node||typeof node!=="object"||Array.isArray(node))throw new TypeError("invalid mesh node advertisement");
  const nodeId=safeId(node.nodeId,"mesh node id");
  const kind=node.kind||"relay";
  if(!["relay","endpoint","hybrid"].includes(kind))throw new Error("invalid mesh node kind");
  const heartbeatAt=node.heartbeatAt||new Date(now).toISOString();
  if(!validDate(heartbeatAt))throw new Error("invalid mesh node heartbeat");
  return {
    format:NODE_FORMAT,
    meshVersion:1,
    nodeId,
    kind,
    capabilities:capabilities(node.capabilities||[]),
    reachableCapabilities:capabilities(node.reachableCapabilities||node.capabilities||[]),
    heartbeatAt,
    metadata:node.metadata&&typeof node.metadata==="object"&&!Array.isArray(node.metadata)?node.metadata:{},
    transport:{kind:"github-mailbox"}
  };
}

export function isMeshNodeAdvertisement(value){
  try{
    const normalized=normalizeMeshNodeAdvertisement(value,{now:new Date(value?.heartbeatAt||0)});
    return value?.format===NODE_FORMAT&&value?.meshVersion===1&&normalized.nodeId===value.nodeId;
  }catch{return false}
}

export class GitHubMeshMailboxTransport{
  constructor({repository,ref="arca-runtime",token,root="remote-mesh",apiBase="https://api.github.com",fetchImpl=globalThis.fetch,identityPolicy="legacy",trustStore=null,replayGuard=null}={}){
    this.store=new GitHubMachineBridgeTransport({repository,ref,token,root,apiBase,fetchImpl});
    this.repository=repository;
    this.ref=ref;
    this.root=root.replace(/^\/+|\/+$/g,"");
    this.identityPolicy=String(identityPolicy).trim().toLowerCase();
    if(!IDENTITY_POLICIES.has(this.identityPolicy))throw new Error("invalid mesh identity policy");
    if(this.identityPolicy==="require-trusted"&&typeof trustStore?.verify!=="function")throw new Error("require-trusted Mesh mailbox needs trustStore.verify()");
    if(replayGuard&&typeof replayGuard.accept!=="function")throw new TypeError("mesh replayGuard.accept() required");
    this.trustStore=trustStore;
    this.replayGuard=replayGuard;
  }
  path(...parts){return this.store.path(...parts)}

  async registerNode(node,{now=new Date()}={}){
    if(this.identityPolicy!=="legacy")throw new Error("unsigned Mesh node registration disabled by identity policy");
    const value=normalizeMeshNodeAdvertisement(node,{now});
    value.transport={kind:"github-mailbox",repository:this.repository,ref:this.ref,root:this.root};
    const path=this.path("nodes",`${value.nodeId}.json`);
    const current=await this.store.getJson(path);
    const stored=await this.store.putJson(path,value,{sha:current?.sha,message:`mesh: register node ${value.nodeId}`});
    if(!stored)throw new Error("mesh node registration conflict");
    return value;
  }

  async registerSignedNode(node,{signer,now=new Date(),ttlMs=10*60*1000,clockSkewMs=60000}={}){
    const value=normalizeMeshNodeAdvertisement(node,{now});
    value.transport={kind:"github-mailbox",repository:this.repository,ref:this.ref,root:this.root};
    const statement=typeof signer?.signNodeAdvertisement==="function"
      ?await signer.signNodeAdvertisement(value,{issuedAt:now,ttlMs})
      :signMeshNodeAdvertisement(value,signer,{issuedAt:now,ttlMs});
    verifySignedMeshNodeAdvertisement(statement,{now,clockSkewMs});
    if(this.identityPolicy==="require-trusted")this.trustStore.verify(statement,{expectedDomain:MESH_NODE_ADVERTISEMENT_DOMAIN,expectedNodeId:value.nodeId,now,clockSkewMs});
    if(this.replayGuard)this.replayGuard.accept(statement,{now,clockSkewMs});
    const path=this.path("nodes",`${value.nodeId}.json`);
    const current=await this.store.getJson(path);
    const stored=await this.store.putJson(path,statement,{sha:current?.sha,message:`mesh: register signed node ${value.nodeId}`});
    if(!stored)throw new Error("mesh signed node registration conflict");
    return {node:value,statement};
  }

  async inspectNode(nodeId,{now=new Date(),maxAgeMs=5*60*1000,clockSkewMs=60000}={}){
    safeId(nodeId,"mesh node id");
    if(!Number.isInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>24*60*60*1000)throw new Error("invalid mesh node maxAgeMs");
    const path=this.path("nodes",`${nodeId}.json`);
    const loaded=await this.store.getJson(path);
    if(!loaded)return null;
    let node=null,statement=null,signed=false,identityTrusted=false;
    try{
      verifySignedMeshNodeAdvertisement(loaded.value,{now,clockSkewMs});
      statement=loaded.value;
      node=statement.payload;
      signed=true;
      if(this.trustStore){
        try{
          this.trustStore.verify(statement,{expectedDomain:MESH_NODE_ADVERTISEMENT_DOMAIN,expectedNodeId:nodeId,now,clockSkewMs});
          identityTrusted=true;
        }catch{}
      }
    }catch{
      if(this.identityPolicy==="legacy"&&isMeshNodeAdvertisement(loaded.value))node=loaded.value;
      else return {path,sha:loaded.sha,valid:false,signed:false,identityTrusted:false,stale:false,node:null,statement:null};
    }
    if(!isMeshNodeAdvertisement(node)||node.nodeId!==nodeId)return {path,sha:loaded.sha,valid:false,signed,identityTrusted:false,stale:false,node:null,statement};
    const stale=Date.parse(node.heartbeatAt)<new Date(now).getTime()-maxAgeMs;
    return {path,sha:loaded.sha,valid:true,signed,identityTrusted,stale,node,statement};
  }

  async listNodes({now=new Date(),maxAgeMs=5*60*1000,includeStale=false,clockSkewMs=60000}={}){
    if(!Number.isInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>24*60*60*1000)throw new Error("invalid mesh node maxAgeMs");
    const cutoff=new Date(now).getTime()-maxAgeMs;
    const nodes=[];
    for(const item of (await this.store.list(this.path("nodes"))).filter(value=>value?.name?.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name))){
      try{
        const loaded=await this.store.getJson(item.path);
        if(!loaded)continue;
        let node=null,statement=null,signed=false,identityTrusted=false;
        try{
          verifySignedMeshNodeAdvertisement(loaded.value,{now,clockSkewMs});
          statement=loaded.value;
          node=statement.payload;
          signed=true;
          if(this.trustStore){
            try{
              this.trustStore.verify(statement,{expectedDomain:MESH_NODE_ADVERTISEMENT_DOMAIN,expectedNodeId:node.nodeId,now,clockSkewMs});
              identityTrusted=true;
            }catch(error){
              if(this.identityPolicy==="require-trusted")throw error;
            }
          }
        }catch(error){
          if(this.identityPolicy!=="legacy")continue;
          if(!isMeshNodeAdvertisement(loaded.value))continue;
          node=loaded.value;
        }
        if(this.identityPolicy==="require-signed"&&!signed)continue;
        if(this.identityPolicy==="require-trusted"&&(!signed||!identityTrusted))continue;
        if(!isMeshNodeAdvertisement(node))continue;
        const stale=Date.parse(node.heartbeatAt)<cutoff;
        if(stale&&!includeStale)continue;
        nodes.push({path:item.path,node,sha:loaded.sha,stale,signed,identity:statement?.signer??null,identityTrusted,statement});
      }catch{}
    }
    return nodes;
  }

  async enqueueEnvelope(nodeId,envelope,{notify=true}={}){
    safeId(nodeId,"mesh target node");
    verifyMeshEnvelope(envelope);
    const path=this.path("queues",nodeId,`${envelope.requestId}.json`);
    if(await this.store.get(path))return false;
    const stored=await this.store.putJson(path,envelope,{message:`mesh: enqueue ${envelope.requestId} for ${nodeId}`});
    if(stored&&notify)await this.notifyNode(nodeId,envelope.requestId);
    return stored;
  }

  async listEnvelopes(nodeId){
    safeId(nodeId,"mesh target node");
    const values=[];
    for(const item of (await this.store.list(this.path("queues",nodeId))).filter(value=>value?.name?.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name))){
      try{
        const loaded=await this.store.getJson(item.path);
        if(!loaded)continue;
        verifyMeshEnvelope(loaded.value);
        values.push({path:item.path,envelope:loaded.value,sha:loaded.sha});
      }catch{}
    }
    return values;
  }

  async claimEnvelope(nodeId,requestId,processorId,{leaseMs=120000,now=new Date()}={}){
    safeId(nodeId,"mesh target node");safeId(requestId,"mesh request id");safeId(processorId,"mesh processor id");
    if(!Number.isInteger(leaseMs)||leaseMs<5000||leaseMs>15*60*1000)throw new Error("invalid mesh claim leaseMs");
    const path=this.path("claims",nodeId,`${requestId}.json`);
    const current=await this.store.getJson(path);
    if(current&&activeClaim(current.value,now))return null;
    const attempt=current?(Number(current.value.attempt)||0)+1:1;
    const claimedAt=new Date(now).toISOString();
    const claim={
      format:CLAIM_FORMAT,
      meshVersion:1,
      nodeId,
      requestId,
      processorId,
      attempt,
      claimedAt,
      leaseUntil:new Date(new Date(now).getTime()+leaseMs).toISOString()
    };
    const stored=await this.store.putJson(path,claim,{sha:current?.sha,message:`mesh: claim ${requestId} at ${nodeId} by ${processorId}`});
    return stored?claim:null;
  }

  async getResult(requestId){
    safeId(requestId,"mesh request id");
    const path=this.path("results",`${requestId}.json`);
    const loaded=await this.store.getJson(path);
    if(!loaded)return null;
    verifyMeshResult(loaded.value);
    return {path,result:loaded.value,sha:loaded.sha};
  }

  async writeResult(result){
    verifyMeshResult(result);
    const path=this.path("results",`${result.requestId}.json`);
    if(await this.store.get(path))return false;
    return this.store.putJson(path,result,{message:`mesh: result ${result.requestId} ${result.result?.status||"unknown"}`});
  }

  async waitForResult(requestId,{waitTimeoutMs=180000,pollIntervalMs=1000,sleepImpl=defaultSleep,now=Date.now}={}){
    safeId(requestId,"mesh request id");
    if(!Number.isInteger(waitTimeoutMs)||waitTimeoutMs<1000||waitTimeoutMs>15*60*1000)throw new Error("invalid mesh wait timeout");
    if(!Number.isInteger(pollIntervalMs)||pollIntervalMs<100||pollIntervalMs>30000)throw new Error("invalid mesh poll interval");
    if(typeof sleepImpl!=="function"||typeof now!=="function")throw new Error("invalid mesh wait clock");
    const deadline=now()+waitTimeoutMs;
    for(;;){
      const loaded=await this.getResult(requestId);
      if(loaded)return loaded.result;
      if(now()>=deadline)throw new Error(`timed out waiting for mesh result: ${requestId}`);
      await sleepImpl(pollIntervalMs);
    }
  }

  remotePeer(nodeId,{capabilities:localCapabilities=[],reachableCapabilities=localCapabilities,waitTimeoutMs=180000,pollIntervalMs=1000,sleepImpl=defaultSleep,now=Date.now}={}){
    safeId(nodeId,"mesh peer node");
    const advertisedCapabilities=capabilities(localCapabilities);
    const advertisedReachable=capabilities(reachableCapabilities);
    return {
      nodeId,
      capabilities:advertisedCapabilities,
      reachableCapabilities:advertisedReachable,
      forward:async envelope=>{
        verifyMeshEnvelope(envelope);
        const existing=await this.getResult(envelope.requestId);
        if(existing)return existing.result;
        await this.enqueueEnvelope(nodeId,envelope,{notify:true});
        return this.waitForResult(envelope.requestId,{waitTimeoutMs,pollIntervalMs,sleepImpl,now});
      }
    };
  }

  async notifyNode(nodeId,requestId){
    safeId(nodeId,"mesh target node");safeId(requestId,"mesh request id");
    await this.store.request(this.store.repoUrl("dispatches"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({event_type:"arca_mesh_available",client_payload:{target_ref:this.ref,node_id:nodeId,request_id:requestId}})
    });
    return true;
  }
}
