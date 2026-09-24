import fs from "node:fs";
import path from "node:path";
import {
  buildM5PncpLiveNormalizedBinding,
  buildM5PhaseBPncpInputs
} from "../src/investigation/m5-pncp-live-normalized-binding.mjs";

const input=JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"config/m5-pncp-live-normalized-binding.json"),"utf8"
));
delete input.schema;
const binding=buildM5PncpLiveNormalizedBinding(input);
const phaseB=buildM5PhaseBPncpInputs(binding);

if(binding.normalization.recordCount!==2||
   binding.coverage.supplierObserved!==false||
   phaseB.coverage.supplierMayBeInferred!==false||
   binding.correlationAuthorized!==false||
   binding.publicationAuthorized!==false)
  throw new Error("ARCA_M5_J_VALIDATION_FAILED");

console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-J-PNCP-LIVE-NORMALIZED-BINDING",
  bindingSha256:binding.bindingSha256,
  normalizationSha256:binding.normalization.normalizationSha256,
  recordCount:binding.normalization.recordCount,
  supplierObserved:binding.coverage.supplierObserved,
  correlationAuthorized:binding.correlationAuthorized
},null,2));
