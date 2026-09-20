import {createHash} from "node:crypto";
import {assertMachineBridgeJobV3} from "./protocol-v3.mjs";
import {
  MESH_RECEIPT_DOMAIN,
  signMeshReceipt,
  verifySignedMeshReceipt
} from "./mesh-identity.mjs";

const SAFE_NAME=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const ENVELOPE_FORMAT="arca-mesh-envelope-v1";
const RESULT_FORMAT="arca-mesh-result-v1";

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function stableStringify(value){return JSON.stringify(stableValue(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stableStringify(value)).digest("hex")}
function normalizeCapabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("capabilities must be an array");
  const out=[...new Set(values.map(String).map(value=>value.trim()).filter(Boolean))].sort();
  if(out.some(value=>value.length>160))throw new Error("capability too long");
  return out;
}
function assertSafeName(value,label){if(!SAFE_NAME.test(value||""))throw new Error(`invalid ${label}`);return value}
function asDate(value,label){const time=Date.parse(value);if(!Number.isFinite(time))throw new Error(`invalid ${label}`);return time}
function hasAll(have,need){const set=new Set(have);return need.every(value=>set.has(value))}
function normalizeRequestOwnership(value){
  if(value===null||value===undefined)return null;
  for(const method of ["beginForward","completeForward","failForward"])if(typeof value?.[method]!=="function")throw new TypeError("mesh requestOwnership."+method+"() required");
  return value;
}

function receiptBody({nodeId,nextNode,hop,requestId,jobId,forwardedAt,previousHash,ownershipBindingHash}){
  const body={nodeId,nextNode,hop,requestId,jobId,forwardedAt,previousHash};
  if(ownershipBindingHash!==undefined){
    if(typeof ownershipBindingHash!=="string"||!HASH.test(ownershipBindingHash))throw new Error("invalid mesh ownership binding hash");
    body.ownershipBindingHash=ownershipBindingHash;
  }
  return body;
}
function signedReceiptPayload(receipt){
  const body=receiptBody(receipt);
  return {...body,receiptHash:receipt.receiptHash};
}
function verifyReceiptSignature(receipt,{requireSignedReceipts=false,trustStore=null}={}){
  if(!receipt?.signedReceipt){
    if(requireSignedReceipts)throw new Error("mesh signed receipt required");
    return true;
  }
  verifySignedMeshReceipt(receipt.signedReceipt,{now:new Date(receipt.forwardedAt),clockSkewMs:0});
  if(stableStringify(receipt.signedReceipt.payload)!==stableStringify(signedReceiptPayload(receipt)))throw new Error("mesh signed receipt payload mismatch");
  if(trustStore){
    if(typeof trustStore.verify!=="function")throw new TypeError("mesh trust store verify() required");
    trustStore.verify(receipt.signedReceipt,{expectedDomain:MESH_RECEIPT_DOMAIN,expectedNodeId:receipt.nodeId,now:new Date(receipt.forwardedAt),clockSkewMs:0});
  }
  return true;
}
async function appendHop(envelope,{nodeId,nextNode,now,receiptSigner=null,ownershipBindingHash=undefined}){
  const previousHash=envelope.receipts.at(-1)?.receiptHash||envelope.payloadHash;
  const body=receiptBody({
    nodeId,
    nextNode,
    hop:envelope.route.length+1,
    requestId:envelope.requestId,
    jobId:envelope.job.jobId,
    forwardedAt:now.toISOString(),
    previousHash,
    ...(ownershipBindingHash===undefined?{}:{ownershipBindingHash})
  });
  let receipt={...body,receiptHash:sha256(body)};
  if(receiptSigner){
    const remaining=Math.max(1000,Math.min(24*60*60*1000,asDate(envelope.expiresAt,"expiresAt")-now.getTime()));
    const signedReceipt=typeof receiptSigner.signReceipt==="function"
      ?await receiptSigner.signReceipt(receipt,{issuedAt:now,ttlMs:remaining})
      :signMeshReceipt(receipt,receiptSigner,{issuedAt:now,ttlMs:remaining});
    receipt={...receipt,signedReceipt};
  }
  return {...envelope,route:[...envelope.route,nodeId],receipts:[...envelope.receipts,receipt]};
}

