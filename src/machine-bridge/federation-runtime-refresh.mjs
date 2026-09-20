import {assembleFederationRuntime} from "./federation-runtime.mjs";

export const ARCA_FEDERATION_RUNTIME_REFRESH_FORMAT="arca-federation-runtime-refresh-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;

function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function integer(value,label,{min,max}){
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(label+" invalid");
  return value;
}
function clonePeerConfigs(values){
  if(!Array.isArray(values)||!values.length)throw new Error("federation refresh explicit peerConfigs required");
  const seen=new Set();
  return Object.freeze(values.map(value=>{
    const peerId=safeId(value?.peerId,"federation refresh peerId");
    if(seen.has(peerId))throw new Error("duplicate federation refresh peerId: "+peerId);
    seen.add(peerId);
    const credentialRef=String(value?.credentialRef??"").trim();
    if(!credentialRef.startsWith("vault://"))throw new Error("federation refresh requires vault:// credentialRef");
    return Object.freeze({peerId,credentialRef});
  }));
}
function safeNow(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid federation refresh time");
  return date;
}
function errorCode(error){
  if(typeof error?.code==="string"&&/^ARCA_[A-Z0-9_]{1,100}$/.test(error.code))return error.code;
  const message=String(error?.message||"").toLowerCase();
  if(message.includes("catalog changed")||message.includes("peer disabled")||message.includes("identity")||message.includes("fingerprint")||message.includes("signature"))return "ARCA_FEDERATION_RUNTIME_TRUST_INVALID";
  if(message.includes("transport"))return "ARCA_FEDERATION_RUNTIME_TRANSPORT_INVALID";
  return "ARCA_FEDERATION_RUNTIME_REFRESH_FAILED";
}
function freezePin(record){
  if(!record||record.status!=="active")throw new Error("federation refresh peer inactive or missing");
  if(!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.recordHash!=="string"||!HASH.test(record.recordHash))throw new Error("federation refresh requires sealed catalog record");
  return Object.freeze({
    peerId:safeId(record.peerId,"federation refresh peerId"),
    nodeId:safeId(record.nodeId,"federation refresh nodeId"),
    revision:record.revision,
    recordHash:record.recordHash
  });
}
function samePin(a,b){
  return !!a&&!!b&&a.peerId===b.peerId&&a.nodeId===b.nodeId&&a.revision===b.revision&&a.recordHash===b.recordHash;
}
function publicPin(pin){return Object.freeze({...pin})}

export class FederationRuntimeRefreshController{
  #runtime=null;
  #pins=new Map();
  #generation=0;
  #refreshChain=Promise.resolve();
  #timer=null;
  #running=false;
  #lastRefreshAttemptAt=null;
  #lastRefreshSuccessAt=null;
  #lastErrorCode=null;

  constructor({
    assemblyOptions,
    assembler=assembleFederationRuntime,
    refreshIntervalMs=60_000,
    now=()=>new Date()
  }={}){
    if(!assemblyOptions||typeof assemblyOptions!=="object"||Array.isArray(assemblyOptions))throw new TypeError("federation refresh assemblyOptions required");
    if(typeof assembler!=="function")throw new TypeError("federation refresh assembler required");
    if(typeof now!=="function")throw new TypeError("federation refresh clock required");
    if(!assemblyOptions.catalog||typeof assemblyOptions.catalog.get!=="function")throw new TypeError("federation refresh catalog.get() required");

    this.catalog=assemblyOptions.catalog;
    this.peerConfigs=clonePeerConfigs(assemblyOptions.peerConfigs);
    this.assembler=assembler;
    this.now=now;
    this.refreshIntervalMs=integer(refreshIntervalMs,"federation refresh interval",{min:1_000,max:3_600_000});
    this.assemblyOptions=Object.freeze({
      ...assemblyOptions,
      peerConfigs:this.peerConfigs,
      resolverOptions:Object.freeze({...assemblyOptions.resolverOptions}),
      peerOptions:Object.freeze({...assemblyOptions.peerOptions}),
      now:this.now
    });
  }

