import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {evaluateGetCostPolicy,GET_COST_CLASSES} from "./source-get-cost-policy.mjs";

export const M5_N1_PLAN_SCHEMA="arca.m5-n1-pncp-item-discovery-plan.v1";
export const M5_N1_CANDIDATE_SCHEMA="arca.m5-n1-pncp-item-discovery-candidate.v1";
export const M5_N1_ENDPOINT_ID="PNCP_ITENS_DA_CONTRATACAO";
export const M5_N1_QUERY=Object.freeze({pagina:1,tamanhoPagina:10});

const H64=/^[a-f0-9]{64}$/;
const H40=/^[a-f0-9]{40}$/;
const text=(v,c,m=200)=>{const o=String(v??"").normalize("NFKC").trim();if(!o||o.length>m||/[\u0000-\u001f\u007f]/u.test(o))throw new Error(c);return o};
const h64=(v,c)=>{const o=text(v,c,64).toLowerCase();if(!H64.test(o))throw new Error(c);return o};
const h40=(v,c)=>{const o=text(v,c,40).toLowerCase();if(!H40.test(o))throw new Error(c);return o};
const int=(v,c,{min=1,max=999999999}={})=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw new Error(c);return v};
function cnpj(v){const o=String(v??"").replace(/\D/g,"");if(!/^\d{14}$/.test(o))throw new Error("ARCA_M5_N1_CNPJ_INVALID");return o}

function normalizeRecord(record){
  if(record?.schema!=="arca.m5-pncp-live-parser.v1"||
     record?.supplierObserved!==false||
     record?.identityInferencesMade!==false)
    throw new Error("ARCA_M5_N1_PNCP_RECORD_INVALID");
  return Object.freeze({
    recordRef:text(record.recordRef,"ARCA_M5_N1_RECORD_REF_INVALID",180),
    control:text(record.procurementControlNumber,"ARCA_M5_N1_CONTROL_INVALID",120),
    cnpj:cnpj(record.agencyIdentifier?.value),
    year:int(record.year,"ARCA_M5_N1_YEAR_INVALID",{min:2000,max:2100}),
    sequence:int(record.sequence,"ARCA_M5_N1_SEQUENCE_INVALID")
  });
}

function targetFor(record){
  const r=normalizeRecord(record);
  const targetBase={
    endpointId:M5_N1_ENDPOINT_ID,
    method:"GET",
    path:`/api/pncp/v1/orgaos/${r.cnpj}/compras/${r.year}/${r.sequence}/itens`,
    query:M5_N1_QUERY,
    procurementRecordRef:r.recordRef,
    procurementControlRef:`pncp:control:sha256:${sha256(r.control)}`
  };
  return Object.freeze({...targetBase,targetSha256:sha256(canonicalJson(targetBase))});
}

export function buildM5N1ItemDiscoveryPlan({records}={}){
  if(!Array.isArray(records)||records.length!==2)
    throw new Error("ARCA_M5_N1_RECORD_BUDGET_INVALID");
  const targets=records.map(targetFor);
  if(new Set(targets.map(x=>x.targetSha256)).size!==2)
    throw new Error("ARCA_M5_N1_DUPLICATE_TARGET");
  const base={
    schema:M5_N1_PLAN_SCHEMA,
    version:1,
    source:"PNCP",
    endpointId:M5_N1_ENDPOINT_ID,
    targetCount:2,
    targets:Object.freeze(targets),
    pagination:Object.freeze({
      pagina:1,
      tamanhoPagina:10,
      fullPageMeansPotentiallyTruncated:true
    }),
    budgets:Object.freeze({
      maxRequests:2,
      retries:0,
      timeoutMs:30000,
      maxBytesPerResponse:524288,
      maxItemsPerResponse:10
    }),
    expectedCoverage:Object.freeze({
      numeroItem:true,
      temResultado:true,
      supplierIdentifier:false
    }),
    nextStage:Object.freeze({
      id:"M5-N2",
      onlyItemsWithTemResultado:true,
      requiresCompleteItemCoverage:true,
      requiresSeparateControlledPlan:true
    }),
    getCostPolicy:evaluateGetCostPolicy({
      method:"GET",
      costClass:GET_COST_CLASSES.NO_MONETARY_CHARGE_OBSERVED,
      evidenceRef:"PNCP_MANUAL_V2_6_PUBLIC_CONSULTATION"
    }),
    sourceNetworkAuthorized:true,
    newPncpGetAuthorized:true,
    publicationAuthorized:false,
    correlationAuthorized:false,
    humanAuthorizationRequired:false
  };
  return Object.freeze({...base,planSha256:sha256(canonicalJson(base))});
}

export function buildM5N1ItemDiscoveryCandidate({plan,revision,pncpBindingSha256,screeningSha256,m5mDiagnosisSha256}={}){
  if(plan?.schema!==M5_N1_PLAN_SCHEMA)throw new Error("ARCA_M5_N1_PLAN_INVALID");
  const {planSha256,...body}=plan;
  if(sha256(canonicalJson(body))!==planSha256)throw new Error("ARCA_M5_N1_PLAN_INTEGRITY_INVALID");
  const base={
    schema:M5_N1_CANDIDATE_SCHEMA,
    version:1,
    status:"READY_FOR_CONTROLLED_EXECUTION",
    revision:h40(revision,"ARCA_M5_N1_REVISION_INVALID"),
    endpointId:M5_N1_ENDPOINT_ID,
    pncpBindingSha256:h64(pncpBindingSha256,"ARCA_M5_N1_BINDING_INVALID"),
    screeningSha256:h64(screeningSha256,"ARCA_M5_N1_SCREENING_INVALID"),
    predecessorDiagnosisSha256:h64(m5mDiagnosisSha256,"ARCA_M5_N1_PREDECESSOR_INVALID"),
    planSha256:h64(planSha256,"ARCA_M5_N1_PLAN_HASH_INVALID"),
    targetCount:2,
    targetHashes:Object.freeze(plan.targets.map(t=>h64(t.targetSha256,"ARCA_M5_N1_TARGET_HASH_INVALID"))),
    pagination:plan.pagination,
    budgets:plan.budgets,
    expectedCoverage:plan.expectedCoverage,
    getCostPolicy:plan.getCostPolicy,
    sourceNetworkAuthorized:true,
    newPncpGetAuthorized:true,
    publicationAuthorized:false,
    correlationAuthorized:false,
    privateTargetValuesIncluded:false,
    humanAuthorizationRequired:false
  };
  return Object.freeze({...base,candidateSha256:sha256(canonicalJson(base))});
}
