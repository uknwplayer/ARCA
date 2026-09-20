import {federationPeerBindingHash} from "./federation-peer-health.mjs";

export const ARCA_FEDERATION_SELECTION_DECISION_FORMAT="arca-federation-selection-decision-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const HEALTH_RANK=Object.freeze({healthy:0,unknown:1,degraded:2});

function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function normalizeCapabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("federation selector capabilities must be an array");
  const out=[...new Set(values.map(String).map(value=>value.trim()).filter(Boolean))].sort();
  if(out.some(value=>value.length>160))throw new Error("federation selector capability too long");
  return out;
}
function hasAll(have,need){
  const set=new Set(have);
  return need.every(value=>set.has(value));
}
function bindingFromRecord(record){
  if(!record||typeof record!=="object"||Array.isArray(record))throw new TypeError("federation selector peer record required");
  if(record.status!=="active")throw new Error("federation selector requires active peer record");
  const peerId=safeId(record.peerId,"federation selector peerId");
  const nodeId=safeId(record.nodeId,"federation selector nodeId");
  const bindingHash=federationPeerBindingHash(record);
  return Object.freeze({peerId,nodeId,bindingHash});
}
function normalizeBinding(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("federation selector binding required");
  const peerId=safeId(value.peerId,"federation selector peerId");
  const nodeId=safeId(value.nodeId,"federation selector nodeId");
  const bindingHash=String(value.bindingHash||"");
  if(!HASH.test(bindingHash))throw new Error("invalid federation selector bindingHash");
  return Object.freeze({peerId,nodeId,bindingHash});
}
function normalizeCandidate(candidate){
  if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))throw new TypeError("invalid federation selector candidate");
  return Object.freeze({
    nodeId:safeId(candidate.nodeId,"federation selector candidate nodeId"),
    capabilities:normalizeCapabilities(candidate.capabilities||[]),
    reachableCapabilities:normalizeCapabilities(candidate.reachableCapabilities||candidate.capabilities||[])
  });
}

export class FederationPeerSelector{
  #bindings=new Map();

  constructor({healthStore,bindings=[],records=[],now=()=>new Date()}={}){
    if(!healthStore||typeof healthStore.status!=="function")throw new TypeError("federation selector healthStore.status() required");
    if(typeof now!=="function")throw new TypeError("federation selector clock required");
    this.healthStore=healthStore;
    this.now=now;
    for(const binding of bindings)this.addBinding(binding);
    for(const record of records)this.addPeerRecord(record);
  }

  static async fromCatalog({catalog,peerIds,healthStore,now=()=>new Date()}={}){
    if(!catalog||typeof catalog.get!=="function")throw new TypeError("federation selector catalog.get() required");
    if(!Array.isArray(peerIds)||!peerIds.length)throw new Error("federation selector explicit peerIds required");
    const records=[];
    for(const value of peerIds){
      const peerId=safeId(value,"federation selector peerId");
      const record=await catalog.get(peerId);
      if(!record)throw new Error("federation selector peer not found in catalog: "+peerId);
      if(record.status!=="active")throw new Error("federation selector peer disabled: "+peerId);
      records.push(record);
    }
    return new FederationPeerSelector({healthStore,records,now});
  }

  addBinding(binding){
    const normalized=normalizeBinding(binding);
    const existing=this.#bindings.get(normalized.nodeId);
    if(existing&&(existing.peerId!==normalized.peerId||existing.bindingHash!==normalized.bindingHash))throw new Error("federation selector node binding conflict: "+normalized.nodeId);
    this.#bindings.set(normalized.nodeId,normalized);
    return this;
  }

  addPeerRecord(record){
    return this.addBinding(bindingFromRecord(record));
  }

  removeNode(nodeId){
    this.#bindings.delete(safeId(nodeId,"federation selector nodeId"));
    return this;
  }

  bindings(){
    return [...this.#bindings.values()].map(value=>({...value})).sort((a,b)=>a.peerId.localeCompare(b.peerId)||a.nodeId.localeCompare(b.nodeId));
  }

  async select({candidates,requiredCapabilities=[],now=null,requestId=null,jobId=null}={}){
    if(!Array.isArray(candidates)||!candidates.length)throw new Error("federation selector candidates required");
    const required=normalizeCapabilities(requiredCapabilities);
    const when=new Date(now===null?this.now():now);
    if(!Number.isFinite(when.getTime()))throw new Error("invalid federation selector time");
    const normalized=candidates.map(normalizeCandidate);

    const evaluations=[];
    for(const candidate of normalized){
      const binding=this.#bindings.get(candidate.nodeId);
      if(!binding)throw new Error("federation selector candidate is not explicitly bound: "+candidate.nodeId);
      if(!hasAll(candidate.reachableCapabilities,required))continue;
      const health=await this.healthStore.status(binding.peerId,{bindingHash:binding.bindingHash,now:when});
      if(!Object.hasOwn(HEALTH_RANK,health.state)&&health.state!=="cooldown")throw new Error("unsupported federation selector health state: "+health.state);
      evaluations.push(Object.freeze({candidate,binding,health}));
    }

    if(!evaluations.length)throw new Error("federation selector has no capability-compatible candidate");

    const attemptable=evaluations.filter(value=>value.health.canAttempt&&value.health.state!=="cooldown");
    if(!attemptable.length){
      const retryAt=evaluations
        .map(value=>value.health.retryAt)
        .filter(Boolean)
        .sort()[0]||null;
      const error=new Error("federation selector has no attemptable peer");
      error.code="ARCA_FEDERATION_NO_ATTEMPTABLE_PEER";
      error.retryAt=retryAt;
      throw error;
    }

    attemptable.sort((a,b)=>{
      const healthRank=(HEALTH_RANK[a.health.state]??99)-(HEALTH_RANK[b.health.state]??99);
      if(healthRank)return healthRank;
      const failures=(a.health.consecutiveFailures||0)-(b.health.consecutiveFailures||0);
      if(failures)return failures;
      const peer=a.binding.peerId.localeCompare(b.binding.peerId);
      if(peer)return peer;
      return a.candidate.nodeId.localeCompare(b.candidate.nodeId);
    });

    const selected=attemptable[0];
    return Object.freeze({
      format:ARCA_FEDERATION_SELECTION_DECISION_FORMAT,
      version:1,
      selectedNodeId:selected.candidate.nodeId,
      selectedPeerId:selected.binding.peerId,
      healthState:selected.health.state,
      consecutiveFailures:selected.health.consecutiveFailures||0,
      candidateCount:evaluations.length,
      attemptableCount:attemptable.length,
      requiredCapabilities:Object.freeze([...required]),
      requestId:requestId===null?null:safeId(requestId,"federation selector requestId"),
      jobId:jobId===null?null:safeId(jobId,"federation selector jobId"),
      evaluatedAt:when.toISOString()
    });
  }

  asMeshPeerSelector(){
    return async context=>{
      const decision=await this.select(context);
      return decision.selectedNodeId;
    };
  }
}