  get running(){return this.#running}

  async #capturePins(){
    const pins=new Map();
    for(const config of this.peerConfigs){
      const record=await this.catalog.get(config.peerId);
      if(!record)throw new Error("federation refresh peer not found in catalog: "+config.peerId);
      const pin=freezePin(record);
      pins.set(config.peerId,pin);
    }
    return pins;
  }

  #invalidate(code){
    this.#runtime=null;
    this.#pins=new Map();
    this.#lastErrorCode=code;
  }

  async #assertPinsCurrent(){
    if(!this.#runtime)throw this.#unavailableError();
    for(const [peerId,expected] of this.#pins){
      try{
        const current=await this.catalog.get(peerId);
        if(!current||current.status!=="active"||!samePin(expected,freezePin(current))){
          throw new Error("catalog pin changed");
        }
      }catch(cause){
        this.#invalidate("ARCA_FEDERATION_RUNTIME_STALE");
        const error=new Error("federation runtime generation invalidated by catalog change: "+peerId);
        error.code="ARCA_FEDERATION_RUNTIME_STALE";
        error.cause=cause;
        throw error;
      }
    }
    return true;
  }

  #unavailableError(){
    const error=new Error("federation runtime refresh controller has no active generation");
    error.code=this.#lastErrorCode||"ARCA_FEDERATION_RUNTIME_UNAVAILABLE";
    return error;
  }

  async #refreshInternal(){
    const attemptAt=safeNow(this.now());
    this.#lastRefreshAttemptAt=attemptAt.toISOString();
    try{
      const before=await this.#capturePins();
      const runtime=await this.assembler(this.assemblyOptions);
      if(!runtime||typeof runtime.forward!=="function"||typeof runtime.snapshot!=="function")throw new TypeError("federation refresh assembler returned invalid runtime");
      const after=await this.#capturePins();
      for(const config of this.peerConfigs){
        if(!samePin(before.get(config.peerId),after.get(config.peerId)))throw new Error("federation refresh catalog changed during generation build: "+config.peerId);
      }
      this.#runtime=runtime;
      this.#pins=after;
      this.#generation+=1;
      this.#lastRefreshSuccessAt=safeNow(this.now()).toISOString();
      this.#lastErrorCode=null;
      return this.snapshot();
    }catch(error){
      const code=errorCode(error);
      this.#invalidate(code);
      throw error;
    }
  }

  refreshOnce(){
    const run=this.#refreshChain.then(()=>this.#refreshInternal());
    this.#refreshChain=run.then(()=>undefined,()=>undefined);
    return run;
  }

  async forward(envelope){
    await this.#assertPinsCurrent();
    return this.#runtime.forward(envelope);
  }

  async advertise(){
    await this.#assertPinsCurrent();
    return this.#runtime.advertise();
  }

  snapshot(){
    const runtimeSnapshot=this.#runtime?.snapshot?.()??null;
    return Object.freeze({
      format:ARCA_FEDERATION_RUNTIME_REFRESH_FORMAT,
      version:1,
      state:this.#runtime?"ready":this.#lastErrorCode?"invalid":"uninitialized",
      running:this.#running,
      generation:this.#generation,
      refreshIntervalMs:this.refreshIntervalMs,
      lastRefreshAttemptAt:this.#lastRefreshAttemptAt,
      lastRefreshSuccessAt:this.#lastRefreshSuccessAt,
      lastErrorCode:this.#lastErrorCode,
      configuredPeerIds:Object.freeze(this.peerConfigs.map(value=>value.peerId).sort()),
      catalogPins:Object.freeze([...this.#pins.values()].map(publicPin).sort((a,b)=>a.peerId.localeCompare(b.peerId))),
      runtime:runtimeSnapshot
    });
  }

  async start(){
    if(this.#running)return this.snapshot();
    await this.refreshOnce();
    this.#running=true;
    this.#timer=setInterval(()=>{
      this.refreshOnce().catch(()=>{});
    },this.refreshIntervalMs);
    this.#timer.unref?.();
    return this.snapshot();
  }

  async stop(){
    this.#running=false;
    if(this.#timer){clearInterval(this.#timer);this.#timer=null}
    await this.#refreshChain;
    return this.snapshot();
  }
}
