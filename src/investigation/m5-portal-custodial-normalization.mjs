import fs from "node:fs";
import path from "node:path";
import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {openCustodyEnvelope,sealCustodyDirectory} from "../machine-bridge/encrypted-custody-envelope.mjs";
import {observePortalJsonSchema} from "./m5-portal-schema-observer.mjs";
import {
  GATE046_OBSERVED_SCHEMA_SHA256,
  M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256,
  normalizePortalRelatedDocumentRecord
} from "./m5-portal-related-documents-parser.mjs";
import {
  recordPortalParserAdmissionDecision
} from "./m5-portal-parser-admission.mjs";

export const M5_PORTAL_CUSTODIAL_NORMALIZATION_PROOF_SCHEMA=
  "arca.m5-portal-custodial-normalization-proof.v1";

function exactDecision(candidate,decision){
  const rebuilt=recordPortalParserAdmissionDecision({
    candidate,
    expectedCandidateSha256:candidate.candidateSha256,
    decision:decision.decision,
    reviewerRef:decision.reviewerRef,
    reviewedAt:decision.reviewedAt
  });
  if(canonicalJson(rebuilt)!==canonicalJson(decision))
    throw new Error("ARCA_M5_H_ADMISSION_DECISION_INTEGRITY_INVALID");
  if(rebuilt.normalizationAuthorized!==true||
     rebuilt.networkAuthorized!==false||
     rebuilt.publicationAuthorized!==false||
     rebuilt.correlationAuthorized!==false)
    throw new Error("ARCA_M5_H_ADMISSION_DECISION_NOT_AUTHORIZED");
  return rebuilt;
}
function envelopeHash(envelope){
  return sha256(JSON.stringify(envelope));
}
function decodeRecords(bytes){
  let text;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
  catch{throw new Error("ARCA_M5_H_UTF8_INVALID")}
  let parsed;
  try{parsed=JSON.parse(text)}
  catch{throw new Error("ARCA_M5_H_JSON_INVALID")}
  if(!Array.isArray(parsed)||parsed.length<1||parsed.length>25)
    throw new Error("ARCA_M5_H_RECORD_BUDGET_INVALID");
  return parsed;
}
function privatePayload({candidate,decision,records,normalizationSha256}){
  return {
    schema:"arca.m5-portal-custodial-normalization-private.v1",
    candidateSha256:candidate.candidateSha256,
    decisionSha256:decision.decisionSha256,
    parserContractSha256:candidate.parserContractSha256,
    observedSchemaSha256:candidate.observedSchemaSha256,
    sourceResponseBytesSha256:candidate.responseBytesSha256,
    normalizationSha256,
    recordCount:records.length,
    records
  };
}

