import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defaultMultisourcePaths,
  loadOfflineFixture,
  loadPublicSourceRegistry,
  runMultisourceOfflineGate
} from "../src/investigation/multisource-offline-gate.mjs";

const paths=defaultMultisourcePaths();
const queueRoot=fs.mkdtempSync(path.join(os.tmpdir(),"arca-multisource-validation-"));
try{
  const report=await runMultisourceOfflineGate({
    registry:loadPublicSourceRegistry(paths.registry),
    fixture:loadOfflineFixture(paths.fixture),
    queueRoot,
    clock:()=>new Date("2026-09-21T13:00:00.000Z")
  });
  process.stdout.write(JSON.stringify({
    ok:true,schema:report.schema,pilotId:report.pilotId,reportSha256:report.reportSha256,
    requestedUfs:report.coverage.requestedUfs,availableUfs:report.coverage.availableUfs,
    unavailableUfs:report.coverage.unavailableUfs,evidenceCount:report.evidence.deduplicatedCount,
    agentCount:report.reports.length,verificationOutcome:report.verification.outcome,
    investigationState:report.investigation.state,networkUsed:report.network.used,
    publicationAttempted:report.publication.attempted,humanReviewRequired:report.safety.humanReviewRequired
  })+"\n");
  const portalReport=await runMultisourceOfflineGate({
    registry:loadPublicSourceRegistry(paths.registry),
    fixture:loadOfflineFixture(path.join(process.cwd(),"examples","multisource-offline-fixtures","portal-expenses-ac-al-am-v1.json")),
    queueRoot:path.join(queueRoot,"portal"),
    clock:()=>new Date("2026-09-21T13:00:00.000Z")
  });
  if(portalReport.evidence.deduplicatedCount!==2||portalReport.investigation.state!=="HUMAN_REVIEW"||
    portalReport.network.used||portalReport.publication.attempted)throw new Error("ARCA_PORTAL_M1_VALIDATION_FAILED");
  process.stdout.write(JSON.stringify({
    ok:true,schema:portalReport.schema,pilotId:portalReport.pilotId,reportSha256:portalReport.reportSha256,
    sourceIds:portalReport.sources.requested,evidenceCount:portalReport.evidence.deduplicatedCount,
    unavailableUfs:portalReport.coverage.unavailableUfs,
    investigationState:portalReport.investigation.state,networkUsed:false,publicationAttempted:false
  })+"\n");
}finally{
  fs.rmSync(queueRoot,{recursive:true,force:true});
}
