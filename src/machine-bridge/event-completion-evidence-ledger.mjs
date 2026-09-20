import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const EVENT_ID=/^[0-9a-f]{64}$/;
const HASH=/^[0-9a-f]{64}$/;
const SAFE=/^[A-Za-z0-9_.:-]{1,128}$/;

function stable(value){
  if(Array.isArray(value)) return "["+value.map(stable).join(",")+"]";
  if(value&&typeof value==="object") return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stable(value[key])).join(",")+"}";
  return JSON.stringify(value);
}
const sha=value=>createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex");
const key=(eventId,handlerId)=>sha([eventId,handlerId]);
const bodyForHash=record=>{const {recordHash:_ignored,...body}=record;return body};

function validate(record,eventId,handlerId){
  if(!record||typeof record!=="object"||Array.isArray(record)) throw new Error("ARCA_COMPLETION_EVIDENCE_INVALID");
  if(record.schema!=="arca-event-completion-evidence-v1") throw new Error("ARCA_COMPLETION_EVIDENCE_INVALID");
  if(record.eventId!==eventId||record.handlerId!==handlerId) throw new Error("ARCA_COMPLETION_EVIDENCE_CORRELATION_MISMATCH");
  if(!HASH.test(record.resultHash)||!HASH.test(record.evidenceHash)||!HASH.test(record.recordHash)) throw new Error("ARCA_COMPLETION_EVIDENCE_HASH_INVALID");
  if(!SAFE.test(record.sourceId)) throw new Error("ARCA_COMPLETION_EVIDENCE_SOURCE_INVALID");
  const at=new Date(record.observedAt);
  if(!Number.isFinite(at.getTime())) throw new Error("ARCA_COMPLETION_EVIDENCE_TIME_INVALID");
  if(record.recordHash!==sha(bodyForHash(record))) throw new Error("ARCA_COMPLETION_EVIDENCE_RECORD_HASH_MISMATCH");
  return record;
}

export function createEventCompletionEvidenceLedger({root,fsImpl=fs,clock=()=>new Date().toISOString()}={}){
  if(!root) throw new Error("ARCA_COMPLETION_EVIDENCE_ROOT_REQUIRED");
  const dir=path.join(root,"delivery-completions");
  fsImpl.mkdirSync(dir,{recursive:true});

  const file=(eventId,handlerId)=>path.join(dir,key(eventId,handlerId)+".json");
  const read=(eventId,handlerId)=>{
    if(!EVENT_ID.test(eventId)||!SAFE.test(handlerId)) throw new Error("ARCA_COMPLETION_EVIDENCE_KEY_INVALID");
    const p=file(eventId,handlerId);
    if(!fsImpl.existsSync(p)) return null;
    return validate(JSON.parse(fsImpl.readFileSync(p,"utf8")),eventId,handlerId);
  };

  const createOnly=(p,record)=>{
    let fd=null;
    try{
      fd=fsImpl.openSync(p,"wx",0o600);
      fsImpl.writeFileSync(fd,JSON.stringify(record)+"\n","utf8");
      fsImpl.fsyncSync?.(fd);
      fsImpl.closeSync(fd);
      fd=null;
      return true;
    }catch(error){
      if(fd!==null) try{fsImpl.closeSync(fd)}catch{}
      if(error?.code==="EEXIST") return false;
      try{if(fsImpl.existsSync(p)) fsImpl.unlinkSync(p)}catch{}
      throw error;
    }
  };

  return Object.freeze({
    record({eventId,handlerId,resultHash,evidenceHash,sourceId,observedAt=clock()}={}){
      if(!EVENT_ID.test(eventId)||!SAFE.test(handlerId)) throw new Error("ARCA_COMPLETION_EVIDENCE_KEY_INVALID");
      if(!HASH.test(resultHash)||!HASH.test(evidenceHash)) throw new Error("ARCA_COMPLETION_EVIDENCE_HASH_INVALID");
      if(!SAFE.test(sourceId)) throw new Error("ARCA_COMPLETION_EVIDENCE_SOURCE_INVALID");
      const at=new Date(observedAt);
      if(!Number.isFinite(at.getTime())) throw new Error("ARCA_COMPLETION_EVIDENCE_TIME_INVALID");

      const body={
        schema:"arca-event-completion-evidence-v1",
        eventId,
        handlerId,
        resultHash,
        evidenceHash,
        sourceId,
        observedAt:at.toISOString()
      };
      const candidate=Object.freeze({...body,recordHash:sha(body)});
      const p=file(eventId,handlerId);
      const existing=read(eventId,handlerId);
      if(existing){
        if(existing.resultHash!==resultHash||existing.evidenceHash!==evidenceHash||existing.sourceId!==sourceId){
          const error=new Error("ARCA_COMPLETION_EVIDENCE_CONFLICT");
          error.code="ARCA_COMPLETION_EVIDENCE_CONFLICT";
          throw error;
        }
        return Object.freeze({created:false,evidence:existing});
      }

      if(!createOnly(p,candidate)){
        const winner=read(eventId,handlerId);
        if(!winner) throw new Error("ARCA_COMPLETION_EVIDENCE_RACE");
        if(winner.resultHash!==resultHash||winner.evidenceHash!==evidenceHash||winner.sourceId!==sourceId){
          const error=new Error("ARCA_COMPLETION_EVIDENCE_CONFLICT");
          error.code="ARCA_COMPLETION_EVIDENCE_CONFLICT";
          throw error;
        }
        return Object.freeze({created:false,evidence:winner});
      }

      return Object.freeze({created:true,evidence:candidate});
    },
    get:read
  });
}