export function createMeshEnvelope(job,{originNode,requiredCapabilities=job?.requires||[],maxHops=8,ttlMs=10*60*1000,now=new Date()}={}){
  assertMachineBridgeJobV3(job);
  if(typeof job.requestId!=="string"||!job.requestId)throw new Error("mesh requires requestId");
  assertSafeName(originNode,"origin node");
  if(!Number.isInteger(maxHops)||maxHops<1||maxHops>32)throw new Error("invalid maxHops");
  if(!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>24*60*60*1000)throw new Error("invalid ttlMs");
  const createdAt=new Date(now).toISOString();
  const expiresAt=new Date(new Date(now).getTime()+ttlMs).toISOString();
  return {
    format:ENVELOPE_FORMAT,
    meshVersion:1,
    requestId:job.requestId,
    originNode,
    requiredCapabilities:normalizeCapabilities(requiredCapabilities),
    maxHops,
    createdAt,
    expiresAt,
    payloadHash:sha256(job),
    job,
    route:[],
    receipts:[]
  };
}

export function verifyMeshEnvelope(envelope,options={}){
  if(!envelope||typeof envelope!=="object"||Array.isArray(envelope))throw new Error("invalid mesh envelope");
  if(envelope.format!==ENVELOPE_FORMAT||envelope.meshVersion!==1)throw new Error("unsupported mesh envelope");
  assertSafeName(envelope.requestId,"requestId");
  assertSafeName(envelope.originNode,"origin node");
  if(!Array.isArray(envelope.route)||!Array.isArray(envelope.receipts)||envelope.route.length!==envelope.receipts.length)throw new Error("invalid mesh route");
  if(!Number.isInteger(envelope.maxHops)||envelope.maxHops<1||envelope.maxHops>32)throw new Error("invalid maxHops");
  normalizeCapabilities(envelope.requiredCapabilities);
  asDate(envelope.createdAt,"createdAt");
  asDate(envelope.expiresAt,"expiresAt");
  assertMachineBridgeJobV3(envelope.job);
  if(envelope.job.requestId!==envelope.requestId)throw new Error("mesh request correlation mismatch");
  if(envelope.payloadHash!==sha256(envelope.job))throw new Error("mesh payload hash mismatch");
  let previousHash=envelope.payloadHash;
  for(let index=0;index<envelope.receipts.length;index+=1){
    const receipt=envelope.receipts[index];
    const nodeId=envelope.route[index];
    if(!receipt||typeof receipt!=="object"||receipt.nodeId!==nodeId)throw new Error("mesh receipt route mismatch");
    assertSafeName(receipt.nodeId,"receipt node");
    assertSafeName(receipt.nextNode,"receipt next node");
    if(receipt.hop!==index+1||receipt.requestId!==envelope.requestId||receipt.jobId!==envelope.job.jobId)throw new Error("mesh receipt correlation mismatch");
    asDate(receipt.forwardedAt,"receipt forwardedAt");
    if(receipt.previousHash!==previousHash)throw new Error("mesh receipt chain mismatch");
    const body=receiptBody(receipt);
    if(receipt.receiptHash!==sha256(body))throw new Error("mesh receipt hash mismatch");
    verifyReceiptSignature(receipt,options);
    previousHash=receipt.receiptHash;
  }
  return true;
}

export function meshIncomingOwnershipBinding(envelope,{nodeId}={}){
  if(!envelope||!Array.isArray(envelope.receipts)||!envelope.receipts.length)throw new Error("mesh ownership binding receipt required");
  const receipt=envelope.receipts.at(-1);
  if(nodeId!==undefined&&receipt.nextNode!==nodeId)throw new Error("mesh ownership binding target mismatch");
  if(typeof receipt.ownershipBindingHash!=="string"||!HASH.test(receipt.ownershipBindingHash))throw new Error("mesh ownership binding hash required");
  return Object.freeze({
    bindingHash:receipt.ownershipBindingHash,
    relayNodeId:receipt.nodeId,
    selectedNodeId:receipt.nextNode,
    requestId:receipt.requestId,
    jobId:receipt.jobId,
    receiptHash:receipt.receiptHash,
    signed:!!receipt.signedReceipt
  });
}

export function verifyMeshResult(value,options={}){
  if(!value||typeof value!=="object"||Array.isArray(value)||value.format!==RESULT_FORMAT||value.meshVersion!==1)throw new Error("invalid mesh result");
  assertSafeName(value.requestId,"result requestId");
  assertSafeName(value.jobId,"result jobId");
  if(!Array.isArray(value.route)||!Array.isArray(value.replyRoute)||value.replyRoute.join("\u0000")!==[...value.route].reverse().join("\u0000"))throw new Error("invalid mesh reply route");
  if(!value.result||value.result.jobId!==value.jobId||value.result.requestId!==value.requestId)throw new Error("mesh result correlation mismatch");
  if(!Array.isArray(value.receipts)||value.receipts.length!==value.route.length)throw new Error("invalid mesh result receipts");
  for(const receipt of value.receipts)verifyReceiptSignature(receipt,options);
  const expected=sha256({requestId:value.requestId,jobId:value.jobId,route:value.route,replyRoute:value.replyRoute,result:value.result,receipts:value.receipts});
  if(value.resultHash!==expected)throw new Error("mesh result hash mismatch");
  return true;
}

