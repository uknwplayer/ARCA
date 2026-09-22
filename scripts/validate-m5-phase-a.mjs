import fs from "node:fs";
import path from "node:path";
import {
  buildM5InvestigationManifest,
  evaluateM5PreCorrelationGate,
  loadM5PhaseAFixture
} from "../src/investigation/m5-investigation-manifest.mjs";

const fixturePath=path.join(process.cwd(),"examples","multisource-offline-fixtures","m5-phase-a-v1.json");
const fixture=loadM5PhaseAFixture(JSON.parse(fs.readFileSync(fixturePath,"utf8")));
const manifest=buildM5InvestigationManifest(fixture.manifestInput);
const gate=evaluateM5PreCorrelationGate({manifest,inputs:fixture.custodyInputs});

if(gate.status!=="READY_FOR_CORRELATION"||gate.readyForCorrelation!==true||gate.custodyVerified!==true)
  throw new Error("ARCA_M5_PHASE_A_VALIDATION_GATE");
if(gate.networkUsed!==false||gate.publicationAttempted!==false||
   gate.humanReviewRequired!==true||gate.adverseFinding!==false)
  throw new Error("ARCA_M5_PHASE_A_VALIDATION_SAFETY");

process.stdout.write(JSON.stringify({
  schema:"arca.m5-phase-a-validation.v1",
  status:"PASS",
  manifestSha256:manifest.manifestSha256,
  gateSha256:gate.gateSha256,
  sourceCount:gate.evidence.length,
  readyForCorrelation:true,
  custodyVerified:true,
  networkUsed:false,
  publicationAttempted:false,
  humanReviewRequired:true,
  adverseFinding:false
})+"\n");
