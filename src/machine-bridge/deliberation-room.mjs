import {createHash} from "node:crypto";

const stable = (v) => JSON.stringify(v, Object.keys(v).sort());
const hash = (v) => createHash("sha256").update(typeof v === "string" ? v : stable(v)).digest("hex");
const safe = (s,n=4000) => { if(typeof s!=="string"||!s.trim()||s.length>n) throw new Error("ARCA_MBDP_INVALID_TEXT"); return s; };

export class DeliberationRoom {
  #room; #messages=[];
  constructor({roomId,evidenceSetHash,participants,maxRounds=4,now=()=>new Date()}){
    if(!/^[A-Za-z0-9._-]{1,160}$/.test(roomId)) throw new Error("ARCA_MBDP_INVALID_ROOM");
    if(!/^[a-f0-9]{64}$/.test(evidenceSetHash)) throw new Error("ARCA_MBDP_INVALID_EVIDENCE_HASH");
    if(!Array.isArray(participants)||participants.length<2) throw new Error("ARCA_MBDP_PARTICIPANTS_REQUIRED");
    const ids=new Set();
    for(const p of participants){ if(!p?.agentId||ids.has(p.agentId)) throw new Error("ARCA_MBDP_INVALID_PARTICIPANT"); ids.add(p.agentId); }
    this.now=now; this.#room={format:"arca-mbdp-room-v1",version:1,roomId,evidenceSetHash,participants:structuredClone(participants),phase:"independent",round:1,maxRounds,createdAt:now().toISOString(),closedAt:null};
  }
  snapshot(){ return structuredClone({...this.#room,messages:this.visibleMessages()}); }
  visibleMessages(agentId){
    if(this.#room.phase==="independent") return this.#messages.filter(m=>m.agentId===agentId).map(structuredClone);
    return this.#messages.map(structuredClone);
  }
  submit({agentId,type="analysis",body,evidenceRefs=[]}){
    if(this.#room.phase==="closed") throw new Error("ARCA_MBDP_ROOM_CLOSED");
    if(!this.#room.participants.some(p=>p.agentId===agentId)) throw new Error("ARCA_MBDP_AGENT_NOT_ALLOWED");
    safe(body);
    if(!Array.isArray(evidenceRefs)||evidenceRefs.some(x=>typeof x!=="string"||x.length>500)) throw new Error("ARCA_MBDP_INVALID_EVIDENCE_REFS");
    const previousHash=this.#messages.at(-1)?.messageHash ?? null;
    const core={format:"arca-mbdp-message-v1",version:1,roomId:this.#room.roomId,sequence:this.#messages.length+1,phase:this.#room.phase,round:this.#room.round,agentId,type:safe(type,80),body,evidenceRefs:[...evidenceRefs],createdAt:this.now().toISOString(),previousHash};
    const message={...core,messageHash:hash(core)}; this.#messages.push(message); return structuredClone(message);
  }
  advance(){
    const order=["independent","cross_review","rebuttal","final","closed"];
    const i=order.indexOf(this.#room.phase);
    if(i<0||i===order.length-1) return this.snapshot();
    this.#room.phase=order[i+1];
    if(this.#room.phase==="rebuttal") this.#room.round++;
    if(this.#room.phase==="closed") this.#room.closedAt=this.now().toISOString();
    return this.snapshot();
  }
}
