import {canonicalJson,sha256} from "./public-source-contract.mjs";

export const M5_INVESTIGATION_MANIFEST_SCHEMA="arca.m5-investigation-manifest.v1";
export const M5_PRECORRELATION_GATE_SCHEMA="arca.m5-precorrelation-gate.v1";

const SOURCES=Object.freeze(["PNCP","PORTAL"]);
const NORMALIZATION_STATES=new Set(["RAW_CUSTODIED","SCHEMA_OBSERVED","NORMALIZED","NORMALIZATION_FAILED"]);
export const M5_REQUIRED_STOP_CONDITIONS=Object.freeze([
  "BUDGET_EXCEEDED",
  "CORRELATION_WITHOUT_EVIDENCE",
  "CUSTODY_INVALID",
  "PROTECTED_DATA_REQUIRED",
  "PUBLICATION_ATTEMPTED",
  "SCHEMA_DRIFT_UNREVIEWED",
  "SCOPE_DIVERGENCE"
]);

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function exactKeys(input,keys,code){
  if(!plain(input))throw new Error(code);
  const actual=Object.keys(input).sort(),expected=[...keys].sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(code);
}
function text(value,code,max=512){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/.test(out))throw new Error(code);
  return out;
}
function hex(value,length,code){
  const out=String(value??"").trim().toLowerCase();
  if(!new RegExp(`^[a-f0-9]{${length}}$`).test(out))throw new Error(code);
  return out;
}
function dateOnly(value,code){
  const out=text(value,code,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(out))throw new Error(code);
  const parsed=new Date(out+"T00:00:00.000Z");
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==out)throw new Error(code);
  return out;
}
function sourceScope(value,source){
  exactKeys(value,["scopeSha256","revision"],"ARCA_M5_MANIFEST_SOURCE_SCOPE_INVALID");
  return Object.freeze({
    scopeSha256:hex(value.scopeSha256,64,"ARCA_M5_MANIFEST_SCOPE_HASH_INVALID"),
    revision:hex(value.revision,40,"ARCA_M5_MANIFEST_REVISION_INVALID")
  });
}
function normalizeBudgets(value){
  exactKeys(value,["maxSources","maxAgentReports","maxCorrelationRelations","retries"],"ARCA_M5_MANIFEST_BUDGETS_INVALID");
  if(value.maxSources!==2||value.maxAgentReports!==2||value.retries!==0||
     !Number.isSafeInteger(value.maxCorrelationRelations)||value.maxCorrelationRelations<1||value.maxCorrelationRelations>100)
    throw new Error("ARCA_M5_MANIFEST_BUDGETS_INVALID");
  return Object.freeze({
    maxSources:2,
    maxAgentReports:2,
    maxCorrelationRelations:value.maxCorrelationRelations,
    retries:0
  });
}
function normalizeStops(value){
  if(!Array.isArray(value))throw new Error("ARCA_M5_MANIFEST_STOP_CONDITIONS_INVALID");
  const normalized=[...new Set(value.map(item=>text(item,"ARCA_M5_MANIFEST_STOP_CONDITIONS_INVALID",80)))].sort();
  const required=[...M5_REQUIRED_STOP_CONDITIONS].sort();
  if(JSON.stringify(normalized)!==JSON.stringify(required))throw new Error("ARCA_M5_MANIFEST_STOP_CONDITIONS_INVALID");
  return Object.freeze(normalized);
}
function normalizeTimeWindow(value){
  exactKeys(value,["start","end"],"ARCA_M5_MANIFEST_TIME_WINDOW_INVALID");
  const start=dateOnly(value.start,"ARCA_M5_MANIFEST_TIME_WINDOW_INVALID");
  const end=dateOnly(value.end,"ARCA_M5_MANIFEST_TIME_WINDOW_INVALID");
  if(start>end)throw new Error("ARCA_M5_MANIFEST_TIME_WINDOW_INVALID");
  return Object.freeze({start,end});
}
function subjectRef(value){
  const out=text(value,"ARCA_M5_MANIFEST_SUBJECT_REF_INVALID",160);
  if(!/^subject:sha256:[a-f0-9]{64}$/.test(out))throw new Error("ARCA_M5_MANIFEST_SUBJECT_REF_INVALID");
  return out;
}

