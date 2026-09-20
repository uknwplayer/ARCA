import {createHash} from "node:crypto";
import {mkdir,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";

export const ARCA_FEDERATION_PEER_HEALTH_FORMAT="arca-federation-peer-health-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const FAILURE_CATEGORIES=new Set(["timeout","unavailable","transport","remote","protocol","unknown"]);
const MAX_RECORD_BYTES=32*1024;

const DEFAULT_POLICY=Object.freeze({
  cooldownAfterFailures:2,
  baseCooldownMs:5_000,
  maxCooldownMs:5*60_000,
  maxConsecutiveFailures:32
});

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function sha256(value){
  return createHash("sha256").update(typeof value==="string"?value:JSON.stringify(stableValue(value))).digest("hex");
}
function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function validDate(value,label){
  const time=Date.parse(value);
  if(!Number.isFinite(time))throw new Error("invalid "+label);
  return time;
}
function optionalDate(value,label){
  if(value===null)return null;
  return new Date(validDate(value,label)).toISOString();
}
function normalizePolicy(policy={}){
  const out={...DEFAULT_POLICY,...policy};
  if(!Number.isSafeInteger(out.cooldownAfterFailures)||out.cooldownAfterFailures<1||out.cooldownAfterFailures>32)throw new Error("invalid federation health cooldownAfterFailures");
  if(!Number.isSafeInteger(out.baseCooldownMs)||out.baseCooldownMs<100||out.baseCooldownMs>60*60_000)throw new Error("invalid federation health baseCooldownMs");
  if(!Number.isSafeInteger(out.maxCooldownMs)||out.maxCooldownMs<out.baseCooldownMs||out.maxCooldownMs>24*60*60_000)throw new Error("invalid federation health maxCooldownMs");
  if(!Number.isSafeInteger(out.maxConsecutiveFailures)||out.maxConsecutiveFailures<out.cooldownAfterFailures||out.maxConsecutiveFailures>10_000)throw new Error("invalid federation health maxConsecutiveFailures");
  return Object.freeze(out);
}
function normalizeBindingHash(value){
  if(typeof value!=="string"||!HASH.test(value))throw new Error("invalid federation health bindingHash");
  return value;
}
function normalizeFailureCategory(value){
  const category=String(value??"unknown").trim().toLowerCase();
  return FAILURE_CATEGORIES.has(category)?category:"unknown";
}
function bodyForHash(record){
  const {recordHash:_ignored,...body}=record;
  return body;
}
function seal(record){
  const clean=JSON.parse(JSON.stringify(record));
  return {...clean,recordHash:sha256(clean)};
}
function validate(record){
  if(!plain(record)||record.format!==ARCA_FEDERATION_PEER_HEALTH_FORMAT||record.version!==1)throw new Error("invalid federation peer health record");
  safeId(record.peerId,"federation health peerId");
  normalizeBindingHash(record.bindingHash);
  if(!Number.isSafeInteger(record.revision)||record.revision<1)throw new Error("invalid federation health revision");
  if(!Number.isSafeInteger(record.consecutiveFailures)||record.consecutiveFailures<0)throw new Error("invalid federation health consecutiveFailures");
  if(!Number.isSafeInteger(record.totalFailures)||record.totalFailures<0)throw new Error("invalid federation health totalFailures");
  if(!Number.isSafeInteger(record.totalSuccesses)||record.totalSuccesses<0)throw new Error("invalid federation health totalSuccesses");
  optionalDate(record.lastAttemptAt,"federation health lastAttemptAt");
  optionalDate(record.lastSuccessAt,"federation health lastSuccessAt");
  optionalDate(record.lastFailureAt,"federation health lastFailureAt");
  optionalDate(record.cooldownUntil,"federation health cooldownUntil");
  if(record.lastFailureCategory!==null&&!FAILURE_CATEGORIES.has(record.lastFailureCategory))throw new Error("invalid federation health failure category");
  validDate(record.createdAt,"federation health createdAt");
  validDate(record.updatedAt,"federation health updatedAt");
  if(typeof record.recordHash!=="string"||!HASH.test(record.recordHash)||sha256(bodyForHash(record))!==record.recordHash)throw new Error("federation peer health record hash mismatch");
  return record;
}
async function atomicWrite(path,value){
  const serialized=JSON.stringify(value,null,2)+"\n";
  if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error("federation peer health record too large");
  const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});
  await rename(tmp,path);
}
function isoNow(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid federation health time");
  return date;
}
function cooldownMsFor(consecutiveFailures,policy){
  if(consecutiveFailures<policy.cooldownAfterFailures)return 0;
  const exponent=Math.min(30,consecutiveFailures-policy.cooldownAfterFailures);
  return Math.min(policy.maxCooldownMs,policy.baseCooldownMs*(2**exponent));
}
function classifyPeerError(error){
  const message=String(error?.message||"").toLowerCase();
  if(message.includes("timed out")||message.includes("timeout"))return "timeout";
  if(message.includes("no route")||message.includes("not found")||message.includes("unavailable"))return "unavailable";
  if(error?.status===429||Number(error?.status)>=500)return "transport";
  if(error?.name==="TypeError"&&(message.includes("fetch")||message.includes("network")))return "transport";
  if(message.includes("signature")||message.includes("hash mismatch")||message.includes("correlation mismatch")||message.includes("protocol"))return "protocol";
  return "remote";
}

