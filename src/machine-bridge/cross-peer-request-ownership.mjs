import {createHash} from "node:crypto";
import {mkdir,open,readFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";

export const ARCA_CROSS_PEER_REQUEST_OWNERSHIP_FORMAT="arca-cross-peer-request-ownership-v1";
export const ARCA_CROSS_PEER_DISPATCH_EVIDENCE_FORMAT="arca-cross-peer-dispatch-evidence-v1";
export const ARCA_CROSS_PEER_UNCERTAIN_EVIDENCE_FORMAT="arca-cross-peer-uncertain-evidence-v1";
export const ARCA_CROSS_PEER_COMPLETION_EVIDENCE_FORMAT="arca-cross-peer-completion-evidence-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const FAILURE_CATEGORIES=new Set(["timeout","transport","remote","protocol","unknown"]);
const MAX_RECORD_BYTES=32*1024;

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function stableStringify(value){return JSON.stringify(stableValue(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stableStringify(value)).digest("hex")}
function safeId(value,label){if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);return value}
function safeHash(value,label){if(typeof value!=="string"||!HASH.test(value))throw new Error("invalid "+label);return value}
function safeTime(value,label="time"){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid "+label);
  return date;
}
function bodyForHash(record){const {recordHash:_ignored,...body}=record;return body}
function seal(body){return Object.freeze({...body,recordHash:sha256(body)})}
function validateSeal(record){
  if(!record||typeof record!=="object"||Array.isArray(record))throw new Error("invalid cross-peer evidence record");
  safeHash(record.recordHash,"cross-peer evidence recordHash");
  if(record.recordHash!==sha256(bodyForHash(record)))throw new Error("cross-peer evidence record hash mismatch");
  return record;
}
function failureCategory(error){
  const message=String(error?.message||"").toLowerCase();
  if(message.includes("timed out")||message.includes("timeout"))return "timeout";
  if(error?.status===429||Number(error?.status)>=500)return "transport";
  if(error?.name==="TypeError"&&(message.includes("fetch")||message.includes("network")))return "transport";
  if(message.includes("protocol")||message.includes("correlation")||message.includes("result hash"))return "protocol";
  if(message.includes("remote"))return "remote";
  return "unknown";
}
async function createOnly(path,value){
  await mkdir(dirname(path),{recursive:true});
  const serialized=JSON.stringify(value,null,2)+"\n";
  if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error("cross-peer evidence record too large");
  let handle;
  try{
    handle=await open(path,"wx");
    await handle.writeFile(serialized,"utf8");
    return true;
  }catch(error){
    if(error?.code==="EEXIST")return false;
    throw error;
  }finally{await handle?.close()}
}
async function readJson(path){
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch(error){if(error?.code==="ENOENT")return null;throw error}
}
function validateBinding(record){
  validateSeal(record);
  if(record.format!==ARCA_CROSS_PEER_REQUEST_OWNERSHIP_FORMAT||record.version!==1)throw new Error("invalid cross-peer ownership binding");
  safeId(record.requestId,"cross-peer requestId");
  safeId(record.jobId,"cross-peer jobId");
  safeId(record.relayNodeId,"cross-peer relayNodeId");
  safeId(record.selectedNodeId,"cross-peer selectedNodeId");
  safeHash(record.payloadHash,"cross-peer payloadHash");
  safeTime(record.createdAt,"cross-peer binding createdAt");
  return record;
}
function validateDispatch(record,binding){
  validateSeal(record);
  if(record.format!==ARCA_CROSS_PEER_DISPATCH_EVIDENCE_FORMAT||record.version!==1)throw new Error("invalid cross-peer dispatch evidence");
  if(record.requestId!==binding.requestId||record.jobId!==binding.jobId||record.bindingHash!==binding.recordHash||record.selectedNodeId!==binding.selectedNodeId)throw new Error("cross-peer dispatch evidence binding mismatch");
  safeTime(record.startedAt,"cross-peer dispatch startedAt");
  return record;
}
function validateUncertain(record,binding){
  validateSeal(record);
  if(record.format!==ARCA_CROSS_PEER_UNCERTAIN_EVIDENCE_FORMAT||record.version!==1)throw new Error("invalid cross-peer uncertain evidence");
  if(record.requestId!==binding.requestId||record.jobId!==binding.jobId||record.bindingHash!==binding.recordHash||record.selectedNodeId!==binding.selectedNodeId)throw new Error("cross-peer uncertain evidence binding mismatch");
  if(!FAILURE_CATEGORIES.has(record.failureCategory))throw new Error("invalid cross-peer failure category");
  safeTime(record.recordedAt,"cross-peer uncertainty recordedAt");
  return record;
}
function validateCompletion(record,binding){
  validateSeal(record);
  if(record.format!==ARCA_CROSS_PEER_COMPLETION_EVIDENCE_FORMAT||record.version!==1)throw new Error("invalid cross-peer completion evidence");
  if(record.requestId!==binding.requestId||record.jobId!==binding.jobId||record.bindingHash!==binding.recordHash||record.selectedNodeId!==binding.selectedNodeId)throw new Error("cross-peer completion evidence binding mismatch");
  safeHash(record.resultHash,"cross-peer resultHash");
  safeTime(record.observedAt,"cross-peer completion observedAt");
  return record;
}
function conflict(message,code,record=null){
  const error=new Error(message);
  error.code=code;
  if(record)error.ownershipState=record;
  return error;
}
function correlationResultHash(result,{requestId,jobId}){
  if(!result||typeof result!=="object"||Array.isArray(result))throw conflict("cross-peer completion requires structured result","ARCA_CROSS_PEER_RESULT_INVALID");
  if(result.requestId!==requestId||result.jobId!==jobId)throw conflict("cross-peer completion correlation mismatch","ARCA_CROSS_PEER_RESULT_INVALID");
  return typeof result.resultHash==="string"&&HASH.test(result.resultHash)?result.resultHash:sha256(result);
}

export class CrossPeerRequestOwnershipStore{
  constructor({root}={}){
    if(typeof root!=="string"||!root.trim())throw new TypeError("cross-peer ownership root required");
    this.root=resolve(root);
  }

  async init(){await mkdir(this.root,{recursive:true});return this}
  requestRoot(requestId){return join(this.root,safeId(requestId,"cross-peer requestId"))}
  path(requestId,name){return join(this.requestRoot(requestId),name+".json")}

  async #binding(requestId){
    const value=await readJson(this.path(requestId,"binding"));
    return value?validateBinding(value):null;
  }

  async reserve({requestId,jobId,payloadHash,relayNodeId,selectedNodeId,now=new Date()}={}){
    safeId(requestId,"cross-peer requestId");
    safeId(jobId,"cross-peer jobId");
    safeHash(payloadHash,"cross-peer payloadHash");
    safeId(relayNodeId,"cross-peer relayNodeId");
    safeId(selectedNodeId,"cross-peer selectedNodeId");
    const createdAt=safeTime(now,"cross-peer reservation time").toISOString();
    const candidate=seal({
      format:ARCA_CROSS_PEER_REQUEST_OWNERSHIP_FORMAT,
      version:1,
      requestId,
      jobId,
      payloadHash,
      relayNodeId,
      selectedNodeId,
      createdAt
    });
    const created=await createOnly(this.path(requestId,"binding"),candidate);
    const binding=created?candidate:await this.#binding(requestId);
    if(!binding)throw new Error("cross-peer ownership binding disappeared");
    if(binding.jobId!==jobId||binding.payloadHash!==payloadHash||binding.relayNodeId!==relayNodeId){
      throw conflict("cross-peer request fingerprint conflict: "+requestId,"ARCA_CROSS_PEER_REQUEST_CONFLICT",await this.status(requestId));
    }
    if(binding.selectedNodeId!==selectedNodeId){
      throw conflict("cross-peer request already owned by "+binding.selectedNodeId,"ARCA_CROSS_PEER_OWNERSHIP_CONFLICT",await this.status(requestId));
    }
    return Object.freeze({created,binding});
  }

  async markDispatchStarted(requestId,{now=new Date()}={}){
    const binding=await this.#binding(requestId);
    if(!binding)throw conflict("cross-peer request has no owner reservation","ARCA_CROSS_PEER_REQUEST_UNBOUND");
    const startedAt=safeTime(now,"cross-peer dispatch time").toISOString();
    const candidate=seal({
      format:ARCA_CROSS_PEER_DISPATCH_EVIDENCE_FORMAT,
      version:1,
      requestId:binding.requestId,
      jobId:binding.jobId,
      bindingHash:binding.recordHash,
      selectedNodeId:binding.selectedNodeId,
      startedAt
    });
    const created=await createOnly(this.path(requestId,"dispatch"),candidate);
    const dispatch=created?candidate:validateDispatch(await readJson(this.path(requestId,"dispatch")),binding);
    return Object.freeze({created,dispatch,binding});
  }

  async markUncertain(requestId,{category="unknown",now=new Date()}={}){
    const binding=await this.#binding(requestId);
    if(!binding)throw conflict("cross-peer request has no owner reservation","ARCA_CROSS_PEER_REQUEST_UNBOUND");
    const dispatch=await readJson(this.path(requestId,"dispatch"));
    if(!dispatch)throw conflict("cross-peer request was never marked dispatched","ARCA_CROSS_PEER_REQUEST_NOT_DISPATCHED");
    validateDispatch(dispatch,binding);
    const normalized=String(category).trim().toLowerCase();
    if(!FAILURE_CATEGORIES.has(normalized))throw new Error("invalid cross-peer failure category");
    const candidate=seal({
      format:ARCA_CROSS_PEER_UNCERTAIN_EVIDENCE_FORMAT,
      version:1,
      requestId:binding.requestId,
      jobId:binding.jobId,
      bindingHash:binding.recordHash,
      selectedNodeId:binding.selectedNodeId,
      failureCategory:normalized,
      recordedAt:safeTime(now,"cross-peer uncertainty time").toISOString()
    });
    const created=await createOnly(this.path(requestId,"uncertain"),candidate);
    const uncertain=created?candidate:validateUncertain(await readJson(this.path(requestId,"uncertain")),binding);
    return Object.freeze({created,uncertain,binding});
  }

  async markCompleted(requestId,{resultHash,now=new Date()}={}){
    const binding=await this.#binding(requestId);
    if(!binding)throw conflict("cross-peer request has no owner reservation","ARCA_CROSS_PEER_REQUEST_UNBOUND");
    const dispatch=await readJson(this.path(requestId,"dispatch"));
    if(!dispatch)throw conflict("cross-peer request was never marked dispatched","ARCA_CROSS_PEER_REQUEST_NOT_DISPATCHED");
    validateDispatch(dispatch,binding);
    safeHash(resultHash,"cross-peer resultHash");
    const candidate=seal({
      format:ARCA_CROSS_PEER_COMPLETION_EVIDENCE_FORMAT,
      version:1,
      requestId:binding.requestId,
      jobId:binding.jobId,
      bindingHash:binding.recordHash,
      selectedNodeId:binding.selectedNodeId,
      resultHash,
      observedAt:safeTime(now,"cross-peer completion time").toISOString()
    });
    const created=await createOnly(this.path(requestId,"completion"),candidate);
    const completion=created?candidate:validateCompletion(await readJson(this.path(requestId,"completion")),binding);
    if(completion.resultHash!==resultHash)throw conflict("cross-peer completion resultHash conflict","ARCA_CROSS_PEER_RESULT_CONFLICT",await this.status(requestId));
    return Object.freeze({created,completion,binding});
  }

  async status(requestId){
    safeId(requestId,"cross-peer requestId");
    const binding=await this.#binding(requestId);
    if(!binding){
      return Object.freeze({
        state:"unbound",
        requestId,
        selectedNodeId:null,
        canSelectOwner:true,
        canDispatch:false,
        crossPeerFailoverAllowed:true,
        reason:"no-owner-reserved"
      });
    }
    const dispatchRaw=await readJson(this.path(requestId,"dispatch"));
    const uncertainRaw=await readJson(this.path(requestId,"uncertain"));
    const completionRaw=await readJson(this.path(requestId,"completion"));
    const dispatch=dispatchRaw?validateDispatch(dispatchRaw,binding):null;
    const uncertain=uncertainRaw?validateUncertain(uncertainRaw,binding):null;
    const completion=completionRaw?validateCompletion(completionRaw,binding):null;
    const state=completion?"completed":uncertain?"uncertain":dispatch?"in-flight":"reserved";
    return Object.freeze({
      state,
      requestId:binding.requestId,
      jobId:binding.jobId,
      payloadHash:binding.payloadHash,
      relayNodeId:binding.relayNodeId,
      selectedNodeId:binding.selectedNodeId,
      bindingHash:binding.recordHash,
      canSelectOwner:false,
      canDispatch:state==="reserved",
      crossPeerFailoverAllowed:false,
      reason:state==="reserved"?"owner-reserved":state==="in-flight"?"dispatch-started":state==="uncertain"?"remote-outcome-unknown":"completed",
      dispatchStartedAt:dispatch?.startedAt??null,
      failureCategory:uncertain?.failureCategory??null,
      resultHash:completion?.resultHash??null,
      completedAt:completion?.observedAt??null
    });
  }

  async reconcileCompletion(requestId,{lookupResult,now=new Date()}={}){
    if(typeof lookupResult!=="function")throw new TypeError("cross-peer lookupResult function required");
    const before=await this.status(requestId);
    if(before.state==="unbound"||before.state==="reserved"||before.state==="completed")return before;
    const result=await lookupResult(Object.freeze({
      requestId:before.requestId,
      jobId:before.jobId,
      selectedNodeId:before.selectedNodeId,
      bindingHash:before.bindingHash
    }));
    if(result==null)return this.status(requestId);
    const resultHash=correlationResultHash(result,{requestId:before.requestId,jobId:before.jobId});
    await this.markCompleted(requestId,{resultHash,now});
    return this.status(requestId);
  }

  asRelayGuard(){
    const store=this;
    const reserveForward=async context=>{
      const reservation=await store.reserve({
        requestId:context.requestId,
        jobId:context.jobId,
        payloadHash:context.payloadHash,
        relayNodeId:context.relayNodeId,
        selectedNodeId:context.selectedNodeId,
        now:context.now
      });
      return Object.freeze({
        requestId:context.requestId,
        jobId:context.jobId,
        selectedNodeId:context.selectedNodeId,
        bindingHash:reservation.binding.recordHash
      });
    };
    const markForwardStarted=async(token,{now=new Date()}={})=>{
      if(!token||typeof token!=="object")throw new TypeError("cross-peer ownership token required");
      const started=await store.markDispatchStarted(token.requestId,{now});
      if(!started.created){
        const state=await store.status(token.requestId);
        throw conflict(
          state.state==="completed"?"cross-peer request already completed":"cross-peer dispatch already started",
          state.state==="completed"?"ARCA_CROSS_PEER_REQUEST_COMPLETED":"ARCA_CROSS_PEER_DISPATCH_ALREADY_STARTED",
          state
        );
      }
      return store.status(token.requestId);
    };
    return Object.freeze({
      reserveForward,
      markForwardStarted,
      async beginForward(context){
        const token=await reserveForward(context);
        await markForwardStarted(token,{now:context.now});
        return token;
      },
      async completeForward(token,result,{now=new Date()}={}){
        if(!token||typeof token!=="object")throw new TypeError("cross-peer ownership token required");
        const resultHash=correlationResultHash(result,{requestId:token.requestId,jobId:token.jobId});
        await store.markCompleted(token.requestId,{resultHash,now});
        return store.status(token.requestId);
      },
      async failForward(token,error,{now=new Date()}={}){
        if(!token||typeof token!=="object")throw new TypeError("cross-peer ownership token required");
        await store.markUncertain(token.requestId,{category:failureCategory(error),now});
        return store.status(token.requestId);
      }
    });
  }
}

export function crossPeerFailureCategory(error){return failureCategory(error)}
