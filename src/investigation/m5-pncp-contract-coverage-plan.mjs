import {canonicalJson,sha256} from "./public-source-contract.mjs";

export const M5_PNCP_CONTRACT_COVERAGE_PLAN_SCHEMA=
  "arca.m5-pncp-contract-coverage-plan.v1";
export const M5_PNCP_CONTRACT_COVERAGE_CANDIDATE_SCHEMA=
  "arca.m5-pncp-contract-coverage-candidate.v1";
export const M5_PNCP_CONTRACT_COVERAGE_ENDPOINT_ID=
  "PNCP_CONTRATOS_EMPENHOS_DA_CONTRATACAO";
export const M5_PNCP_CONTRACT_COVERAGE_PATH_TEMPLATE=
  "/api/pncp/v1/orgaos/{cnpj}/contratos/contratacao/{ano}/{sequencial}";

const H64=/^[a-f0-9]{64}$/;
const H40=/^[a-f0-9]{40}$/;

function h64(value,code){
  const out=String(value??"").trim().toLowerCase();
  if(!H64.test(out))throw new Error(code);
  return out;
}
function h40(value,code){
  const out=String(value??"").trim().toLowerCase();
  if(!H40.test(out))throw new Error(code);
  return out;
}
function text(value,code,max=200){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/u.test(out))
    throw new Error(code);
  return out;
}
function int(value,code,{min=1,max=999999999}={}){
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(code);
  return value;
}
function cnpj(value){
  const out=String(value??"").replace(/\D/g,"");
  if(!/^\d{14}$/.test(out))throw new Error("ARCA_M5_M_CNPJ_INVALID");
  return out;
}
function normalizedPncpRecord(record){
  if(record?.schema!=="arca.m5-pncp-live-parser.v1"||
     record?.supplierObserved!==false||
     record?.identityInferencesMade!==false)
    throw new Error("ARCA_M5_M_PNCP_RECORD_INVALID");
  const agency=cnpj(record.agencyIdentifier?.value);
  const year=int(record.year,"ARCA_M5_M_YEAR_INVALID",{min:2000,max:2100});
  const sequence=int(record.sequence,"ARCA_M5_M_SEQUENCE_INVALID");
  const control=text(record.procurementControlNumber,"ARCA_M5_M_CONTROL_INVALID",120);
  return {recordRef:text(record.recordRef,"ARCA_M5_M_RECORD_REF_INVALID",180),agency,year,sequence,control};
}
function targetFor(record){
  const r=normalizedPncpRecord(record);
  const path=`/api/pncp/v1/orgaos/${r.agency}/contratos/contratacao/${r.year}/${r.sequence}`;
  const targetBody={
    endpointId:M5_PNCP_CONTRACT_COVERAGE_ENDPOINT_ID,
    method:"GET",
    path,
    procurementRecordRef:r.recordRef,
    procurementControlRef:`pncp:control:sha256:${sha256(r.control)}`
  };
  return Object.freeze({...targetBody,targetSha256:sha256(canonicalJson(targetBody))});
}

export function buildM5PncpContractCoveragePlan({records}={}){
  if(!Array.isArray(records)||records.length<1||records.length>2)
    throw new Error("ARCA_M5_M_RECORD_BUDGET_INVALID");
  const targets=records.map(targetFor);
  if(new Set(targets.map(x=>x.targetSha256)).size!==targets.length)
    throw new Error("ARCA_M5_M_DUPLICATE_TARGET");
  const base={
    schema:M5_PNCP_CONTRACT_COVERAGE_PLAN_SCHEMA,
    version:1,
    source:"PNCP",
    endpointId:M5_PNCP_CONTRACT_COVERAGE_ENDPOINT_ID,
    targetCount:targets.length,
    targets:Object.freeze(targets),
    budgets:Object.freeze({
      maxRequests:2,
      retries:0,
      timeoutMs:30000,
      maxBytesPerResponse:65536,
      maxResponseRecords:25
    }),
    expectedCoverage:Object.freeze({
      supplierIdentifier:true,
      supplierName:true,
      procurementControlReference:true,
      contractOrCommitmentReference:true,
      processReference:true,
      agencyIdentifier:true,
      amountFields:true
    }),
    sourceNetworkAuthorized:false,
    publicationAuthorized:false,
    correlationAuthorized:false,
    humanAuthorizationRequired:true
  };
  return Object.freeze({...base,planSha256:sha256(canonicalJson(base))});
}

export function buildM5PncpContractCoverageCandidate({
  plan,
  revision,
  pncpBindingSha256,
  screeningSha256
}={}){
  if(!plan||plan.schema!==M5_PNCP_CONTRACT_COVERAGE_PLAN_SCHEMA)
    throw new Error("ARCA_M5_M_PLAN_INVALID");
  const {planSha256,...planBody}=plan;
  if(sha256(canonicalJson(planBody))!==planSha256)
    throw new Error("ARCA_M5_M_PLAN_INTEGRITY_INVALID");
  const targetHashes=Object.freeze(plan.targets.map(x=>h64(x.targetSha256,"ARCA_M5_M_TARGET_HASH_INVALID")));
  const base={
    schema:M5_PNCP_CONTRACT_COVERAGE_CANDIDATE_SCHEMA,
    version:1,
    status:"READY_FOR_EXPLICIT_SOURCE_AUTHORIZATION",
    revision:h40(revision,"ARCA_M5_M_REVISION_INVALID"),
    endpointId:M5_PNCP_CONTRACT_COVERAGE_ENDPOINT_ID,
    pncpBindingSha256:h64(pncpBindingSha256,"ARCA_M5_M_PNCP_BINDING_INVALID"),
    screeningSha256:h64(screeningSha256,"ARCA_M5_M_SCREENING_HASH_INVALID"),
    planSha256:h64(plan.planSha256,"ARCA_M5_M_PLAN_HASH_INVALID"),
    targetCount:plan.targetCount,
    targetHashes,
    budgets:plan.budgets,
    expectedCoverage:plan.expectedCoverage,
    sourceNetworkAuthorized:false,
    newPncpGetAuthorized:false,
    publicationAuthorized:false,
    correlationAuthorized:false,
    privateTargetValuesIncluded:false,
    humanAuthorizationRequired:true
  };
  return Object.freeze({...base,candidateSha256:sha256(canonicalJson(base))});
}
