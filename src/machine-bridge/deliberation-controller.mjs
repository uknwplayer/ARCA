export class DeliberationController {
  constructor({room, adapters, maxTurnsPerPhase=1, timeoutMs=30000, now=()=>Date.now()}){
    if(!room||!Array.isArray(adapters)||adapters.length<2) throw new Error("ARCA_MBDP_CONTROLLER_INVALID_CONFIG");
    this.room=room; this.adapters=new Map(adapters.map(a=>[a.agentId,a])); this.maxTurnsPerPhase=maxTurnsPerPhase; this.timeoutMs=timeoutMs; this.now=now;
    if(this.adapters.size!==adapters.length) throw new Error("ARCA_MBDP_DUPLICATE_ADAPTER");
  }
  async #invoke(adapter,input){
    const task=Promise.resolve().then(()=>adapter.analyze(input));
    let timer; const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("ARCA_MBDP_AGENT_TIMEOUT")),this.timeoutMs)});
    try{return await Promise.race([task,timeout]);} finally{clearTimeout(timer)}
  }
  async runPhase(){
    const snap=this.room.snapshot(); if(snap.phase==="closed") return snap;
    const participants=snap.participants;
    for(let turn=0;turn<this.maxTurnsPerPhase;turn++){
      for(const p of participants){
        const adapter=this.adapters.get(p.agentId); if(!adapter) continue;
        const input={roomId:snap.roomId,phase:snap.phase,round:snap.round,evidenceSetHash:snap.evidenceSetHash,messages:this.room.visibleMessages(p.agentId)};
        try{
          const out=await this.#invoke(adapter,input);
          if(!out?.body) continue;
          this.room.submit({agentId:p.agentId,type:out.type??"analysis",body:out.body,evidenceRefs:out.evidenceRefs??[]});
        }catch(err){
          if(err?.message!=="ARCA_MBDP_AGENT_TIMEOUT") throw err;
          // Timeout is observational: it is not consent, rejection or consensus.
        }
      }
    }
    return this.room.advance();
  }
  async runToClose(){
    let snap=this.room.snapshot(), guard=0;
    while(snap.phase!=="closed"){
      if(++guard>8) throw new Error("ARCA_MBDP_CONTROLLER_GUARD");
      snap=await this.runPhase();
    }
    return snap;
  }
}

export function createAuditorAdapter({agentId,provider,model,analyze}){
  if(!agentId||!provider||!model||typeof analyze!=="function") throw new Error("ARCA_MBDP_INVALID_ADAPTER");
  return Object.freeze({agentId,provider,model,analyze});
}
