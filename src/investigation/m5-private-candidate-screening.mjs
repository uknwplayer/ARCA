import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {openCustodyEnvelope} from "../machine-bridge/encrypted-custody-envelope.mjs";
import {buildM5PhaseBPortalInputs} from "./m5-portal-live-normalized-binding.mjs";
import {buildM5PhaseBPncpInputs} from "./m5-pncp-live-normalized-binding.mjs";

export const M5_PRIVATE_CANDIDATE_SCREENING_SCHEMA=
  "arca.m5-private-candidate-screening.v1";

function envelopeHash(envelope){return sha256(JSON.stringify(envelope))}
function exactPrivateFile(envelope,passphrase){
  const payload=openCustodyEnvelope({envelope,passphrase});
  if(!Array.isArray(payload.files)||payload.files.length!==1||
     payload.files[0].path!=="normalized-private.json")
    throw new Error("ARCA_M5_L_PRIVATE_PAYLOAD_INVALID");
  let doc;
  try{doc=JSON.parse(Buffer.from(payload.files[0].data,"base64").toString("utf8"))}
  catch{throw new Error("ARCA_M5_L_PRIVATE_JSON_INVALID")}
  return doc;
}
function validatePortalDoc(doc,binding){
  if(doc?.schema!=="arca.m5-portal-custodial-normalization-private.v1"||
     !Array.isArray(doc.records)||doc.records.length!==doc.recordCount||
     doc.recordCount!==binding.normalization.recordCount)
    throw new Error("ARCA_M5_L_PORTAL_PRIVATE_DOC_INVALID");
  const body={
    schema:"arca.m5-portal-custodial-normalization.v1",
    parserContractSha256:doc.parserContractSha256,
    observedSchemaSha256:doc.observedSchemaSha256,
    candidateSha256:doc.candidateSha256,
    decisionSha256:doc.decisionSha256,
    sourceResponseBytesSha256:doc.sourceResponseBytesSha256,
    recordCount:doc.recordCount,
    records:doc.records
  };
  if(sha256(canonicalJson(body))!==doc.normalizationSha256||
     doc.normalizationSha256!==binding.normalization.normalizationSha256)
    throw new Error("ARCA_M5_L_PORTAL_NORMALIZATION_HASH_MISMATCH");
  return doc.records;
}
function validatePncpDoc(doc,binding){
  if(doc?.schema!=="arca.m5-pncp-custodial-normalization.v1"||
     !Array.isArray(doc.records)||doc.records.length!==doc.recordCount||
     doc.recordCount!==binding.normalization.recordCount)
    throw new Error("ARCA_M5_L_PNCP_PRIVATE_DOC_INVALID");
  const {normalizationSha256,sourceCaptureRunId,...body}=doc;
  if(sha256(canonicalJson(body))!==normalizationSha256||
     normalizationSha256!==binding.normalization.normalizationSha256)
    throw new Error("ARCA_M5_L_PNCP_NORMALIZATION_HASH_MISMATCH");
  return doc.records;
}
function fold(value){
  return String(value??"")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g," ")
    .trim()
    .replace(/\s+/g," ");
}
function anyExact(left,right){
  const a=left.map(fold).filter(Boolean),b=new Set(right.map(fold).filter(Boolean));
  return a.some(x=>b.has(x));
}
function dateMs(value){
  const v=String(value??"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error("ARCA_M5_L_DATE_INVALID");
  const ms=Date.parse(v+"T00:00:00.000Z");
  if(!Number.isFinite(ms))throw new Error("ARCA_M5_L_DATE_INVALID");
  return ms;
}
function safeInt(value,code){
  if(!Number.isSafeInteger(value))throw new Error(code);
  return value;
}
function screenPair(portal,pncp){
  const documentReferenceExact=anyExact(
    [portal.documentCode,portal.documentSummary],
    [pncp.procurementControlNumber,pncp.purchaseNumber,pncp.processNumber]
  );
  const agencyTextExact=anyExact(
    [portal.superiorAgencyText,portal.linkedAgencyText,portal.managementUnitText],
    [pncp.agencyName,pncp.unitName]
  );
  const portalAmount=safeInt(portal.amountCents,"ARCA_M5_L_PORTAL_AMOUNT_INVALID");
  const pncpAmount=safeInt(pncp.estimatedValueCents,"ARCA_M5_L_PNCP_AMOUNT_INVALID");
  const days=Math.abs(dateMs(portal.date)-dateMs(pncp.publishedAt))/86400000;
  if(!Number.isSafeInteger(days))throw new Error("ARCA_M5_L_DATE_DISTANCE_INVALID");
  const classification=(documentReferenceExact||agencyTextExact)?"CANDIDATE":"NOT_OBSERVED";
  const pairBody={
    portalRecordRef:String(portal.recordRef),
    pncpRecordRef:String(pncp.recordRef)
  };
  return Object.freeze({
    pairRef:`m5l:pair:sha256:${sha256(canonicalJson(pairBody))}`,
    portalRecordRef:String(portal.recordRef),
    pncpRecordRef:String(pncp.recordRef),
    classification,
    candidateDimensions:Object.freeze({
      documentReferenceExact,
      agencyTextExact
    }),
    weakContext:Object.freeze({
      sameDate:days===0,
      within30Days:days<=30,
      amountExact:portalAmount===pncpAmount
    }),
    strongBridgeObserved:false,
    supplierCompared:false,
    supplierInferred:false,
    humanReviewRequired:true,
    adverseFinding:false
  });
}

export function runM5PrivateCandidateScreening({
  portalEnvelope,
  portalPassphrase,
  portalBinding,
  pncpEnvelope,
  pncpPassphrase,
  pncpBinding,
  readiness,
  vaultTransportUsed=true
}={}){
  const portalPhaseB=buildM5PhaseBPortalInputs(portalBinding);
  const pncpPhaseB=buildM5PhaseBPncpInputs(pncpBinding);
  if(readiness?.schema!=="arca.m5-correlation-readiness.v1"||
     readiness.status!=="LIMITED_CANDIDATE_SCREENING_ONLY"||
     readiness.readyForStrongCorrelation!==false||
     readiness.readyForPrivateCandidateScreening!==true||
     readiness.supplierInferenceAllowed!==false||
     readiness.portalBindingSha256!==portalPhaseB.derivedNormalization.bindingSha256||
     readiness.pncpBindingSha256!==pncpPhaseB.derivedNormalization.bindingSha256)
    throw new Error("ARCA_M5_L_READINESS_INVALID");

  if(envelopeHash(portalEnvelope)!==portalBinding.normalization.normalizedEnvelopeSha256)
    throw new Error("ARCA_M5_L_PORTAL_ENVELOPE_HASH_MISMATCH");
  if(envelopeHash(pncpEnvelope)!==pncpBinding.normalization.normalizedEnvelopeSha256)
    throw new Error("ARCA_M5_L_PNCP_ENVELOPE_HASH_MISMATCH");

  const portalRecords=validatePortalDoc(
    exactPrivateFile(portalEnvelope,portalPassphrase),portalBinding
  );
  const pncpRecords=validatePncpDoc(
    exactPrivateFile(pncpEnvelope,pncpPassphrase),pncpBinding
  );
  if(portalRecords.length*pncpRecords.length>100)
    throw new Error("ARCA_M5_L_PAIR_BUDGET_EXCEEDED");

  const pairs=Object.freeze(portalRecords.flatMap(portal=>
    pncpRecords.map(pncp=>screenPair(portal,pncp))
  ));
  const candidateCount=pairs.filter(x=>x.classification==="CANDIDATE").length;
  const notObservedCount=pairs.length-candidateCount;
  const base={
    schema:M5_PRIVATE_CANDIDATE_SCREENING_SCHEMA,
    version:1,
    status:candidateCount>0?"CANDIDATE_PAIRS_OBSERVED":"NO_CANDIDATE_BRIDGE_OBSERVED",
    readinessSha256:readiness.readinessSha256,
    portalBindingSha256:portalBinding.bindingSha256,
    pncpBindingSha256:pncpBinding.bindingSha256,
    pairCount:pairs.length,
    candidateCount,
    notObservedCount,
    pairs,
    strongBridgeObserved:false,
    confirmedCount:0,
    supplierBridgeObserved:false,
    supplierInferenceAllowed:false,
    candidateScreeningAttempted:true,
    correlationAttempted:false,
    sourceNetworkUsed:false,
    vaultTransportUsed:vaultTransportUsed===true,
    portalRequestUsed:false,
    pncpRequestUsed:false,
    publicationAttempted:false,
    privateValuesIncluded:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({...base,screeningSha256:sha256(canonicalJson(base))});
}