function normalizePeer(peer){
  if(!peer||typeof peer!=="object")throw new TypeError("invalid mesh peer");
  assertSafeName(peer.nodeId,"peer node");
  if(typeof peer.forward!=="function")throw new TypeError("mesh peer forward required");
  return {
    nodeId:peer.nodeId,
    capabilities:normalizeCapabilities(peer.capabilities||[]),
    reachableCapabilities:normalizeCapabilities(peer.reachableCapabilities||peer.capabilities||[]),
    forward:peer.forward
  };
}

export class MachineBridgeMeshRelay{
  #peers=new Map();
  constructor({nodeId,peers=[],now=()=>new Date(),receiptSigner=null,requireSignedReceipts=false,trustStore=null,peerSelector=null,requestOwnership=null}={}){
    this.nodeId=assertSafeName(nodeId,"relay node");
    if(typeof now!=="function")throw new TypeError("relay clock required");
    this.now=now;
    this.receiptSigner=receiptSigner;
    this.requireSignedReceipts=requireSignedReceipts===true;
    this.trustStore=trustStore;
    if(peerSelector!==null&&typeof peerSelector!=="function")throw new TypeError("mesh peerSelector must be a function");
    this.peerSelector=peerSelector;
    this.requestOwnership=normalizeRequestOwnership(requestOwnership);
    for(const peer of peers)this.addPeer(peer);
  }
  addPeer(peer){const normalized=normalizePeer(peer);if(normalized.nodeId===this.nodeId)throw new Error("relay cannot peer with itself");this.#peers.set(normalized.nodeId,normalized);return this}
  advertise(){
    return {nodeId:this.nodeId,capabilities:["mesh.relay"],reachableCapabilities:[...new Set([...this.#peers.values()].flatMap(peer=>peer.reachableCapabilities))].sort(),forward:envelope=>this.forward(envelope)};
  }
  async forward(envelope){
    verifyMeshEnvelope(envelope,{requireSignedReceipts:this.requireSignedReceipts,trustStore:this.trustStore});
    const now=new Date(this.now());
    if(now.getTime()>=asDate(envelope.expiresAt,"expiresAt"))throw new Error("mesh envelope expired");
    if(envelope.route.includes(this.nodeId))throw new Error(`mesh loop detected at ${this.nodeId}`);
    if(envelope.route.length>=envelope.maxHops)throw new Error("mesh max hops exceeded");
    const visited=new Set([envelope.originNode,...envelope.route,this.nodeId]);
    const candidates=[...this.#peers.values()]
      .filter(peer=>!visited.has(peer.nodeId)&&hasAll(peer.reachableCapabilities,envelope.requiredCapabilities))
      .sort((a,b)=>a.nodeId.localeCompare(b.nodeId));
    if(!candidates.length)throw new Error(`mesh no route from ${this.nodeId}`);
    let peer=candidates[0];
    if(this.peerSelector){
      const descriptors=candidates.map(candidate=>Object.freeze({
        nodeId:candidate.nodeId,
        capabilities:Object.freeze([...candidate.capabilities]),
        reachableCapabilities:Object.freeze([...candidate.reachableCapabilities])
      }));
      const selected=await this.peerSelector(Object.freeze({
        relayNodeId:this.nodeId,
        candidates:Object.freeze(descriptors),
        requiredCapabilities:Object.freeze([...envelope.requiredCapabilities]),
        requestId:envelope.requestId,
        jobId:envelope.job.jobId,
        now:new Date(now)
      }));
      const selectedNodeId=typeof selected==="string"?selected:selected?.nodeId;
      if(typeof selectedNodeId!=="string"||!selectedNodeId)throw new Error("mesh peer selector returned invalid selection");
      peer=candidates.find(candidate=>candidate.nodeId===selectedNodeId);
      if(!peer)throw new Error("mesh peer selector returned unavailable candidate");
    }
    if(!this.requestOwnership){
      const next=await appendHop(envelope,{nodeId:this.nodeId,nextNode:peer.nodeId,now,receiptSigner:this.receiptSigner});
      return peer.forward(next);
    }
    const context=Object.freeze({
      relayNodeId:this.nodeId,
      selectedNodeId:peer.nodeId,
      requestId:envelope.requestId,
      jobId:envelope.job.jobId,
      payloadHash:envelope.payloadHash,
      now:new Date(now)
    });
    let token,next;
    if(typeof this.requestOwnership.reserveForward==="function"&&typeof this.requestOwnership.markForwardStarted==="function"){
      token=await this.requestOwnership.reserveForward(context);
      next=await appendHop(envelope,{
        nodeId:this.nodeId,
        nextNode:peer.nodeId,
        now,
        receiptSigner:this.receiptSigner,
        ownershipBindingHash:token.bindingHash
      });
      await this.requestOwnership.markForwardStarted(token,{now:new Date(now)});
    }else{
      next=await appendHop(envelope,{nodeId:this.nodeId,nextNode:peer.nodeId,now,receiptSigner:this.receiptSigner});
      token=await this.requestOwnership.beginForward(context);
    }
    try{
      const result=await peer.forward(next);
      await this.requestOwnership.completeForward(token,result,{now:new Date(this.now())});
      return result;
    }catch(error){
      try{await this.requestOwnership.failForward(token,error,{now:new Date(this.now())})}catch{}
      throw error;
    }
  }
}

export class MachineBridgeMeshEndpoint{
  constructor({nodeId,capabilities=[],client,now=()=>new Date(),receiptSigner=null,requireSignedReceipts=false,trustStore=null}={}){
    this.nodeId=assertSafeName(nodeId,"endpoint node");
    this.capabilities=normalizeCapabilities(capabilities);
    if(!client||typeof client.call!=="function")throw new TypeError("endpoint direct-call client required");
    if(typeof now!=="function")throw new TypeError("endpoint clock required");
    this.client=client;this.now=now;this.receiptSigner=receiptSigner;this.requireSignedReceipts=requireSignedReceipts===true;this.trustStore=trustStore;
  }
  advertise(){return {nodeId:this.nodeId,capabilities:[...this.capabilities],reachableCapabilities:[...this.capabilities],forward:envelope=>this.forward(envelope)}}
  async forward(envelope){
    verifyMeshEnvelope(envelope,{requireSignedReceipts:this.requireSignedReceipts,trustStore:this.trustStore});
    const now=new Date(this.now());
    if(now.getTime()>=asDate(envelope.expiresAt,"expiresAt"))throw new Error("mesh envelope expired");
    if(envelope.route.includes(this.nodeId))throw new Error(`mesh loop detected at ${this.nodeId}`);
    if(envelope.route.length>=envelope.maxHops)throw new Error("mesh max hops exceeded");
    if(!hasAll(this.capabilities,envelope.requiredCapabilities))throw new Error(`mesh endpoint capability mismatch: ${this.nodeId}`);
    const routed=await appendHop(envelope,{nodeId:this.nodeId,nextNode:"local-executor",now,receiptSigner:this.receiptSigner});
    const result=await this.client.call(routed.job);
    if(!result||result.jobId!==routed.job.jobId||result.requestId!==routed.requestId)throw new Error("mesh downstream correlation mismatch");
    const replyRoute=[...routed.route].reverse();
    const value={
      format:RESULT_FORMAT,
      meshVersion:1,
      requestId:routed.requestId,
      jobId:routed.job.jobId,
      route:routed.route,
      replyRoute,
      receipts:routed.receipts,
      result
    };
    value.resultHash=sha256({requestId:value.requestId,jobId:value.jobId,route:value.route,replyRoute:value.replyRoute,result:value.result,receipts:value.receipts});
    verifyMeshResult(value,{requireSignedReceipts:this.requireSignedReceipts,trustStore:this.trustStore});
    return value;
  }
}

export class MachineBridgeMeshClient{
  constructor({originNode,entry,now=()=>new Date(),requireSignedReceipts=false,trustStore=null}={}){
    this.originNode=assertSafeName(originNode,"origin node");
    if(!entry||typeof entry.forward!=="function")throw new TypeError("mesh entry required");
    if(typeof now!=="function")throw new TypeError("mesh client clock required");
    this.entry=entry;this.now=now;this.requireSignedReceipts=requireSignedReceipts===true;this.trustStore=trustStore;
  }
  async call(job,{requiredCapabilities=job?.requires||[],maxHops=8,ttlMs=10*60*1000}={}){
    const envelope=createMeshEnvelope(job,{originNode:this.originNode,requiredCapabilities,maxHops,ttlMs,now:new Date(this.now())});
    const result=await this.entry.forward(envelope);
    verifyMeshResult(result,{requireSignedReceipts:this.requireSignedReceipts,trustStore:this.trustStore});
    if(result.requestId!==job.requestId||result.jobId!==job.jobId)throw new Error("mesh caller correlation mismatch");
    return result;
  }
}
