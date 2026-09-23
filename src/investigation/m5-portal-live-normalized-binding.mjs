import {canonicalJson,sha256} from "./public-source-contract.mjs";

export const M5_PORTAL_LIVE_NORMALIZED_BINDING_SCHEMA=
  "arca.m5-portal-live-normalized-binding.v1";

const H64=/^[a-f0-9]{64}$/;
const H40=/^[a-f0-9]{40}$/;

function text(value,code,max=160){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/u.test(out))throw new Error(code);
  return out;
}
function h64(value,code){
  const out=text(value,code,64).toLowerCase();
  if(!H64.test(out))throw new Error(code);
  return out;
}
function h40(value,code){
  const out=text(value,code,40).toLowerCase();
  if(!H40.test(out))throw new Error(code);
  return out;
}
function positiveInt(value,code){
  if(!Number.isSafeInteger(value)||value<1||value>25)throw new Error(code);
  return value;
}

export function buildM5PortalLiveNormalizedBinding(input={}){
  const base={
    schema:M5_PORTAL_LIVE_NORMALIZED_BINDING_SCHEMA,
    version:1,
    source:"PORTAL",
    capture:Object.freeze({
      runId:text(input.captureRunId,"ARCA_M5_I_CAPTURE_RUN_INVALID",32),
      revision:h40(input.captureRevision,"ARCA_M5_I_CAPTURE_REVISION_INVALID"),
      scopeSha256:h64(input.captureScopeSha256,"ARCA_M5_I_CAPTURE_SCOPE_INVALID"),
      envelopeSha256:h64(input.captureEnvelopeSha256,"ARCA_M5_I_CAPTURE_ENVELOPE_INVALID"),
      receiptSha256:h64(input.captureReceiptSha256,"ARCA_M5_I_CAPTURE_RECEIPT_INVALID"),
      responseBytesSha256:h64(input.responseBytesSha256,"ARCA_M5_I_RESPONSE_HASH_INVALID"),
      observedSchemaSha256:h64(input.observedSchemaSha256,"ARCA_M5_I_SCHEMA_HASH_INVALID")
    }),
    admission:Object.freeze({
      candidateSha256:h64(input.candidateSha256,"ARCA_M5_I_CANDIDATE_HASH_INVALID"),
      decisionSha256:h64(input.decisionSha256,"ARCA_M5_I_DECISION_HASH_INVALID"),
      parserContractSha256:h64(input.parserContractSha256,"ARCA_M5_I_PARSER_HASH_INVALID")
    }),
    normalization:Object.freeze({
      runId:text(input.normalizationRunId,"ARCA_M5_I_NORMALIZATION_RUN_INVALID",32),
      executorRevision:h40(input.executorRevision,"ARCA_M5_I_EXECUTOR_REVISION_INVALID"),
      normalizationSha256:h64(input.normalizationSha256,"ARCA_M5_I_NORMALIZATION_HASH_INVALID"),
      normalizedEnvelopeSha256:h64(input.normalizedEnvelopeSha256,"ARCA_M5_I_NORMALIZED_ENVELOPE_INVALID"),
      normalizedContentRootSha256:h64(input.normalizedContentRootSha256,"ARCA_M5_I_NORMALIZED_CONTENT_ROOT_INVALID"),
      normalizedStoreReceiptSha256:h64(input.normalizedStoreReceiptSha256,"ARCA_M5_I_STORE_RECEIPT_INVALID"),
      proofSha256:h64(input.proofSha256,"ARCA_M5_I_PROOF_HASH_INVALID"),
      recordCount:positiveInt(input.recordCount,"ARCA_M5_I_RECORD_COUNT_INVALID"),
      private:true,
      normalizationState:"NORMALIZED",
      sourceNetworkUsed:false,
      portalRequestUsed:false,
      publicationAttempted:false,
      correlationAttempted:false
    }),
    humanReviewRequired:true,
    adverseFinding:false,
    publicationAuthorized:false,
    correlationAuthorized:false
  };
  return Object.freeze({...base,bindingSha256:sha256(canonicalJson(base))});
}

export function buildM5PhaseBPortalInputs(binding){
  if(!binding||binding.schema!==M5_PORTAL_LIVE_NORMALIZED_BINDING_SCHEMA)
    throw new Error("ARCA_M5_I_BINDING_SCHEMA_INVALID");
  const {bindingSha256,...body}=binding;
  if(sha256(canonicalJson(body))!==bindingSha256)
    throw new Error("ARCA_M5_I_BINDING_INTEGRITY_INVALID");
  if(binding.source!=="PORTAL"||
     binding.normalization.normalizationState!=="NORMALIZED"||
     binding.normalization.private!==true||
     binding.normalization.sourceNetworkUsed!==false||
     binding.normalization.portalRequestUsed!==false||
     binding.normalization.publicationAttempted!==false||
     binding.normalization.correlationAttempted!==false||
     binding.humanReviewRequired!==true||
     binding.adverseFinding!==false||
     binding.publicationAuthorized!==false||
     binding.correlationAuthorized!==false)
    throw new Error("ARCA_M5_I_BINDING_STATE_INVALID");

  return Object.freeze({
    custodyInput:Object.freeze({
      source:"PORTAL",
      scopeSha256:binding.capture.scopeSha256,
      revision:binding.capture.revision,
      custody:Object.freeze({
        status:"VERIFIED",
        private:true,
        envelopeSha256:binding.capture.envelopeSha256,
        receiptSha256:binding.capture.receiptSha256
      }),
      normalizationState:"NORMALIZED"
    }),
    sourceBinding:Object.freeze({
      source:"PORTAL",
      custodyEnvelopeSha256:binding.capture.envelopeSha256,
      custodyReceiptSha256:binding.capture.receiptSha256,
      observedSchemaSha256:binding.capture.observedSchemaSha256,
      normalizationSha256:binding.normalization.normalizationSha256,
      normalizationState:"NORMALIZED"
    }),
    derivedNormalization:Object.freeze({
      normalizedEnvelopeSha256:binding.normalization.normalizedEnvelopeSha256,
      normalizedStoreReceiptSha256:binding.normalization.normalizedStoreReceiptSha256,
      normalizationProofSha256:binding.normalization.proofSha256,
      bindingSha256:binding.bindingSha256
    })
  });
}
