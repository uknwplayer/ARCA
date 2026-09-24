import {canonicalJson,sha256} from "./public-source-contract.mjs";

export const M5_PNCP_LIVE_NORMALIZED_BINDING_SCHEMA=
  "arca.m5-pncp-live-normalized-binding.v1";

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

export function buildM5PncpLiveNormalizedBinding(input={}){
  const base={
    schema:M5_PNCP_LIVE_NORMALIZED_BINDING_SCHEMA,
    version:1,
    source:"PNCP",
    capture:Object.freeze({
      runId:text(input.captureRunId,"ARCA_M5_J_CAPTURE_RUN_INVALID",32),
      revision:h40(input.captureRevision,"ARCA_M5_J_CAPTURE_REVISION_INVALID"),
      scopeSha256:h64(input.captureScopeSha256,"ARCA_M5_J_CAPTURE_SCOPE_INVALID"),
      envelopeSha256:h64(input.captureEnvelopeSha256,"ARCA_M5_J_CAPTURE_ENVELOPE_INVALID"),
      receiptSha256:h64(input.captureReceiptSha256,"ARCA_M5_J_CAPTURE_RECEIPT_INVALID"),
      observedStructureSha256:h64(input.observedStructureSha256,"ARCA_M5_J_STRUCTURE_HASH_INVALID"),
      pageFileSha256:h64(input.pageFileSha256,"ARCA_M5_J_PAGE_HASH_INVALID")
    }),
    parser:Object.freeze({
      contractSha256:h64(input.parserContractSha256,"ARCA_M5_J_PARSER_HASH_INVALID")
    }),
    normalization:Object.freeze({
      runId:text(input.normalizationRunId,"ARCA_M5_J_NORMALIZATION_RUN_INVALID",32),
      executorRevision:h40(input.executorRevision,"ARCA_M5_J_EXECUTOR_REVISION_INVALID"),
      normalizationSha256:h64(input.normalizationSha256,"ARCA_M5_J_NORMALIZATION_HASH_INVALID"),
      normalizedEnvelopeSha256:h64(input.normalizedEnvelopeSha256,"ARCA_M5_J_NORMALIZED_ENVELOPE_INVALID"),
      normalizedContentRootSha256:h64(input.normalizedContentRootSha256,"ARCA_M5_J_NORMALIZED_CONTENT_ROOT_INVALID"),
      normalizedStoreReceiptSha256:h64(input.normalizedStoreReceiptSha256,"ARCA_M5_J_STORE_RECEIPT_INVALID"),
      proofSha256:h64(input.proofSha256,"ARCA_M5_J_PROOF_HASH_INVALID"),
      recordCount:positiveInt(input.recordCount,"ARCA_M5_J_RECORD_COUNT_INVALID"),
      private:true,
      normalizationState:"NORMALIZED",
      sourceNetworkUsed:false,
      pncpRequestUsed:false,
      publicationAttempted:false,
      correlationAttempted:false
    }),
    coverage:Object.freeze({
      supplierObserved:input.supplierObserved===false?false:
        (()=>{throw new Error("ARCA_M5_J_SUPPLIER_COVERAGE_INVALID")})(),
      supplierIdentifierAvailable:false,
      supplierMayBeInferred:false
    }),
    humanReviewRequired:true,
    adverseFinding:false,
    publicationAuthorized:false,
    correlationAuthorized:false
  };
  return Object.freeze({...base,bindingSha256:sha256(canonicalJson(base))});
}

export function buildM5PhaseBPncpInputs(binding){
  if(!binding||binding.schema!==M5_PNCP_LIVE_NORMALIZED_BINDING_SCHEMA)
    throw new Error("ARCA_M5_J_BINDING_SCHEMA_INVALID");
  const {bindingSha256,...body}=binding;
  if(sha256(canonicalJson(body))!==bindingSha256)
    throw new Error("ARCA_M5_J_BINDING_INTEGRITY_INVALID");
  if(binding.source!=="PNCP"||
     binding.normalization.normalizationState!=="NORMALIZED"||
     binding.normalization.private!==true||
     binding.normalization.sourceNetworkUsed!==false||
     binding.normalization.pncpRequestUsed!==false||
     binding.normalization.publicationAttempted!==false||
     binding.normalization.correlationAttempted!==false||
     binding.coverage.supplierObserved!==false||
     binding.coverage.supplierIdentifierAvailable!==false||
     binding.coverage.supplierMayBeInferred!==false||
     binding.humanReviewRequired!==true||
     binding.adverseFinding!==false||
     binding.publicationAuthorized!==false||
     binding.correlationAuthorized!==false)
    throw new Error("ARCA_M5_J_BINDING_STATE_INVALID");

  return Object.freeze({
    custodyInput:Object.freeze({
      source:"PNCP",
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
      source:"PNCP",
      custodyEnvelopeSha256:binding.capture.envelopeSha256,
      custodyReceiptSha256:binding.capture.receiptSha256,
      observedSchemaSha256:binding.capture.observedStructureSha256,
      normalizationSha256:binding.normalization.normalizationSha256,
      normalizationState:"NORMALIZED"
    }),
    derivedNormalization:Object.freeze({
      normalizedEnvelopeSha256:binding.normalization.normalizedEnvelopeSha256,
      normalizedStoreReceiptSha256:binding.normalization.normalizedStoreReceiptSha256,
      normalizationProofSha256:binding.normalization.proofSha256,
      bindingSha256:binding.bindingSha256
    }),
    coverage:Object.freeze({
      supplierObserved:false,
      supplierIdentifierAvailable:false,
      supplierMayBeInferred:false
    })
  });
}
