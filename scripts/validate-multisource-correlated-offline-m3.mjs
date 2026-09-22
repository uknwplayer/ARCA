import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadOfflineFixture,
  loadPublicSourceRegistry,
  runMultisourceOfflineGate
} from "../src/investigation/multisource-offline-gate.mjs";
import {runFinancialCorrelationOffline} from "../src/investigation/financial-correlation-offline.mjs";

const root=process.cwd();
const registry=loadPublicSourceRegistry(path.join(root,"config","public-source-registry-v1.json"));
const sourceFixture=loadOfflineFixture(path.join(root,"examples","multisource-offline-fixtures","correlated-multisource-m3-v1.json"));
const correlationFixture=JSON.parse(fs.readFileSync(path.join(root,"examples","multisource-offline-fixtures","financial-correlation-m3-v1.json"),"utf8"));
const correlation=runFinancialCorrelationOffline({fixture:correlationFixture});
const queueRoot=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m3-validation-"));

try{
  const report=await runMultisourceOfflineGate({
    registry,
    fixture:sourceFixture,
    correlationReport:correlation,
    queueRoot,
    clock:()=>new Date("2026-09-22T05:00:00.000Z")
  });
  const expected={CANDIDATE:1,CONFIRMED:1,CONFLICTING:1,NOT_OBSERVED:1};
  if(JSON.stringify(report.coverage.requestedUfs)!==JSON.stringify(["AC","AL","AM"]))
    throw new Error("ARCA_M3_VALIDATION_UF_SCOPE");
  if(report.sources.requested.length!==2||report.evidence.deduplicatedCount!==11||report.gaps.length!==2)
    throw new Error("ARCA_M3_VALIDATION_EVIDENCE_COUNTS");
  if(JSON.stringify(report.correlation?.relationStateCounts)!==JSON.stringify(expected))
    throw new Error("ARCA_M3_VALIDATION_RELATION_STATES");
  if(report.correlation?.evidenceBinding?.boundRelationCount!==8)
    throw new Error("ARCA_M3_VALIDATION_BINDING_COUNT");
  if(report.reports.length!==2||report.verification.outcome!=="ADVANCE_TO_HUMAN_REVIEW"||
     report.investigation.state!=="HUMAN_REVIEW")
    throw new Error("ARCA_M3_VALIDATION_REVIEW_PATH");
  if(report.network.used||report.publication.attempted||
     report.safety.humanReviewRequired!==true||report.safety.adverseFinding!==false)
    throw new Error("ARCA_M3_VALIDATION_SAFETY");

  process.stdout.write(JSON.stringify({
    schema:"arca.multisource-correlated-offline-validation.v1",
    status:"PASS",
    reportSha256:report.reportSha256,
    correlationReportSha256:report.correlation.reportSha256,
    evidenceBindingSha256:report.correlation.evidenceBinding.bindingSha256,
    requestedUfs:report.coverage.requestedUfs,
    sourceIds:report.sources.requested,
    evidenceCount:report.evidence.deduplicatedCount,
    gapCount:report.gaps.length,
    boundRelationCount:report.correlation.evidenceBinding.boundRelationCount,
    relationStateCounts:report.correlation.relationStateCounts,
    agentCount:report.reports.length,
    verificationOutcome:report.verification.outcome,
    investigationState:report.investigation.state,
    networkUsed:false,
    publicationAttempted:false,
    humanReviewRequired:true,
    adverseFinding:false
  })+"\n");
}finally{
  fs.rmSync(queueRoot,{recursive:true,force:true});
}
