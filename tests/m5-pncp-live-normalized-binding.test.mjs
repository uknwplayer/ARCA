import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildM5PncpLiveNormalizedBinding,
  buildM5PhaseBPncpInputs
} from "../src/investigation/m5-pncp-live-normalized-binding.mjs";

const input=()=>{
  const doc=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-pncp-live-normalized-binding.json"),"utf8"
  ));
  delete doc.schema;
  return doc;
};

test("M5-J preserva captura PNCP e custodia normalizada como camadas distintas",()=>{
  const binding=buildM5PncpLiveNormalizedBinding(input());
  const phaseB=buildM5PhaseBPncpInputs(binding);
  assert.equal(phaseB.custodyInput.custody.envelopeSha256,binding.capture.envelopeSha256);
  assert.equal(phaseB.sourceBinding.normalizationSha256,binding.normalization.normalizationSha256);
  assert.equal(phaseB.derivedNormalization.normalizedEnvelopeSha256,binding.normalization.normalizedEnvelopeSha256);
  assert.notEqual(binding.capture.envelopeSha256,binding.normalization.normalizedEnvelopeSha256);
  assert.equal(phaseB.custodyInput.normalizationState,"NORMALIZED");
  assert.equal(binding.correlationAuthorized,false);
  assert.equal(binding.publicationAuthorized,false);
  assert.match(binding.bindingSha256,/^[a-f0-9]{64}$/);
});

test("M5-J preserva lacuna de fornecedor sem inferencia",()=>{
  const binding=buildM5PncpLiveNormalizedBinding(input());
  const phaseB=buildM5PhaseBPncpInputs(binding);
  assert.equal(binding.coverage.supplierObserved,false);
  assert.equal(binding.coverage.supplierIdentifierAvailable,false);
  assert.equal(binding.coverage.supplierMayBeInferred,false);
  assert.deepEqual(phaseB.coverage,binding.coverage);
});

test("M5-J falha fechado em adulteracao ou fornecedor inventado",()=>{
  const binding=buildM5PncpLiveNormalizedBinding(input());
  assert.throws(()=>buildM5PhaseBPncpInputs({...binding,correlationAuthorized:true}),/INTEGRITY|STATE/);
  assert.throws(()=>buildM5PncpLiveNormalizedBinding({...input(),supplierObserved:true}),/SUPPLIER_COVERAGE/);
});

test("M5-J rejeita hash ou record count invalido",()=>{
  assert.throws(()=>buildM5PncpLiveNormalizedBinding({
    ...input(),normalizationSha256:"bad"
  }),/NORMALIZATION_HASH/);
  assert.throws(()=>buildM5PncpLiveNormalizedBinding({
    ...input(),recordCount:0
  }),/RECORD_COUNT/);
});
