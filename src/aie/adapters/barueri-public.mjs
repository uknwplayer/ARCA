import {EvidenceState} from "../public-source-resolver.mjs";
const HOSTS=["compras.barueri.sp.gov.br","barueri.sp.gov.br","www.barueri.sp.gov.br","www1.barueri.sp.gov.br","portal.barueri.sp.gov.br"];
export const municipalPublicAdapter3505708={
 id:"municipality:3505708",priority:20,ibgeCode:"3505708",
 supports:ctx=>String(ctx?.municipality?.ibgeCode??"")==="3505708"||String(ctx?.target?.cnpj??"")==="46523015000135",
 async resolve(ctx){
  const facts=[];
  for(const e of ctx?.municipalEvidence??[]){
   let u; try{u=new URL(e.locator)}catch{continue}
   if(!HOSTS.includes(u.hostname))continue;
   if(!e.field||e.value===undefined||e.value===null)continue;
   facts.push({field:e.field,value:e.value,state:EvidenceState.RESOLVED_ELSEWHERE,provenance:{locator:e.locator,sha256:e.sha256??null,retrievedAt:e.retrievedAt??null,sourceType:e.sourceType??"MUNICIPAL_OFFICIAL"}});
  }
  return {state:facts.length?EvidenceState.RESOLVED_ELSEWHERE:EvidenceState.SOURCE_GAP,facts,discovery:[
   "https://compras.barueri.sp.gov.br/Portal/Mural.aspx",
   "https://barueri.sp.gov.br/transparencia/Licitacoes.aspx",
   "https://www.barueri.sp.gov.br/Transparencia/ContratacoesObrasPublicas.aspx",
   "https://www1.barueri.sp.gov.br/esuprimentos/paineleditais/Default.aspx"
  ]};
 }
};
