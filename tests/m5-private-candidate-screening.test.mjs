import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {canonicalJson,sha256} from "../src/investigation/public-source-contract.mjs";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {buildM5PortalLiveNormalizedBinding} from "../src/investigation/m5-portal-live-normalized-binding.mjs";
import {buildM5PncpLiveNormalizedBinding} from "../src/investigation/m5-pncp-live-normalized-binding.mjs";
import {evaluateM5CorrelationReadiness} from "../src/investigation/m5-correlation-readiness.mjs";
import {runM5PrivateCandidateScreening} from "../src/investigation/m5-private-candidate-screening.mjs";

const portalPass="synthetic-portal-private-passphrase-012345";
const pncpPass="synthetic-pncp-private-passphrase-01234567";
const h=n=>String(n).repeat(64).slice(0,64);
const r=n=>String(n).repeat(40).slice(0,40);

function sealPrivate(doc,pass,scope,revision){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5l-"));
  fs.writeFileSync(path.join(root,"normalized-private.json"),canonicalJson(doc)+"\n");
  const envelope=sealCustodyDirectory({
    root,passphrase:pass,repository:"uknwplayer/ARCA",
    revision,scopeHash:scope,sealedAt:"2026-09-24T16:00:00.000Z"
  });
  fs.rmSync(root,{recursive:true,force:true});
  return envelope;
}

function setup(){
  const portalRecords=[{
    schema:"arca.m5-portal-related-documents-parser.v1",
    version:1,
    recordRef:"portal:document:sha256:"+"a".repeat(64),
    documentCode:"DOC-PORTAL-1",
    documentSummary:"DOCUMENTO FINANCEIRO",
    date:"2026-09-23",
    phase:"PAGAMENTO",
    species:"PAGAMENTO",
    expenseElement:"ELEMENTO",
    amountCents:10000,
    currency:"BRL",
    beneficiaryText:"FAVORECIDO FICTICIO",
    beneficiaryRef:"portal:beneficiary-text:sha256:"+"b".repeat(64),
    superiorAgencyText:"ORGAO ALFA",
    superiorAgencyRef:"portal:superior-agency-text:sha256:"+"c".repeat(64),
    linkedAgencyText:"ORGAO ALFA",
    linkedAgencyRef:"portal:linked-agency-text:sha256:"+"d".repeat(64),
    managementUnitText:"UNIDADE PORTAL",
    managementUnitRef:"portal:management-unit-text:sha256:"+"e".repeat(64),
    rawRecordSha256:"f".repeat(64),
    identityInferencesMade:false,
    containsSourceValues:true,
    publicationAuthorized:false,
    humanReviewRequired:true
  }];
  const portalBody={
    schema:"arca.m5-portal-custodial-normalization.v1",
    parserContractSha256:"1".repeat(64),
    observedSchemaSha256:"2".repeat(64),
    candidateSha256:"3".repeat(64),
    decisionSha256:"4".repeat(64),
    sourceResponseBytesSha256:"5".repeat(64),
    recordCount:1,
    records:portalRecords
  };
  const portalNorm=sha256(canonicalJson(portalBody));
  const portalDoc={
    schema:"arca.m5-portal-custodial-normalization-private.v1",
    candidateSha256:portalBody.candidateSha256,
    decisionSha256:portalBody.decisionSha256,
    parserContractSha256:portalBody.parserContractSha256,
    observedSchemaSha256:portalBody.observedSchemaSha256,
    sourceResponseBytesSha256:portalBody.sourceResponseBytesSha256,
    normalizationSha256:portalNorm,
    recordCount:1,
    records:portalRecords
  };
  const portalScope="6".repeat(64),portalRev="a".repeat(40);
  const portalEnvelope=sealPrivate(portalDoc,portalPass,portalScope,portalRev);
  const portalBinding=buildM5PortalLiveNormalizedBinding({
    captureRunId:"1",captureRevision:portalRev,captureScopeSha256:portalScope,
    captureEnvelopeSha256:"7".repeat(64),captureReceiptSha256:"8".repeat(64),
    responseBytesSha256:"5".repeat(64),observedSchemaSha256:"2".repeat(64),
    candidateSha256:"3".repeat(64),decisionSha256:"4".repeat(64),
    parserContractSha256:"1".repeat(64),normalizationRunId:"2",
    executorRevision:"b".repeat(40),normalizationSha256:portalNorm,
    normalizedEnvelopeSha256:sha256(JSON.stringify(portalEnvelope)),
    normalizedContentRootSha256:portalEnvelope.contentRootHash,
    normalizedStoreReceiptSha256:"9".repeat(64),proofSha256:"a".repeat(64),recordCount:1
  });

  const pncpRecords=[
    {
      schema:"arca.m5-pncp-live-parser.v1",version:1,
      recordRef:"pncp:control:sha256:"+"1".repeat(64),
      procurementControlNumber:"11111111111111-1-1/2026",
      agencyIdentifier:{namespace:"CNPJ",value:"11111111111111"},
      agencyName:"ORGAO ALFA",unitCode:"U1",unitName:"UNIDADE PNCP",
      municipalityCode:"3550308",municipalityName:"SAO PAULO",uf:"SP",
      year:2026,sequence:1,purchaseNumber:"COMPRA-1",processNumber:"PROC-1",
      modalityId:1,modalityName:"MODALIDADE",disputeModeId:1,disputeModeName:"ABERTO",
      statusId:1,statusName:"PUBLICADA",instrumentCode:1,instrumentName:"EDITAL",
      publishedAt:"2026-09-20",objectDescription:"OBJETO",estimatedValueCents:50000,
      currency:"BRL",srp:false,
      legalBasis:{code:1,name:"LEI",description:"BASE"},
      electronicProcessUrl:null,sourceSystemUrl:null,sourceRecordSha256:"2".repeat(64),
      supplierIdentifier:null,supplierObserved:false,identityInferencesMade:false,
      humanReviewRequired:true,publicationAuthorized:false,correlationAuthorized:false
    },
    {
      schema:"arca.m5-pncp-live-parser.v1",version:1,
      recordRef:"pncp:control:sha256:"+"3".repeat(64),
      procurementControlNumber:"22222222222222-1-2/2026",
      agencyIdentifier:{namespace:"CNPJ",value:"22222222222222"},
      agencyName:"ORGAO BETA",unitCode:"U2",unitName:"UNIDADE BETA",
      municipalityCode:"3550308",municipalityName:"SAO PAULO",uf:"SP",
      year:2026,sequence:2,purchaseNumber:"COMPRA-2",processNumber:"PROC-2",
      modalityId:1,modalityName:"MODALIDADE",disputeModeId:1,disputeModeName:"ABERTO",
      statusId:1,statusName:"PUBLICADA",instrumentCode:1,instrumentName:"EDITAL",
      publishedAt:"2026-09-23",objectDescription:"OBJETO",estimatedValueCents:10000,
      currency:"BRL",srp:false,
      legalBasis:{code:1,name:"LEI",description:"BASE"},
      electronicProcessUrl:null,sourceSystemUrl:null,sourceRecordSha256:"4".repeat(64),
      supplierIdentifier:null,supplierObserved:false,identityInferencesMade:false,
      humanReviewRequired:true,publicationAuthorized:false,correlationAuthorized:false
    }
  ];
  const pncpBody={
    schema:"arca.m5-pncp-custodial-normalization.v1",
    parserContractSha256:"b".repeat(64),
    observedStructureSha256:"c".repeat(64),
    sourceEnvelopeSha256:"d".repeat(64),
    sourceReceiptSha256:"e".repeat(64),
    sourceScopeSha256:"f".repeat(64),
    pageFileSha256:"0".repeat(64),
    recordCount:2,
    records:pncpRecords
  };
  const pncpNorm=sha256(canonicalJson(pncpBody));
  const pncpDoc={...pncpBody,normalizationSha256:pncpNorm,sourceCaptureRunId:"3"};
  const pncpScope="f".repeat(64),pncpRev="c".repeat(40);
  const pncpEnvelope=sealPrivate(pncpDoc,pncpPass,pncpScope,pncpRev);
  const pncpBinding=buildM5PncpLiveNormalizedBinding({
    captureRunId:"3",captureRevision:pncpRev,captureScopeSha256:pncpScope,
    captureEnvelopeSha256:"d".repeat(64),captureReceiptSha256:"e".repeat(64),
    observedStructureSha256:"c".repeat(64),pageFileSha256:"0".repeat(64),
    parserContractSha256:"b".repeat(64),normalizationRunId:"4",
    executorRevision:"d".repeat(40),normalizationSha256:pncpNorm,
    normalizedEnvelopeSha256:sha256(JSON.stringify(pncpEnvelope)),
    normalizedContentRootSha256:pncpEnvelope.contentRootHash,
    normalizedStoreReceiptSha256:"1".repeat(64),proofSha256:"2".repeat(64),
    recordCount:2,supplierObserved:false
  });
  const readiness=evaluateM5CorrelationReadiness({portalBinding,pncpBinding});
  return {portalEnvelope,portalBinding,pncpEnvelope,pncpBinding,readiness};
}

