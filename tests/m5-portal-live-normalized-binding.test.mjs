import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildM5PortalLiveNormalizedBinding,
  buildM5PhaseBPortalInputs
} from "../src/investigation/m5-portal-live-normalized-binding.mjs";

const input=()=>{
  const doc=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-portal-live-normalized-binding-gate046.json"),"utf8"
  ));
  delete doc.schema;
  return doc;
};

test("M5-I preserva captura bruta e custodia normalizada como camadas distintas",()=>{
  const binding=buildM5PortalLiveNormalizedBinding(input());
  const phaseB=buildM5PhaseBPortalInputs(binding);
  assert.equal(phaseB.custodyInput.custody.envelopeSha256,binding.capture.envelopeSha256);
  assert.equal(phaseB.sourceBinding.normalizationSha256,binding.normalization.normalizationSha256);
  assert.equal(phaseB.derivedNormalization.normalizedEnvelopeSha256,binding.normalization.normalizedEnvelopeSha256);
  assert.notEqual(binding.capture.envelopeSha256,binding.normalization.normalizedEnvelopeSha256);
  assert.equal(phaseB.custodyInput.normalizationState,"NORMALIZED");
  assert.equal(binding.correlationAuthorized,false);
  assert.equal(binding.publicationAuthorized,false);
  assert.match(binding.bindingSha256,/^[a-f0-9]{64}$/);
});

test("M5-I falha fechado em adulteracao do binding",()=>{
  const binding=buildM5PortalLiveNormalizedBinding(input());
  const tampered={...binding,correlationAuthorized:true};
  assert.throws(()=>buildM5PhaseBPortalInputs(tampered),/INTEGRITY|STATE/);
});

test("M5-I rejeita hash ou record count invalido",()=>{
  assert.throws(()=>buildM5PortalLiveNormalizedBinding({
    ...input(),normalizationSha256:"bad"
  }),/NORMALIZATION_HASH/);
  assert.throws(()=>buildM5PortalLiveNormalizedBinding({
    ...input(),recordCount:0
  }),/RECORD_COUNT/);
});
