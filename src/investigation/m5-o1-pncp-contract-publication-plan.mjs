import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {evaluateGetCostPolicy,GET_COST_CLASSES} from "./source-get-cost-policy.mjs";

export const M5_O1_PLAN_SCHEMA="arca.m5-o1-pncp-contract-publication-plan.v1";
export const M5_O1_CANDIDATE_SCHEMA="arca.m5-o1-pncp-contract-publication-candidate.v1";
export const M5_O1_ENDPOINT_ID="PNCP_CONTRATOS_POR_DATA_PUBLICACAO";
export const M5_O1_WINDOW_DAYS=180;

const H64=/^[a-f0-9]{64}$/;
const H40=/^[a-f0-9]{40}$/;
const clean=(v,c,m=240)=>{const o=String(v??"").normalize("NFKC").trim();if(!o||o.length>m||/[\u0000-\u001f\u007f]/u.test(o))throw new Error(c);return o};
const h64=(v,c)=>{const o=clean(v,c,64).toLowerCase();if(!H64.test(o))throw new Error(c);return o};
const h40=(v,c)=>{const o=clean(v,c,40).toLowerCase();if(!H40.test(o))throw new Error(c);return o};
function cnpj(v){const o=String(v??"").replace(/\D/g,"");if(!/^\d{14}$/.test(o))throw new Error("ARCA_M5_O1_CNPJ_INVALID");return o}
function date(v,c){
  const o=clean(v,c,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(o))throw new Error(c);
  const d=new Date(o+"T00:00:00.000Z");
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==o)throw new Error(c);
  return o;
}
function addDays(v,n){const d=new Date(v+"T00:00:00.000Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const ymd=v=>String(v).replaceAll("-","");

function normalizeRecord(record){
  if(record?.schema!=="arca.m5-pncp-live-parser.v1"||
     record?.supplierObserved!==false||
     record?.identityInferencesMade!==false)
    throw new Error("ARCA_M5_O1_PNCP_RECORD_INVALID");
  return Object.freeze({
    recordRef:clean(record.recordRef,"ARCA_M5_O1_RECORD_REF_INVALID",180),
    control:clean(record.procurementControlNumber,"ARCA_M5_O1_CONTROL_INVALID",120).toUpperCase(),
    cnpj:cnpj(record.agencyIdentifier?.value),
    publishedAt:date(record.publishedAt,"ARCA_M5_O1_PUBLICATION_DATE_INVALID")
  });
}

function buildTargets(records,asOfDate){
  const asOf=date(asOfDate,"ARCA_M5_O1_AS_OF_DATE_INVALID");
  const groups=new Map();
  for(const raw of records){
    const r=normalizeRecord(raw);
    if(r.publishedAt>asOf)throw new Error("ARCA_M5_O1_RECORD_AFTER_AS_OF");
    const naturalEnd=addDays(r.publishedAt,M5_O1_WINDOW_DAYS);
    const end=naturalEnd>asOf?asOf:naturalEnd;
    const key=`${r.cnpj}|${r.publishedAt}|${end}`;
    const current=groups.get(key)??{
      cnpj:r.cnpj,start:r.publishedAt,end,records:[]
    };
    current.records.push(r);
    groups.set(key,current);
  }
  return [...groups.values()].map(group=>{
    const procurementRecordRefs=group.records.map(x=>x.recordRef).sort();
    const procurementControlRefs=group.records
      .map(x=>`pncp:control:sha256:${sha256(x.control)}`).sort();
    const targetBase={
      endpointId:M5_O1_ENDPOINT_ID,
      method:"GET",
      path:"/api/consulta/v1/contratos",
      query:Object.freeze({
        dataInicial:ymd(group.start),
        dataFinal:ymd(group.end),
        cnpjOrgao:group.cnpj,
        pagina:1
      }),
      procurementRecordRefs:Object.freeze(procurementRecordRefs),
      procurementControlRefs:Object.freeze(procurementControlRefs),
      exactMatchField:"numeroControlePNCPCompra"
    };
    return Object.freeze({...targetBase,targetSha256:sha256(canonicalJson(targetBase))});
  }).sort((a,b)=>a.targetSha256.localeCompare(b.targetSha256));
}

export function buildM5O1ContractPublicationPlan({records,asOfDate}={}){
  if(!Array.isArray(records)||records.length!==2)
    throw new Error("ARCA_M5_O1_RECORD_BUDGET_INVALID");
  const targets=buildTargets(records,asOfDate);
  if(targets.length<1||targets.length>2)
    throw new Error("ARCA_M5_O1_TARGET_BUDGET_INVALID");
  if(new Set(targets.map(x=>x.targetSha256)).size!==targets.length)
    throw new Error("ARCA_M5_O1_DUPLICATE_TARGET");
  const base={
    schema:M5_O1_PLAN_SCHEMA,
    version:1,
    source:"PNCP_CONSULTA",
    endpointId:M5_O1_ENDPOINT_ID,
    targetCount:targets.length,
    targets:Object.freeze(targets),
    selectionPolicy:Object.freeze({
      preserveCurrentProcurements:true,
      windowDays:M5_O1_WINDOW_DAYS,
      page:1,
      exactProcurementLinkField:"numeroControlePNCPCompra",
      supplierFieldsExpected:Object.freeze(["niFornecedor","nomeRazaoSocialFornecedor"]),
      noNameOnlyIdentity:true,
      noAmountOnlyIdentity:true,
      noNegativeInferenceFromPageMiss:true
    }),
    budgets:Object.freeze({
      maxRequests:targets.length,
      retries:0,
      timeoutMs:30000,
      maxBytesPerResponse:1048576,
      maxPagesThisStage:1
    }),
    expectedCoverage:Object.freeze({
      procurementControlLink:true,
      supplierIdentifier:true,
      supplierName:true,
      contractOrCommitmentNumber:true,
      processNumber:true
    }),
    getCostPolicy:evaluateGetCostPolicy({
      method:"GET",
      costClass:GET_COST_CLASSES.NO_MONETARY_CHARGE_OBSERVED,
      evidenceRef:"PNCP_PUBLIC_CONSULTA_CONTRATOS_V1"
    }),
    implementationState:"PLAN_AND_OFFLINE_GATE_ONLY",
    sourceNetworkAuthorized:false,
    newPncpGetAuthorized:false,
    publicationAuthorized:false,
    correlationAuthorized:false,
    humanAuthorizationRequired:false
  };
  return Object.freeze({...base,planSha256:sha256(canonicalJson(base))});
}

export function buildM5O1ContractPublicationCandidate({
  plan,revision,pncpBindingSha256,screeningSha256,m5n1ObservationSha256
}={}){
  if(plan?.schema!==M5_O1_PLAN_SCHEMA)throw new Error("ARCA_M5_O1_PLAN_INVALID");
  const {planSha256,...body}=plan;
  if(sha256(canonicalJson(body))!==planSha256)
    throw new Error("ARCA_M5_O1_PLAN_INTEGRITY_INVALID");
  const base={
    schema:M5_O1_CANDIDATE_SCHEMA,
    version:1,
    status:"READY_FOR_TRANSPORT_IMPLEMENTATION",
    revision:h40(revision,"ARCA_M5_O1_REVISION_INVALID"),
    endpointId:M5_O1_ENDPOINT_ID,
    pncpBindingSha256:h64(pncpBindingSha256,"ARCA_M5_O1_BINDING_INVALID"),
    screeningSha256:h64(screeningSha256,"ARCA_M5_O1_SCREENING_INVALID"),
    predecessorObservationSha256:h64(m5n1ObservationSha256,"ARCA_M5_O1_PREDECESSOR_INVALID"),
    planSha256:h64(planSha256,"ARCA_M5_O1_PLAN_HASH_INVALID"),
    targetCount:plan.targetCount,
    targetHashes:Object.freeze(plan.targets.map(x=>x.targetSha256)),
    budgets:plan.budgets,
    selectionPolicy:plan.selectionPolicy,
    getCostPolicy:plan.getCostPolicy,
    sourceNetworkAuthorized:false,
    newPncpGetAuthorized:false,
    publicationAuthorized:false,
    correlationAuthorized:false,
    privateTargetValuesIncluded:false,
    humanAuthorizationRequired:false
  };
  return Object.freeze({...base,candidateSha256:sha256(canonicalJson(base))});
}
