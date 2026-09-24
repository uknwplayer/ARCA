import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {canonicalJson,sha256} from "../src/investigation/public-source-contract.mjs";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {buildM5PncpLiveNormalizedBinding} from "../src/investigation/m5-pncp-live-normalized-binding.mjs";
import {deriveM5PncpContractCoverage} from "../src/investigation/m5-pncp-contract-coverage-private.mjs";

const passphrase="synthetic-m5-m-passphrase-0123456789";

function normalizedRecord(i){
  return {
    schema:"arca.m5-pncp-live-parser.v1",
    version:1,
    recordRef:`pncp:control:sha256:${String(i).repeat(64).slice(0,64)}`,
    procurementControlNumber:`1234567800019${i}-1-${i}/2026`,
    agencyIdentifier:{namespace:"CNPJ",value:`1234567800019${i}`},
    agencyName:"ORGAO FICTICIO",
    unitCode:"U1",unitName:"UNIDADE FICTICIA",municipalityCode:"3550308",
    municipalityName:"SAO PAULO",uf:"SP",year:2026,sequence:i,
    purchaseNumber:`COMPRA-${i}`,processNumber:`PROC-${i}`,
    modalityId:1,modalityName:"MODALIDADE",disputeModeId:1,disputeModeName:"DISPUTA",
    statusId:1,statusName:"PUBLICADA",instrumentCode:1,instrumentName:"EDITAL",
    publishedAt:"2026-09-01",objectDescription:"OBJETO",estimatedValueCents:10000,
    currency:"BRL",srp:false,
    legalBasis:{code:1,name:"BASE",description:"BASE LEGAL"},
    electronicProcessUrl:null,sourceSystemUrl:null,sourceRecordSha256:"f".repeat(64),
    supplierIdentifier:null,supplierObserved:false,identityInferencesMade:false,
    humanReviewRequired:true,publicationAuthorized:false,correlationAuthorized:false
  };
}

function setup(){
  const bindingInput={
    captureRunId:"1",captureRevision:"1".repeat(40),captureScopeSha256:"2".repeat(64),
    captureEnvelopeSha256:"3".repeat(64),captureReceiptSha256:"4".repeat(64),
    observedStructureSha256:"5".repeat(64),pageFileSha256:"6".repeat(64),
    parserContractSha256:"7".repeat(64),normalizationRunId:"2",
    executorRevision:"8".repeat(40),normalizationSha256:"9".repeat(64),
    normalizedEnvelopeSha256:"0".repeat(64),normalizedContentRootSha256:"a".repeat(64),
    normalizedStoreReceiptSha256:"b".repeat(64),proofSha256:"c".repeat(64),
    recordCount:2,supplierObserved:false
  };
  const binding=buildM5PncpLiveNormalizedBinding(bindingInput);
  const body={
    schema:"arca.m5-pncp-custodial-normalization.v1",
    parserContractSha256:binding.parser.contractSha256,
    observedStructureSha256:binding.capture.observedStructureSha256,
    sourceEnvelopeSha256:binding.capture.envelopeSha256,
    sourceReceiptSha256:binding.capture.receiptSha256,
    sourceScopeSha256:binding.capture.scopeSha256,
    pageFileSha256:binding.capture.pageFileSha256,
    recordCount:2,
    records:[normalizedRecord(1),normalizedRecord(2)]
  };
  const privateDoc={...body,normalizationSha256:sha256(canonicalJson(body)),sourceCaptureRunId:"1"};
  bindingInput.normalizationSha256=privateDoc.normalizationSha256;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5m-"));
  fs.writeFileSync(path.join(root,"normalized-private.json"),canonicalJson(privateDoc)+"\n");
  const envelope=sealCustodyDirectory({
    root,passphrase,repository:"uknwplayer/ARCA",
    revision:"8".repeat(40),scopeHash:"2".repeat(64),sealedAt:"2026-09-24T12:00:00.000Z"
  });
  fs.rmSync(root,{recursive:true,force:true});
  bindingInput.normalizedEnvelopeSha256=sha256(JSON.stringify(envelope));
  return {envelope,bindingInput};
}

test("M5-M deriva 2 alvos privados e candidato sanitizado da normalização PNCP",()=>{
  const {envelope,bindingInput}=setup();
  const result=deriveM5PncpContractCoverage({
    envelope,passphrase,pncpBindingInput:bindingInput,
    expectedEnvelopeSha256:sha256(JSON.stringify(envelope)),
    screeningSha256:"d".repeat(64),revision:"e".repeat(40)
  });
  assert.equal(result.plan.targetCount,2);
  assert.equal(result.candidate.targetCount,2);
  assert.equal(result.candidate.privateTargetValuesIncluded,false);
  assert.equal(JSON.stringify(result.candidate).includes("12345678000191"),false);
});

test("M5-M recusa envelope divergente",()=>{
  const {envelope,bindingInput}=setup();
  assert.throws(()=>deriveM5PncpContractCoverage({
    envelope,passphrase,pncpBindingInput:bindingInput,
    expectedEnvelopeSha256:"f".repeat(64),
    screeningSha256:"d".repeat(64),revision:"e".repeat(40)
  }),/ENVELOPE_HASH_MISMATCH/);
});
