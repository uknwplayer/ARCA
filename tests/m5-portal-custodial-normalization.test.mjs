import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {
  buildPortalParserAdmissionCandidate,
  recordPortalParserAdmissionDecision
} from "../src/investigation/m5-portal-parser-admission.mjs";
import {
  GATE046_OBSERVED_SCHEMA_SHA256,
  M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256
} from "../src/investigation/m5-portal-related-documents-parser.mjs";
import {runPortalCustodialNormalizationOffline} from "../src/investigation/m5-portal-custodial-normalization.mjs";
import {sha256} from "../src/investigation/public-source-contract.mjs";

const passphrase="synthetic-m5-h-passphrase-0123456789";
const sourceRecords=[{
  data:"23/09/2026",
  documento:"DOC-FICTICIO-LIVE-001",
  documentoResumido:"DOCUMENTO FICTICIO CUSTODIAL",
  elementoDespesa:"ELEMENTO FICTICIO 01",
  especie:"PAGAMENTO FICTICIO",
  fase:"Pagamento",
  favorecido:"FAVORECIDO FICTICIO C",
  orgaoSuperior:"ORGAO SUPERIOR FICTICIO C",
  orgaoVinculado:"ORGAO VINCULADO FICTICIO C",
  unidadeGestora:"UNIDADE GESTORA FICTICIA C",
  valor:"R$ 10,00"
}];

function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5h-src-"));
  const bytes=Buffer.from(JSON.stringify(sourceRecords));
  fs.writeFileSync(path.join(root,"response.bin"),bytes);
  const envelope=sealCustodyDirectory({
    root,passphrase,repository:"uknwplayer/ARCA",
    revision:"4".repeat(40),scopeHash:"3".repeat(64),
    sealedAt:"2026-09-23T20:00:00.000Z"
  });
  fs.rmSync(root,{recursive:true,force:true});
  const candidate=buildPortalParserAdmissionCandidate({
    revision:"a".repeat(40),
    liveRunId:"synthetic-run",
    observedSchemaSha256:GATE046_OBSERVED_SCHEMA_SHA256,
    parserContractSha256:M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256,
    custodyEnvelopeSha256:sha256(JSON.stringify(envelope)),
    custodyReceiptSha256:"2".repeat(64),
    responseBytesSha256:sha256(bytes),
    scopeSha256:"3".repeat(64)
  });
  const decision=recordPortalParserAdmissionDecision({
    candidate,
    expectedCandidateSha256:candidate.candidateSha256,
    decision:"ADMIT_FOR_CUSTODIAL_NORMALIZATION",
    reviewerRef:"human-review:synthetic",
    reviewedAt:"2026-09-23T22:27:00.000Z"
  });
  return {envelope,candidate,decision};
}

test("M5-H normaliza custodia admitida sem rede/publicacao/correlacao",()=>{
  const {envelope,candidate,decision}=setup();
  const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5h-out-"));
  const result=runPortalCustodialNormalizationOffline({
    envelope,passphrase,candidate,decision,outputDir,
    sealedAt:"2026-09-23T22:30:00.000Z"
  });
  assert.equal(result.proof.status,"NORMALIZED_CUSTODIAL_OFFLINE");
  assert.equal(result.proof.recordCount,1);
  assert.equal(result.proof.sourceNetworkUsed,false);
  assert.equal(result.proof.portalRequestUsed,false);
  assert.equal(result.proof.publicationAttempted,false);
  assert.equal(result.proof.correlationAttempted,false);
  assert.equal(result.proof.normalizedValuesIncludedInProof,false);
  assert.equal(result.proof.rawBytesIncludedInProof,false);
  assert.match(result.proof.normalizationSha256,/^[a-f0-9]{64}$/);
  assert.match(result.proof.normalizedEnvelopeSha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result.proof).includes("FAVORECIDO FICTICIO C"),false);
  fs.rmSync(outputDir,{recursive:true,force:true});
});

test("M5-H recusa decisao nao admitida",()=>{
  const {envelope,candidate}=setup();
  const decision=recordPortalParserAdmissionDecision({
    candidate,
    expectedCandidateSha256:candidate.candidateSha256,
    decision:"HOLD_FOR_MORE_EVIDENCE",
    reviewerRef:"human-review:synthetic",
    reviewedAt:"2026-09-23T22:27:00.000Z"
  });
  assert.throws(()=>runPortalCustodialNormalizationOffline({
    envelope,passphrase,candidate,decision
  }),/DECISION_NOT_AUTHORIZED/);
});

test("M5-H recusa envelope, response ou schema divergente",()=>{
  const {envelope,candidate,decision}=setup();
  assert.throws(()=>runPortalCustodialNormalizationOffline({
    envelope:{...envelope,scopeHash:"f".repeat(64)},
    passphrase,candidate,decision
  }),/ENVELOPE_HASH_MISMATCH/);
  assert.throws(()=>runPortalCustodialNormalizationOffline({
    envelope,passphrase,
    candidate:{...candidate,responseBytesSha256:"f".repeat(64)},
    decision
  }),/ADMISSION_DECISION_INTEGRITY_INVALID|RESPONSE_HASH_MISMATCH/);
});
