import test from "node:test";
import assert from "node:assert/strict";
import {
  getSecurityControlCatalog,
  verifySecurityControlCatalog,
  runSecuritySelfAudit,
  verifySecuritySelfAudit,
  buildSecurityDashboardModel,
  verifySecurityDashboardModel
} from "../packages/agent/src/security-control-dashboard.ts";

test("control catalog is tamper evident and includes implemented/deployment/roadmap controls",()=>{
  const catalog=getSecurityControlCatalog();
  assert.equal(verifySecurityControlCatalog(catalog),true);
  assert.equal(catalog.legalComplianceConclusion,false);
  assert.ok(catalog.controls.some(c=>c.id==="privacy.publication-gate"&&c.baseline==="implemented"));
  assert.ok(catalog.controls.some(c=>c.id==="deployment.tls"&&c.baseline==="deployment"));
  assert.ok(catalog.controls.some(c=>c.id==="privacy.redaction-engine"&&c.baseline==="roadmap"));
  const tampered=structuredClone(catalog);tampered.controls[0].title="alterado";
  assert.equal(verifySecurityControlCatalog(tampered),false);
});

test("local/offline audit does not demand hosted deployment controls",()=>{
  const audit=runSecuritySelfAudit({deploymentProfile:"local-offline"},{auditedAt:"2026-09-17T16:00:00Z"});
  assert.equal(verifySecuritySelfAudit(audit),true);
  assert.equal(audit.complianceScoreProduced,false);
  const tls=audit.controls.find(c=>c.id==="deployment.tls");
  assert.equal(tls.status,"not-applicable");
  const vault=audit.controls.find(c=>c.id==="credential.encrypted-at-rest");
  assert.equal(vault.status,"pass");
  const osKey=audit.controls.find(c=>c.id==="credential.os-backed-key");
  assert.equal(osKey.status,"not-implemented");
});

test("public hosted audit exposes missing deployment assertions instead of assuming them",()=>{
  const audit=runSecuritySelfAudit({deploymentProfile:"public-hosted",assertions:{tlsEnabled:true,infrastructureInventoryComplete:true,privacyNoticePublished:false}},{auditedAt:"2026-09-17T16:00:00Z"});
  assert.equal(audit.controls.find(c=>c.id==="deployment.tls").status,"pass");
  assert.equal(audit.controls.find(c=>c.id==="deployment.privacy-notice").status,"attention");
  assert.equal(audit.controls.find(c=>c.id==="deployment.subject-rights-contact").status,"deployment-required");
  assert.ok(audit.blockingIssues.includes("deployment.privacy-notice"));
  assert.ok(audit.blockingIssues.includes("deployment.subject-rights-contact"));
});

test("dashboard model is frontend-ready and bound to the audit hash",()=>{
  const audit=runSecuritySelfAudit({deploymentProfile:"public-hosted",assertions:{tlsEnabled:true,infrastructureInventoryComplete:true,logRetentionDocumented:true,privacyNoticePublished:true,subjectRightsContactPath:true,incidentResponseOwnerAssigned:true,accessControlDocumented:true,backupProtectionDocumented:true}},{auditedAt:"2026-09-17T16:00:00Z"});
  const dashboard=buildSecurityDashboardModel(audit);
  assert.equal(verifySecurityDashboardModel(dashboard),true);
  assert.equal(dashboard.sourceAuditHash,audit.auditHash);
  assert.equal(dashboard.legalComplianceConclusion,false);
  assert.equal(dashboard.complianceScoreProduced,false);
  assert.ok(dashboard.summaryCards.some(c=>c.id==="pass"));
  assert.ok(dashboard.sections.some(s=>s.id==="privacy"));
  assert.ok(dashboard.filters.statuses.includes("not-implemented"));
  const tampered=structuredClone(dashboard);tampered.summaryCards[0].value=999;
  assert.equal(verifySecurityDashboardModel(tampered),false);
});
