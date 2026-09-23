import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {
  GATE046_OBSERVED_SCHEMA_SHA256,
  M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256
} from "./m5-portal-related-documents-parser.mjs";

export const M5_PORTAL_PARSER_ADMISSION_CANDIDATE_SCHEMA="arca.m5-portal-parser-admission-candidate.v1";
export const M5_PORTAL_PARSER_ADMISSION_DECISION_SCHEMA="arca.m5-portal-parser-admission-decision.v1";

const HASH64=/^[a-f0-9]{64}$/;
const REV40=/^[a-f0-9]{40}$/;

function hash64(value,code){
  const out=String(value??"").trim().toLowerCase();
  if(!HASH64.test(out))throw new Error(code);
  return out;
}
function revision(value){
  const out=String(value??"").trim().toLowerCase();
  if(!REV40.test(out))throw new Error("ARCA_M5_G_REVISION_INVALID");
  return out;
}
function text(value,code,max=160){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/u.test(out))
    throw new Error(code);
  return out;
}
function instant(value){
  const out=text(value,"ARCA_M5_G_REVIEWED_AT_INVALID",64);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(out))
    throw new Error("ARCA_M5_G_REVIEWED_AT_INVALID");
  return out;
}

export function buildPortalParserAdmissionCandidate({
  revision:codeRevision,
  liveRunId="35917902630",
  observedSchemaSha256=GATE046_OBSERVED_SCHEMA_SHA256,
  parserContractSha256=M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256,
  custodyEnvelopeSha256,
  custodyReceiptSha256,
  responseBytesSha256,
  scopeSha256
}={}){
  const base={
    schema:M5_PORTAL_PARSER_ADMISSION_CANDIDATE_SCHEMA,
    version:1,
    status:"AWAITING_HUMAN_ADMISSION",
    revision:revision(codeRevision),
    liveRunId:text(liveRunId,"ARCA_M5_G_LIVE_RUN_INVALID",32),
    observedSchemaSha256:hash64(observedSchemaSha256,"ARCA_M5_G_SCHEMA_HASH_INVALID"),
    parserContractSha256:hash64(parserContractSha256,"ARCA_M5_G_PARSER_CONTRACT_HASH_INVALID"),
    custodyEnvelopeSha256:hash64(custodyEnvelopeSha256,"ARCA_M5_G_ENVELOPE_HASH_INVALID"),
    custodyReceiptSha256:hash64(custodyReceiptSha256,"ARCA_M5_G_RECEIPT_HASH_INVALID"),
    responseBytesSha256:hash64(responseBytesSha256,"ARCA_M5_G_RESPONSE_HASH_INVALID"),
    scopeSha256:hash64(scopeSha256,"ARCA_M5_G_SCOPE_HASH_INVALID"),
    parserImplementationReady:true,
    liveNormalizationAuthorized:false,
    networkAuthorized:false,
    publicationAuthorized:false,
    correlationAuthorized:false,
    humanAdmissionRequired:true,
    rawBytesIncluded:false,
    sourceValuesIncluded:false
  };
  if(base.observedSchemaSha256!==GATE046_OBSERVED_SCHEMA_SHA256||
     base.parserContractSha256!==M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256)
    throw new Error("ARCA_M5_G_PARSER_BINDING_MISMATCH");
  return Object.freeze({...base,candidateSha256:sha256(canonicalJson(base))});
}

export function recordPortalParserAdmissionDecision({
  candidate,
  expectedCandidateSha256,
  decision,
  reviewerRef,
  reviewedAt
}={}){
  if(!candidate||candidate.schema!==M5_PORTAL_PARSER_ADMISSION_CANDIDATE_SCHEMA)
    throw new Error("ARCA_M5_G_CANDIDATE_INVALID");
  const {candidateSha256,...candidateBase}=candidate;
  const rebuilt=sha256(canonicalJson(candidateBase));
  if(candidateSha256!==rebuilt||
     hash64(expectedCandidateSha256,"ARCA_M5_G_EXPECTED_CANDIDATE_HASH_INVALID")!==rebuilt)
    throw new Error("ARCA_M5_G_CANDIDATE_HASH_MISMATCH");
  if(candidate.status!=="AWAITING_HUMAN_ADMISSION"||
     candidate.liveNormalizationAuthorized!==false||
     candidate.networkAuthorized!==false||
     candidate.publicationAuthorized!==false||
     candidate.correlationAuthorized!==false)
    throw new Error("ARCA_M5_G_CANDIDATE_STATE_INVALID");

  const normalizedDecision=text(decision,"ARCA_M5_G_DECISION_INVALID",64);
  if(!["ADMIT_FOR_CUSTODIAL_NORMALIZATION","REJECT_PARSER","HOLD_FOR_MORE_EVIDENCE"].includes(normalizedDecision))
    throw new Error("ARCA_M5_G_DECISION_INVALID");

  const admitted=normalizedDecision==="ADMIT_FOR_CUSTODIAL_NORMALIZATION";
  const base={
    schema:M5_PORTAL_PARSER_ADMISSION_DECISION_SCHEMA,
    version:1,
    candidateSha256:rebuilt,
    revision:candidate.revision,
    liveRunId:candidate.liveRunId,
    observedSchemaSha256:candidate.observedSchemaSha256,
    parserContractSha256:candidate.parserContractSha256,
    custodyEnvelopeSha256:candidate.custodyEnvelopeSha256,
    custodyReceiptSha256:candidate.custodyReceiptSha256,
    responseBytesSha256:candidate.responseBytesSha256,
    scopeSha256:candidate.scopeSha256,
    decision:normalizedDecision,
    reviewerRef:text(reviewerRef,"ARCA_M5_G_REVIEWER_INVALID",160),
    reviewedAt:instant(reviewedAt),
    normalizationAuthorized:admitted,
    networkAuthorized:false,
    publicationAuthorized:false,
    correlationAuthorized:false,
    humanReviewRecorded:true
  };
  return Object.freeze({...base,decisionSha256:sha256(canonicalJson(base))});
}