test("M5-L emits candidate only from allowlisted candidate dimension",()=>{
  const x=setup();
  const result=runM5PrivateCandidateScreening({
    ...x,portalPassphrase:portalPass,pncpPassphrase:pncpPass,vaultTransportUsed:true
  });
  assert.equal(result.pairCount,2);
  assert.equal(result.candidateCount,1);
  assert.equal(result.notObservedCount,1);
  assert.equal(result.confirmedCount,0);
  assert.equal(result.strongBridgeObserved,false);
  assert.equal(result.supplierInferenceAllowed,false);
  assert.equal(result.privateValuesIncluded,false);
  assert.equal(result.correlationAttempted,false);
  assert.equal(result.sourceNetworkUsed,false);
  assert.equal(result.pairs[0].classification,"CANDIDATE");
  assert.equal(result.pairs[0].candidateDimensions.agencyTextExact,true);
  assert.equal(result.pairs[1].classification,"NOT_OBSERVED");
  assert.equal(result.pairs[1].weakContext.sameDate,true);
  assert.equal(result.pairs[1].weakContext.amountExact,true);
});

test("M5-L weak date and amount alone never create candidate",()=>{
  const x=setup();
  const result=runM5PrivateCandidateScreening({
    ...x,portalPassphrase:portalPass,pncpPassphrase:pncpPass
  });
  const weak=result.pairs.find(p=>p.weakContext.sameDate&&p.weakContext.amountExact);
  assert.equal(weak.classification,"NOT_OBSERVED");
  assert.equal(weak.strongBridgeObserved,false);
});

test("M5-L rejects tampered readiness or envelope",()=>{
  const x=setup();
  assert.throws(()=>runM5PrivateCandidateScreening({
    ...x,
    readiness:{...x.readiness,readyForStrongCorrelation:true},
    portalPassphrase:portalPass,pncpPassphrase:pncpPass
  }),/READINESS_INVALID/);
  assert.throws(()=>runM5PrivateCandidateScreening({
    ...x,
    portalEnvelope:{...x.portalEnvelope,scopeHash:"0".repeat(64)},
    portalPassphrase:portalPass,pncpPassphrase:pncpPass
  }),/PORTAL_ENVELOPE_HASH_MISMATCH/);
});
