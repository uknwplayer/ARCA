import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildM5InvestigationManifest,
  evaluateM5PreCorrelationGate
} from "../src/investigation/m5-investigation-manifest.mjs";
import {
  buildM5NormalizedCorrelationBundle,
  runM5PostCustodyCorrelation
} from "../src/investigation/m5-post-custody-correlation.mjs";

const root=process.cwd();
const fixture=JSON.parse(fs.readFileSync(
  path.join(root,"examples","multisource-offline-fixtures","m5-phase-b-v1.json"),
  "utf8"
));
const manifest=buildM5InvestigationManifest(fixture.manifestInput);
const gate=evaluateM5PreCorrelationGate({manifest,inputs:fixture.custodyInputs});
const bundle=buildM5NormalizedCorrelationBundle({
  manifest,gate,
  sourceBindings:fixture.sourceBindings,
  correlationFixture:fixture.correlationFixture
});
const queueRoot=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5-phase-b-validation-"));
const report=await runM5PostCustodyCorrelation({
  manifest,gate,bundle,queueRoot,
  clock:()=>new Date("2026-09-23T10:40:00.000Z")
});
if(report.investigation.state!=="HUMAN_REVIEW"||
   report.verification.outcome!=="ADVANCE_TO_HUMAN_REVIEW"||
   report.safety.m5Accepted!==false||
   report.network.used!==false||
   report.publication.attempted!==false)
  throw new Error("ARCA_M5_PHASE_B_VALIDATION_FAILED");
console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-B",
  manifestSha256:manifest.manifestSha256,
  gateSha256:gate.gateSha256,
  bundleSha256:bundle.bundleSha256,
  correlationReportSha256:report.correlation.reportSha256,
  reportSha256:report.reportSha256,
  relationStateCounts:report.correlation.relationStateCounts,
  investigationState:report.investigation.state,
  m5Accepted:report.safety.m5Accepted,
  networkUsed:report.network.used,
  publicationAttempted:report.publication.attempted
},null,2));
