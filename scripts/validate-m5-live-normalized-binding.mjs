import fs from "node:fs";
import path from "node:path";
import {
  buildM5PortalLiveNormalizedBinding,
  buildM5PhaseBPortalInputs
} from "../src/investigation/m5-portal-live-normalized-binding.mjs";

const input=JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"config/m5-portal-live-normalized-binding-gate046.json"),"utf8"
));
if(input?.schema!=="arca.m5-portal-live-normalized-binding-input.v1")
  throw new Error("ARCA_M5_I_INPUT_SCHEMA_INVALID");
const {schema,...fields}=input;
const binding=buildM5PortalLiveNormalizedBinding(fields);
const phaseB=buildM5PhaseBPortalInputs(binding);
if(phaseB.custodyInput.normalizationState!=="NORMALIZED"||
   phaseB.sourceBinding.normalizationState!=="NORMALIZED"||
   phaseB.custodyInput.custody.private!==true||
   binding.correlationAuthorized!==false||
   binding.publicationAuthorized!==false)
  throw new Error("ARCA_M5_I_VALIDATION_FAILED");
console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-I",
  bindingSha256:binding.bindingSha256,
  normalizationSha256:binding.normalization.normalizationSha256,
  recordCount:binding.normalization.recordCount,
  phaseBCustodyEnvelopeSha256:phaseB.custodyInput.custody.envelopeSha256,
  derivedNormalizedEnvelopeSha256:phaseB.derivedNormalization.normalizedEnvelopeSha256,
  correlationAuthorized:binding.correlationAuthorized,
  publicationAuthorized:binding.publicationAuthorized
},null,2));
