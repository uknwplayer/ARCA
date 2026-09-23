import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {canonicalJson,sha256} from "./public-source-contract.mjs";
import {openCustodyEnvelope,sealCustodyDirectory} from "../machine-bridge/encrypted-custody-envelope.mjs";
import {observePncpCustodyStructure} from "./m5-pncp-custody-structure-observer.mjs";
import {
  M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256,
  M5_PNCP_AP_PAGE_FILE_SHA256,
  M5_PNCP_LIVE_PARSER_CONTRACT_SHA256,
  normalizePncpLiveProcurementRecord
} from "./m5-pncp-live-parser.mjs";

export const M5_PNCP_CUSTODIAL_NORMALIZATION_PROOF_SCHEMA=
  "arca.m5-pncp-custodial-normalization-proof.v1";

const shaBytes=v=>createHash("sha256").update(v).digest("hex");

function exactKeys(value,expected,code){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(code);
  const a=Object.keys(value).sort(),b=[...expected].sort();
  if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(code);
}
function loadPage(payload){
  const matches=(payload.files??[]).filter(file=>file.sha256===M5_PNCP_AP_PAGE_FILE_SHA256);
  if(matches.length!==1)throw new Error("ARCA_M5_PNCP_NORM_PAGE_FILE_NOT_UNIQUE");
  const file=matches[0];
  const bytes=Buffer.from(file.data,"base64");
  if(shaBytes(bytes)!==M5_PNCP_AP_PAGE_FILE_SHA256)
    throw new Error("ARCA_M5_PNCP_NORM_PAGE_HASH_MISMATCH");
  let page;
  try{page=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
  catch{throw new Error("ARCA_M5_PNCP_NORM_PAGE_JSON_INVALID")}
  exactKeys(page,["data","empty","numeroPagina","paginasRestantes","totalPaginas","totalRegistros"],
    "ARCA_M5_PNCP_NORM_PAGE_SCHEMA_DRIFT");
  if(!Array.isArray(page.data)||page.data.length<1||page.data.length>10)
    throw new Error("ARCA_M5_PNCP_NORM_RECORD_BUDGET_INVALID");
  return {page,file};
}
function readAuth(auth){
  if(auth?.schema!=="arca.m5-pncp-normalization-authorization.v1"||
     auth.authorizationBasis!=="operator-general-continuation-current-chat"||
     auth.constraints?.newPncpGetAuthorized!==false||
     auth.constraints?.publicationAuthorized!==false||
     auth.constraints?.correlationAuthorized!==false)
    throw new Error("ARCA_M5_PNCP_NORM_AUTH_INVALID");
  if(auth.observedStructureSha256!==M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256||
     auth.pageFileSha256!==M5_PNCP_AP_PAGE_FILE_SHA256||
     auth.parserContractSha256!==M5_PNCP_LIVE_PARSER_CONTRACT_SHA256)
    throw new Error("ARCA_M5_PNCP_NORM_AUTH_BINDING_MISMATCH");
  return auth;
}

export function runPncpCustodialNormalizationOffline({
  envelope,
  passphrase,
  authorization,
  sourceRepository="uknwplayer/ARCA",
  executorRevision=null,
  outputDir=null,
  sealedAt=new Date()
}={}){
  const auth=readAuth(authorization);
  const envelopeSha256=sha256(JSON.stringify(envelope));
  if(envelopeSha256!==auth.custodyEnvelopeSha256)
    throw new Error("ARCA_M5_PNCP_NORM_ENVELOPE_HASH_MISMATCH");
  if(envelope.scopeHash!==auth.scopeSha256||envelope.revision!==auth.captureRevision)
    throw new Error("ARCA_M5_PNCP_NORM_CAPTURE_BINDING_MISMATCH");

  const observation=observePncpCustodyStructure({
    envelope,passphrase,
    expectedEnvelopeSha256:auth.custodyEnvelopeSha256,
    expectedReceiptSha256:auth.custodyReceiptSha256,
    expectedScopeSha256:auth.scopeSha256,
    captureRunId:auth.captureRunId,
    observerRevision:executorRevision
  });
  if(observation.observedStructureSha256!==auth.observedStructureSha256)
    throw new Error("ARCA_M5_PNCP_NORM_STRUCTURE_MISMATCH");

  const payload=openCustodyEnvelope({envelope,passphrase});
  const {page}=loadPage(payload);
  const records=page.data.map(normalizePncpLiveProcurementRecord);
  const normalizationBody={
    schema:"arca.m5-pncp-custodial-normalization.v1",
    parserContractSha256:auth.parserContractSha256,
    observedStructureSha256:auth.observedStructureSha256,
    sourceEnvelopeSha256:auth.custodyEnvelopeSha256,
    sourceReceiptSha256:auth.custodyReceiptSha256,
    sourceScopeSha256:auth.scopeSha256,
    pageFileSha256:auth.pageFileSha256,
    recordCount:records.length,
    records
  };
  const normalizationSha256=sha256(canonicalJson(normalizationBody));
  const privateDoc={
    ...normalizationBody,
    normalizationSha256,
    sourceCaptureRunId:auth.captureRunId
  };

  let normalizedEnvelope=null;
  if(outputDir!==null){
    const root=path.resolve(outputDir), staging=path.join(root,"staging-private");
    fs.rmSync(staging,{recursive:true,force:true});
    fs.mkdirSync(staging,{recursive:true,mode:0o700});
    try{
      fs.writeFileSync(path.join(staging,"normalized-private.json"),canonicalJson(privateDoc)+"\n",{
        encoding:"utf8",mode:0o600,flag:"wx"
      });
      normalizedEnvelope=sealCustodyDirectory({
        root:staging,passphrase,repository:sourceRepository,
        revision:String(executorRevision??auth.captureRevision),
        scopeHash:auth.scopeSha256,sealedAt
      });
      fs.writeFileSync(path.join(root,"pncp-normalization.envelope.json"),
        JSON.stringify(normalizedEnvelope,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
    }finally{fs.rmSync(staging,{recursive:true,force:true})}
  }

  const proofBase={
    schema:M5_PNCP_CUSTODIAL_NORMALIZATION_PROOF_SCHEMA,
    version:1,
    status:"NORMALIZED_CUSTODIAL_OFFLINE",
    source:"PNCP",
    executorRevision:String(executorRevision??auth.captureRevision).toLowerCase(),
    captureRunId:auth.captureRunId,
    custodyEnvelopeSha256:auth.custodyEnvelopeSha256,
    custodyReceiptSha256:auth.custodyReceiptSha256,
    scopeSha256:auth.scopeSha256,
    observedStructureSha256:auth.observedStructureSha256,
    pageFileSha256:auth.pageFileSha256,
    parserContractSha256:auth.parserContractSha256,
    recordCount:records.length,
    normalizationSha256,
    ...(normalizedEnvelope?{
      normalizedEnvelopeSha256:sha256(JSON.stringify(normalizedEnvelope)),
      normalizedContentRootSha256:normalizedEnvelope.contentRootHash
    }:{}),
    supplierObserved:false,
    sourceNetworkUsed:false,
    pncpRequestUsed:false,
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
