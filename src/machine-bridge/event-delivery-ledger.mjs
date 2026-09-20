import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const id=v=>typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);
const safe=v=>typeof v==="string"&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const hash=(e,h)=>createHash("sha256").update(JSON.stringify([e,h])).digest("hex");

export function createEventDeliveryLedger({root,fsImpl=fs,clock=()=>new Date().toISOString()}={}){
  if(!root) throw new Error("ARCA_DELIVERY_ROOT_REQUIRED");
  const dir=path.join(root,"deliveries");
  fsImpl.mkdirSync(dir,{recursive:true});

  const file=(e,h)=>path.join(dir,hash(e,h)+".json");
  const read=(e,h)=>{
    const p=file(e,h);
    return fsImpl.existsSync(p)?JSON.parse(fsImpl.readFileSync(p,"utf8")):null;
  };

  const createClaim=(p,value)=>{
    let fd=null;
    try{
      fd=fsImpl.openSync(p,"wx",0o600);
      fsImpl.writeFileSync(fd,JSON.stringify(value)+"\n","utf8");
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
    claim(eventId,handlerId){
      if(!id(eventId)||!safe(handlerId)) throw new Error("ARCA_DELIVERY_INVALID");
      const p=file(eventId,handlerId);
      const cur=read(eventId,handlerId);
      if(cur) return {status:cur.status,delivery:cur,acquired:false};

      const delivery={
        schema:"arca-event-delivery-v1",
        eventId,
        handlerId,
        status:"claimed",
        claimedAt:clock(),
        ackedAt:null,
        errorCode:null
      };

      if(!createClaim(p,delivery)){
        const winner=read(eventId,handlerId);
        if(!winner) throw new Error("ARCA_DELIVERY_CLAIM_RACE");
        return {status:winner.status,delivery:winner,acquired:false};
      }

      return {status:"claimed",delivery,acquired:true};
    },

    ack(eventId,handlerId){
      const p=file(eventId,handlerId);
      const cur=read(eventId,handlerId);
      if(!cur) throw new Error("ARCA_DELIVERY_NOT_CLAIMED");
      if(cur.status==="acked") return {status:"acked",delivery:cur};
      if(cur.status!=="claimed") throw new Error("ARCA_DELIVERY_NOT_ACKABLE");
      const delivery={...cur,status:"acked",ackedAt:clock()};
      fsImpl.writeFileSync(p,JSON.stringify(delivery)+"\n",{encoding:"utf8",mode:0o600});
      return {status:"acked",delivery};
    },

    fail(eventId,handlerId,errorCode="ARCA_HANDLER_FAILED"){
      const p=file(eventId,handlerId);
      const cur=read(eventId,handlerId);
      if(!cur) throw new Error("ARCA_DELIVERY_NOT_CLAIMED");
      if(cur.status==="acked") throw new Error("ARCA_DELIVERY_ALREADY_ACKED");
      const delivery={...cur,status:"failed",errorCode:String(errorCode).slice(0,128)};
      fsImpl.writeFileSync(p,JSON.stringify(delivery)+"\n",{encoding:"utf8",mode:0o600});
      return {status:"failed",delivery};
    },

    get:read
  });
}
