import fs from "node:fs";
import path from "node:path";
import {buildM5CorrelationReadinessFromInputs} from "../src/investigation/m5-correlation-readiness.mjs";

const read=name=>JSON.parse(fs.readFileSync(path.join(process.cwd(),"config",name),"utf8"));
const gate=buildM5CorrelationReadinessFromInputs({
  portalInput:read("m5-portal-live-normalized-binding-gate046.json"),
  pncpInput:read("m5-pncp-live-normalized-binding.json")
});

if(gate.status!=="LIMITED_CANDIDATE_SCREENING_ONLY"||
   gate.readyForStrongCorrelation!==false||
   gate.readyForPrivateCandidateScreening!==true||
   gate.supplierBridgeAvailable!==false||
   gate.supplierInferenceAllowed!==false||
   gate.networkUsed!==false||
   gate.correlationAttempted!==false||
   gate.correlationAuthorized!==false)
  throw new Error("ARCA_M5_K_VALIDATION_FAILED");

console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-K-CORRELATION-READINESS",
  readinessSha256:gate.readinessSha256,
  readiness:gate.status,
  candidateDimensions:gate.candidateDimensions,
  weakDimensions:gate.weakDimensions,
  unavailableStrongBridges:gate.unavailableStrongBridges,
  nextStep:gate.nextStep
},null,2));