export function federationPeerBindingHash(record){
  if(!plain(record))throw new TypeError("federation peer record required for health binding");
  safeId(record.nodeId,"federation health nodeId");
  if(!plain(record.transport)||!plain(record.identity))throw new Error("federation peer binding incomplete");
  const binding={
    nodeId:record.nodeId,
    transport:{
      kind:record.transport.kind,
      repository:record.transport.repository,
      ref:record.transport.ref,
      root:record.transport.root
    },
    identity:{
      identityId:record.identity.identityId,
      keyFingerprint:record.identity.keyFingerprint
    }
  };
  return sha256(binding);
}

export function federationPeerEffectiveHealth(record,{bindingHash,now=new Date()}={}){
  const expected=normalizeBindingHash(bindingHash);
  const current=new Date(now);
  if(!Number.isFinite(current.getTime()))throw new Error("invalid federation health status time");
  if(record)validate(record);
  if(!record||record.bindingHash!==expected){
    return Object.freeze({
      state:"unknown",
      canAttempt:true,
      probe:false,
      waitMs:0,
      retryAt:null,
      consecutiveFailures:0,
      lastFailureCategory:null,
      bindingChanged:Boolean(record&&record.bindingHash!==expected)
    });
  }
  const cooldownUntil=record.cooldownUntil===null?null:Date.parse(record.cooldownUntil);
  if(cooldownUntil!==null&&cooldownUntil>current.getTime()){
    return Object.freeze({
      state:"cooldown",
      canAttempt:false,
      probe:false,
      waitMs:cooldownUntil-current.getTime(),
      retryAt:record.cooldownUntil,
      consecutiveFailures:record.consecutiveFailures,
      lastFailureCategory:record.lastFailureCategory,
      bindingChanged:false
    });
  }
  if(record.consecutiveFailures>0){
    return Object.freeze({
      state:"degraded",
      canAttempt:true,
      probe:cooldownUntil!==null,
      waitMs:0,
      retryAt:null,
      consecutiveFailures:record.consecutiveFailures,
      lastFailureCategory:record.lastFailureCategory,
      bindingChanged:false
    });
  }
  if(record.totalSuccesses>0){
    return Object.freeze({
      state:"healthy",
      canAttempt:true,
      probe:false,
      waitMs:0,
      retryAt:null,
      consecutiveFailures:0,
      lastFailureCategory:null,
      bindingChanged:false
    });
  }
  return Object.freeze({
    state:"unknown",
    canAttempt:true,
    probe:false,
    waitMs:0,
    retryAt:null,
    consecutiveFailures:0,
    lastFailureCategory:null,
    bindingChanged:false
  });
}

export class FederationPeerHealthStore{
  #updates=new Map();

  constructor({root,policy={}}={}){
    if(typeof root!=="string"||!root.trim())throw new TypeError("federation peer health root required");
    this.root=resolve(root);
    this.policy=normalizePolicy(policy);
  }

  async init(){await mkdir(this.root,{recursive:true});return this}
  path(peerId){return join(this.root,safeId(peerId,"federation health peerId")+".json")}

  async get(peerId){
    try{return validate(JSON.parse(await readFile(this.path(peerId),"utf8")))}
    catch(error){if(error?.code==="ENOENT")return null;throw error}
  }

  async list(){
    await this.init();
    const out=[];
    for(const name of (await readdir(this.root)).filter(value=>value.endsWith(".json")).sort()){
      const peerId=name.slice(0,-5);
      try{const record=await this.get(peerId);if(record)out.push(record)}catch{}
    }
    return out;
  }

  async status(peerId,{bindingHash,now=new Date()}={}){
    safeId(peerId,"federation health peerId");
    return federationPeerEffectiveHealth(await this.get(peerId),{bindingHash,now});
  }

