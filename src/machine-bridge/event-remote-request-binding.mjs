import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const EVENT_ID=/^[0-9a-f]{64}$/;
const HASH=/^[0-9a-f]{64}$/;
const SAFE=/^[A-Za-z0-9._:-]{1,128}$/;

function stable(value){
  if(Array.isArray(value)) return "["+value.map(stable).join(",")+"]";
  if(value&&typeof value==="object") return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stable(value[key])).join(",")+"}";
  return JSON.stringify(value);
}
const sha=value=>createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex");
const key=(eventId,handlerId)=>sha([eventId,handlerId]);
const bodyForHash=record=>{const {recordHash:_ignored,...body}=record;return body};

function validate(record,eventId,handlerId){
  if(!record||typeof record!=="object"||Array.isArray(record)) throw new Error("ARCA_EVENT_REMOTE_BINDING_INVALID");
  if(record.schema!=="arca-event-remote-request-binding-v1") throw new Error("ARCA_EVENT_REMOTE_BINDING_INVALID");
  if(record.eventId!==eventId||record.handlerId!==handlerId) throw new Error("ARCA_EVENT_REMOTE_BINDING_CORRELATION_MISMATCH");
  if(!SAFE.test(record.nodeId)||!SAFE.test(record.requestId)||!SAFE.test(record.jobId)) throw new Error("ARCA_EVENT_REMOTE_BINDING_ID_INVALID");
  if(!HASH.test(record.payloadHash)||!HASH.test(record.ownerBindingHash)||!HASH.test(record.recordHash)) throw new Error("ARCA_EVENT_REMOTE_BINDING_HASH_INVALID");
  const at=new Date(record.createdAt);
  if(!Number.isFinite(at.getTime())) throw new Error("ARCA_EVENT_REMOTE_BINDING_TIME_INVALID");
  if(record.recordHash!==sha(bodyForHash(record))) throw new Error("ARCA_EVENT_REMOTE_BINDING_RECORD_HASH_MISMATCH");
  return record;
}

export function createEventRemoteRequestBindingStore({root,fsImpl=fs,clock=()=>new Date().toISOString()}={}){
  if(!root) throw new Error("ARCA_EVENT_REMOTE_BINDING_ROOT_REQUIRED");
  const dir=path.join(root,"event-remote-bindings");
  fsImpl.mkdirSync(dir,{recursive:true});
  const file=(eventId,handlerId)=>path.join(dir,key(eventId,handlerId)+".json");

  const get=(eventId,handlerId)=>{
    if(!EVENT_ID.test(eventId)||!SAFE.test(handlerId)) throw new Error("ARCA_EVENT_REMOTE_BINDING_KEY_INVALID");
    const p=file(eventId,handlerId);
    if(!fsImpl.existsSync(p)) return null;
    return validate(JSON.parse(fsImpl.readFileSync(p,"utf8")),eventId,handlerId);
  };

  return Object.freeze({
    bind({eventId,handlerId,nodeId,requestId,jobId,payloadHash,ownerBindingHash,createdAt=clock()}={}){
      if(!EVENT_ID.test(eventId)||!SAFE.test(handlerId)||!SAFE.test(nodeId)||!SAFE.test(requestId)||!SAFE.test(jobId)){
        throw new Error("ARCA_EVENT_REMOTE_BINDING_KEY_INVALID");
      }
      if(!HASH.test(payloadHash)||!HASH.test(ownerBindingHash)) throw new Error("ARCA_EVENT_REMOTE_BINDING_HASH_INVALID");
      const at=new Date(createdAt);
      if(!Number.isFinite(at.getTime())) throw new Error("ARCA_EVENT_REMOTE_BINDING_TIME_INVALID");

      const body={
        schema:"arca-event-remote-request-binding-v1",
        eventId,
        handlerId,
        nodeId,
        requestId,
        jobId,
        payloadHash,
        ownerBindingHash,
        createdAt:at.toISOString()
      };
      const candidate=Object.freeze({...body,recordHash:sha(body)});
      const existing=get(eventId,handlerId);
      if(existing){
        if(existing.nodeId!==nodeId||existing.requestId!==requestId||existing.jobId!==jobId||existing.payloadHash!==payloadHash||existing.ownerBindingHash!==ownerBindingHash){
          const error=new Error("ARCA_EVENT_REMOTE_BINDING_CONFLICT");
          error.code="ARCA_EVENT_REMOTE_BINDING_CONFLICT";
          throw error;
        }
        return Object.freeze({created:false,binding:existing});
      }

      const p=file(eventId,handlerId);
      let fd=null;
      try{
        fd=fsImpl.openSync(p,"wx",0o600);
        fsImpl.writeFileSync(fd,JSON.stringify(candidate)+"\n","utf8");
        fsImpl.fsyncSync?.(fd);
        fsImpl.closeSync(fd);
        fd=null;
        return Object.freeze({created:true,binding:candidate});
      }catch(error){
        if(fd!==null) try{fsImpl.closeSync(fd)}catch{}
        if(error?.code!=="EEXIST"){
          try{if(fsImpl.existsSync(p)) fsImpl.unlinkSync(p)}catch{}
          throw error;
        }
        const winner=get(eventId,handlerId);
        if(!winner) throw new Error("ARCA_EVENT_REMOTE_BINDING_RACE");
        if(winner.nodeId!==nodeId||winner.requestId!==requestId||winner.jobId!==jobId||winner.payloadHash!==payloadHash||winner.ownerBindingHash!==ownerBindingHash){
          const conflict=new Error("ARCA_EVENT_REMOTE_BINDING_CONFLICT");
          conflict.code="ARCA_EVENT_REMOTE_BINDING_CONFLICT";
          throw conflict;
        }
        return Object.freeze({created:false,binding:winner});
      }
    },
    get
  });
}