export function buildM5InvestigationManifest(input={}){
  exactKeys(input,[
    "operationalQuestion","questionKind","jurisdiction","timeWindow","subjectRef",
    "sourceScopes","budgets","stopConditions","humanReviewRequired","publicationEnabled"
  ],"ARCA_M5_MANIFEST_UNEXPECTED_FIELD");
  if(input.questionKind!=="DOCUMENT_RECONCILIATION")throw new Error("ARCA_M5_MANIFEST_QUESTION_KIND_INVALID");
  if(input.jurisdiction!=="BR/FEDERAL")throw new Error("ARCA_M5_MANIFEST_JURISDICTION_INVALID");
  if(input.humanReviewRequired!==true)throw new Error("ARCA_M5_MANIFEST_HUMAN_REVIEW_REQUIRED");
  if(input.publicationEnabled!==false)throw new Error("ARCA_M5_MANIFEST_PUBLICATION_FORBIDDEN");
  exactKeys(input.sourceScopes,SOURCES,"ARCA_M5_MANIFEST_SOURCE_SCOPES_INVALID");
  const sourceScopes=Object.freeze({
    PNCP:sourceScope(input.sourceScopes.PNCP,"PNCP"),
    PORTAL:sourceScope(input.sourceScopes.PORTAL,"PORTAL")
  });
  const base={
    schema:M5_INVESTIGATION_MANIFEST_SCHEMA,
    questionKind:"DOCUMENT_RECONCILIATION",
    operationalQuestion:text(input.operationalQuestion,"ARCA_M5_MANIFEST_QUESTION_INVALID",500),
    jurisdiction:"BR/FEDERAL",
    timeWindow:normalizeTimeWindow(input.timeWindow),
    subjectRef:subjectRef(input.subjectRef),
    sourceScopes,
    budgets:normalizeBudgets(input.budgets),
    stopConditions:normalizeStops(input.stopConditions),
    humanReviewRequired:true,
    publicationEnabled:false,
    networkAuthorizedByManifest:false,
    adverseFinding:false
  };
  return Object.freeze({...base,manifestSha256:sha256(base)});
}

export function verifyM5InvestigationManifest(manifest={}){
  exactKeys(manifest,[
    "schema","questionKind","operationalQuestion","jurisdiction","timeWindow","subjectRef",
    "sourceScopes","budgets","stopConditions","humanReviewRequired","publicationEnabled",
    "networkAuthorizedByManifest","adverseFinding","manifestSha256"
  ],"ARCA_M5_MANIFEST_SHAPE_INVALID");
  if(manifest.schema!==M5_INVESTIGATION_MANIFEST_SCHEMA)throw new Error("ARCA_M5_MANIFEST_SCHEMA_INVALID");
  const rebuilt=buildM5InvestigationManifest({
    questionKind:manifest.questionKind,
    operationalQuestion:manifest.operationalQuestion,
    jurisdiction:manifest.jurisdiction,
    timeWindow:manifest.timeWindow,
    subjectRef:manifest.subjectRef,
    sourceScopes:manifest.sourceScopes,
    budgets:manifest.budgets,
    stopConditions:manifest.stopConditions,
    humanReviewRequired:manifest.humanReviewRequired,
    publicationEnabled:manifest.publicationEnabled
  });
  if(manifest.networkAuthorizedByManifest!==false||manifest.adverseFinding!==false||
     manifest.manifestSha256!==rebuilt.manifestSha256)
    throw new Error("ARCA_M5_MANIFEST_INTEGRITY_INVALID");
  return rebuilt;
}