export function runPortalCustodialNormalizationOffline({
  envelope,
  passphrase,
  candidate,
  decision,
  sourceRepository="uknwplayer/ARCA",
  outputDir=null,
  sealedAt=new Date()
}={}){
  if(candidate?.observedSchemaSha256!==GATE046_OBSERVED_SCHEMA_SHA256||
     candidate?.parserContractSha256!==M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256)
    throw new Error("ARCA_M5_H_PARSER_BINDING_MISMATCH");
  const admitted=exactDecision(candidate,decision);
  if(envelopeHash(envelope)!==candidate.custodyEnvelopeSha256)
    throw new Error("ARCA_M5_H_ENVELOPE_HASH_MISMATCH");
  if(envelope.scopeHash!==candidate.scopeSha256)
    throw new Error("ARCA_M5_H_SCOPE_HASH_MISMATCH");

  const payload=openCustodyEnvelope({envelope,passphrase});
  if(!Array.isArray(payload.files)||payload.files.length!==1||
     payload.files[0].path!=="response.bin")
    throw new Error("ARCA_M5_H_CUSTODY_PAYLOAD_INVALID");
  const responseBytes=Buffer.from(payload.files[0].data,"base64");
  if(sha256(responseBytes)!==candidate.responseBytesSha256)
    throw new Error("ARCA_M5_H_RESPONSE_HASH_MISMATCH");

  const observation=observePortalJsonSchema({
    bytes:responseBytes,
    custodyBinding:{
      source:"PORTAL",
      scopeSha256:candidate.scopeSha256,
      custodyEnvelopeSha256:candidate.custodyEnvelopeSha256,
      custodyReceiptSha256:candidate.custodyReceiptSha256,
      responseBytesSha256:candidate.responseBytesSha256
    },
    sourceCaptureNetworkUsed:true
  });
  if(observation.observationState!=="SCHEMA_OBSERVED"||
     observation.observedSchemaSha256!==candidate.observedSchemaSha256)
    throw new Error("ARCA_M5_H_OBSERVED_SCHEMA_MISMATCH");

  const sourceRecords=decodeRecords(responseBytes);
  const records=sourceRecords.map(normalizePortalRelatedDocumentRecord);
  const normalizationBody={
    schema:"arca.m5-portal-custodial-normalization.v1",
    parserContractSha256:candidate.parserContractSha256,
    observedSchemaSha256:candidate.observedSchemaSha256,
    candidateSha256:candidate.candidateSha256,
    decisionSha256:admitted.decisionSha256,
    sourceResponseBytesSha256:candidate.responseBytesSha256,
    recordCount:records.length,
    records
  };
  const normalizationSha256=sha256(canonicalJson(normalizationBody));
  const privateDoc=privatePayload({
    candidate,decision:admitted,records,normalizationSha256
  });

  let normalizedEnvelope=null;
  if(outputDir!==null){
    const root=path.resolve(outputDir);
    const staging=path.join(root,"staging-private");
    fs.rmSync(staging,{recursive:true,force:true});
    fs.mkdirSync(staging,{recursive:true,mode:0o700});
    try{
      fs.writeFileSync(
        path.join(staging,"normalized-private.json"),
        canonicalJson(privateDoc)+"\n",
        {encoding:"utf8",mode:0o600,flag:"wx"}
      );
      normalizedEnvelope=sealCustodyDirectory({
        root:staging,
        passphrase,
        repository:sourceRepository,
        revision:candidate.revision,
        scopeHash:candidate.scopeSha256,
        sealedAt
      });
      fs.writeFileSync(
        path.join(root,"portal-normalization.envelope.json"),
        JSON.stringify(normalizedEnvelope,null,2)+"\n",
        {encoding:"utf8",mode:0o600,flag:"wx"}
      );
    }finally{
      fs.rmSync(staging,{recursive:true,force:true});
    }
  }

  const proofBase={
    schema:M5_PORTAL_CUSTODIAL_NORMALIZATION_PROOF_SCHEMA,
    version:1,
    status:"NORMALIZED_CUSTODIAL_OFFLINE",
    candidateSha256:candidate.candidateSha256,
    decisionSha256:admitted.decisionSha256,
    parserContractSha256:candidate.parserContractSha256,
    observedSchemaSha256:candidate.observedSchemaSha256,
    custodyEnvelopeSha256:candidate.custodyEnvelopeSha256,
    custodyReceiptSha256:candidate.custodyReceiptSha256,
    responseBytesSha256:candidate.responseBytesSha256,
    scopeSha256:candidate.scopeSha256,
    recordCount:records.length,
    normalizationSha256,
    ...(normalizedEnvelope?{
      normalizedEnvelopeSha256:envelopeHash(normalizedEnvelope),
      normalizedContentRootSha256:normalizedEnvelope.contentRootHash
    }:{}),
    sourceNetworkUsed:false,
    portalRequestUsed:false,
    publicationAttempted:false,
    correlationAttempted:false,
    normalizedValuesIncludedInProof:false,
    rawBytesIncludedInProof:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({
    proof:Object.freeze({...proofBase,proofSha256:sha256(canonicalJson(proofBase))}),
    normalizedEnvelope
  });
}
