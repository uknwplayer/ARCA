import {EvidenceState} from "../public-source-resolver.mjs";
export const pncpPublicAdapter={
 id:"pncp-public",priority:10,
 supports:ctx=>Boolean(ctx?.pncp),
 async resolve(ctx){
  const p=ctx.pncp, facts=[];
  for(const [field,value] of Object.entries({supplierCnpj:p.supplierCnpj,supplierName:p.supplierName,participantCount:p.participantCount})){
   if(value!==null&&value!==undefined)facts.push({field,value,state:EvidenceState.OBSERVED,provenance:p.provenance??null});
  }
  return {state:facts.length?EvidenceState.OBSERVED:EvidenceState.SOURCE_GAP,facts};
 }
};