  async assertAttemptAllowed(peerId,{bindingHash,now=new Date()}={}){
    const status=await this.status(peerId,{bindingHash,now});
    if(status.canAttempt)return status;
    const error=new Error(`federation peer cooldown active: ${peerId}`);
    error.code="ARCA_FEDERATION_PEER_COOLDOWN";
    error.retryAt=status.retryAt;
    error.waitMs=status.waitMs;
    throw error;
  }

  async #mutate(peerId,fn){
    await this.init();
    const key=safeId(peerId,"federation health peerId");
    const prior=this.#updates.get(key)||Promise.resolve();
    let release;
    const gate=new Promise(resolve=>{release=resolve});
    const chain=prior.then(()=>gate);
    this.#updates.set(key,chain);
    await prior;
    try{return await fn()}
    finally{
      release();
      if(this.#updates.get(key)===chain)this.#updates.delete(key);
    }
  }

  async recordSuccess(peerId,{bindingHash,now=new Date()}={}){
    const binding=normalizeBindingHash(bindingHash);
    const when=isoNow(now);
    return this.#mutate(peerId,async()=>{
      const current=await this.get(peerId);
      const same=current?.bindingHash===binding;
      const createdAt=same?current.createdAt:when.toISOString();
      const record=seal({
        format:ARCA_FEDERATION_PEER_HEALTH_FORMAT,
        version:1,
        peerId,
        bindingHash:binding,
        revision:same?current.revision+1:1,
        consecutiveFailures:0,
        totalFailures:same?current.totalFailures:0,
        totalSuccesses:(same?current.totalSuccesses:0)+1,
        lastAttemptAt:when.toISOString(),
        lastSuccessAt:when.toISOString(),
        lastFailureAt:same?current.lastFailureAt:null,
        lastFailureCategory:same?current.lastFailureCategory:null,
        cooldownUntil:null,
        createdAt,
        updatedAt:when.toISOString()
      });
      await atomicWrite(this.path(peerId),record);
      return record;
    });
  }

  async recordFailure(peerId,{bindingHash,category="unknown",now=new Date()}={}){
    const binding=normalizeBindingHash(bindingHash);
    const failureCategory=normalizeFailureCategory(category);
    const when=isoNow(now);
    return this.#mutate(peerId,async()=>{
      const current=await this.get(peerId);
      const same=current?.bindingHash===binding;
      const consecutive=Math.min(this.policy.maxConsecutiveFailures,(same?current.consecutiveFailures:0)+1);
      const cooldownMs=cooldownMsFor(consecutive,this.policy);
      const createdAt=same?current.createdAt:when.toISOString();
      const record=seal({
        format:ARCA_FEDERATION_PEER_HEALTH_FORMAT,
        version:1,
        peerId,
        bindingHash:binding,
        revision:same?current.revision+1:1,
        consecutiveFailures:consecutive,
        totalFailures:(same?current.totalFailures:0)+1,
        totalSuccesses:same?current.totalSuccesses:0,
        lastAttemptAt:when.toISOString(),
        lastSuccessAt:same?current.lastSuccessAt:null,
        lastFailureAt:when.toISOString(),
        lastFailureCategory:failureCategory,
        cooldownUntil:cooldownMs?new Date(when.getTime()+cooldownMs).toISOString():null,
        createdAt,
        updatedAt:when.toISOString()
      });
      await atomicWrite(this.path(peerId),record);
      return record;
    });
  }

  async wrapPeer(peerId,{bindingHash,peer,now=()=>new Date()}={}){
    const binding=normalizeBindingHash(bindingHash);
    safeId(peerId,"federation health peerId");
    if(!peer||typeof peer.forward!=="function")throw new TypeError("federation health peer forward required");
    if(typeof now!=="function")throw new TypeError("federation health clock required");
    const store=this;
    return Object.freeze({
      ...peer,
      health:Object.freeze({peerId,bindingHash:binding}),
      forward:async envelope=>{
        await store.assertAttemptAllowed(peerId,{bindingHash:binding,now:new Date(now())});
        try{
          const result=await peer.forward(envelope);
          await store.recordSuccess(peerId,{bindingHash:binding,now:new Date(now())});
          return result;
        }catch(error){
          await store.recordFailure(peerId,{bindingHash:binding,category:classifyPeerError(error),now:new Date(now())});
          throw error;
        }
      }
    });
  }
}

export function federationResolutionFailureCategory(error){
  const message=String(error?.message||"").toLowerCase();
  if(message.includes("trusted federated peer not found")||message.includes("trusted federated peer unavailable or stale"))return "unavailable";
  if(error?.status===429||Number(error?.status)>=500)return "transport";
  if(error?.name==="TypeError"&&(message.includes("fetch")||message.includes("network")))return "transport";
  return null;
}