function custodyInput(input={}){
  exactKeys(input,["source","scopeSha256","revision","custody","normalizationState"],"ARCA_M5_CUSTODY_INPUT_UNEXPECTED_FIELD");
  if(!SOURCES.includes(input.source))throw new Error("ARCA_M5_CUSTODY_SOURCE_INVALID");
  exactKeys(input.custody,["status","private","envelopeSha256","receiptSha256"],"ARCA_M5_CUSTODY_INVALID");
  if(input.custody.status!=="VERIFIED"||input.custody.private!==true)throw new Error("ARCA_M5_CUSTODY_NOT_VERIFIED");
  const normalizationState=text(input.normalizationState,"ARCA_M5_NORMALIZATION_STATE_INVALID",40);
  if(!NORMALIZATION_STATES.has(normalizationState))throw new Error("ARCA_M5_NORMALIZATION_STATE_INVALID");
  return Object.freeze({
    source:input.source,
    scopeSha256:hex(input.scopeSha256,64,"ARCA_M5_CUSTODY_SCOPE_HASH_INVALID"),
    revision:hex(input.revision,40,"ARCA_M5_CUSTODY_REVISION_INVALID"),
    custody:Object.freeze({
      status:"VERIFIED",
      private:true,
      envelopeSha256:hex(input.custody.envelopeSha256,64,"ARCA_M5_CUSTODY_ENVELOPE_HASH_INVALID"),
      receiptSha256:hex(input.custody.receiptSha256,64,"ARCA_M5_CUSTODY_RECEIPT_HASH_INVALID")
    }),
    normalizationState
  });
}

export function evaluateM5PreCorrelationGate({manifest,inputs}={}){
  const verifiedManifest=verifyM5InvestigationManifest(manifest);
  if(!Array.isArray(inputs)||inputs.length!==2)throw new Error("ARCA_M5_CUSTODY_TWO_SOURCES_REQUIRED");
  const normalized=inputs.map(custodyInput);
  if(new Set(normalized.map(item=>item.source)).size!==2)throw new Error("ARCA_M5_CUSTODY_DUPLICATE_SOURCE");
  for(const source of SOURCES){
    const item=normalized.find(candidate=>candidate.source===source);
    if(!item)throw new Error("ARCA_M5_CUSTODY_SOURCE_MISSING");
    const expected=verifiedManifest.sourceScopes[source];
    if(item.scopeSha256!==expected.scopeSha256)throw new Error("ARCA_M5_CUSTODY_SCOPE_MISMATCH");
    if(item.revision!==expected.revision)throw new Error("ARCA_M5_CUSTODY_REVISION_MISMATCH");
  }
  const blocked=normalized
    .filter(item=>item.normalizationState!=="NORMALIZED")
    .map(item=>Object.freeze({source:item.source,normalizationState:item.normalizationState}))
    .sort((a,b)=>a.source.localeCompare(b.source));
  const evidence=normalized
    .map(item=>Object.freeze({
      source:item.source,
      scopeSha256:item.scopeSha256,
      revision:item.revision,
      envelopeSha256:item.custody.envelopeSha256,
      receiptSha256:item.custody.receiptSha256,
      normalizationState:item.normalizationState
    }))
    .sort((a,b)=>a.source.localeCompare(b.source));
  const base={
    schema:M5_PRECORRELATION_GATE_SCHEMA,
    manifestSha256:verifiedManifest.manifestSha256,
    status:blocked.length===0?"READY_FOR_CORRELATION":"BLOCKED",
    readyForCorrelation:blocked.length===0,
    custodyVerified:true,
    evidence:Object.freeze(evidence),
    blockedSources:Object.freeze(blocked),
    networkUsed:false,
    publicationAttempted:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({...base,gateSha256:sha256(base)});
}

export function loadM5PhaseAFixture(document={}){
  exactKeys(document,["schema","manifestInput","custodyInputs"],"ARCA_M5_PHASE_A_FIXTURE_INVALID");
  if(document.schema!=="arca.m5-phase-a-fixture.v1")throw new Error("ARCA_M5_PHASE_A_FIXTURE_SCHEMA_INVALID");
  return Object.freeze({
    schema:document.schema,
    manifestInput:structuredClone(document.manifestInput),
    custodyInputs:structuredClone(document.custodyInputs)
  });
}
