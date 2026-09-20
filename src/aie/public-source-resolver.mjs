export const EvidenceState=Object.freeze({OBSERVED:"OBSERVED",RESOLVED_ELSEWHERE:"RESOLVED_ELSEWHERE",NOT_PUBLISHED:"NOT_PUBLISHED",SOURCE_GAP:"SOURCE_GAP",CONFLICT:"CONFLICT",UNKNOWN:"UNKNOWN",LAI_PENDING:"LAI_PENDING"});
export function createResolver({adapters=[]}={}){
 const ordered=[...adapters].sort((a,b)=>(a.priority??100)-(b.priority??100));
 return {
  async resolve(ctx){
   const attempts=[],facts=new Map();
   for(const adapter of ordered){
    if(adapter.supports&&!adapter.supports(ctx))continue;
    try{
     const out=await adapter.resolve(ctx);
     attempts.push({adapter:adapter.id,status:"ok",state:out?.state??EvidenceState.SOURCE_GAP});
     for(const fact of out?.facts??[]){
      const arr=facts.get(fact.field)??[]; arr.push({...fact,adapter:adapter.id}); facts.set(fact.field,arr);
     }
    }catch(error){attempts.push({adapter:adapter.id,status:"error",error:String(error?.message??error)});}
   }
   const resolved={};
   for(const [field,values] of facts){
    const distinct=[...new Set(values.map(v=>JSON.stringify(v.value)))];
    resolved[field]={state:distinct.length>1?EvidenceState.CONFLICT:(values[0]?.state??EvidenceState.RESOLVED_ELSEWHERE),values};
   }
   return {format:"arca-public-source-resolution-v1",target:ctx.target??null,attempts,resolved};
  }
 };
}
