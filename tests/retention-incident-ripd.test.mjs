import test from "node:test";
import assert from "node:assert/strict";
import {createRetentionPolicy,assessRetention,verifyRetentionAssessment} from "../packages/agent/src/retention-policy.ts";
import {createSecurityIncident,reviewSecurityIncident,verifySecurityIncidentReview} from "../packages/agent/src/security-incidents.ts";
import {buildRipdAssessment,verifyRipdAssessment} from "../packages/agent/src/ripd-assistant.ts";

const T0="2026-09-17T12:00:00.000Z";
const T1="2026-09-17T13:00:00.000Z";

test("retention engine never deletes automatically and marks ended-purpose data delete-eligible",()=>{
  const policy=createRetentionPolicy({policyId:"logs-1",dataClass:"operational-log",purpose:"security diagnostics",maxRetentionDays:30},{createdAt:T0});
  const result=assessRetention({assessmentId:"ret-1",recordId:"log-1",policy,collectedAt:"2026-08-01T00:00:00Z",purposeStillActive:false,conservationGrounds:[]},{assessedAt:T1});
  assert.equal(result.action,"delete-eligible");
  assert.equal(result.automaticDeletionPerformed,false);
  assert.equal(result.humanReviewRequired,true);
  assert.equal(verifyRetentionAssessment(result),true);
});

test("minimum retention floor and legal hold prevent delete eligibility",()=>{
  const policy=createRetentionPolicy({policyId:"incident-retention",dataClass:"incident-record",purpose:"regulatory incident record"},{createdAt:T0});
  const floor=assessRetention({assessmentId:"ret-floor",recordId:"inc-1",policy,collectedAt:T0,purposeStillActive:false,minimumRetentionUntil:"2031-09-17T12:00:00Z"},{assessedAt:T1});
  assert.equal(floor.action,"retain");
  assert.ok(floor.reasons.includes("minimum-retention-floor-active"));
  const hold=assessRetention({assessmentId:"ret-hold",recordId:"evidence-1",policy,collectedAt:T0,purposeStillActive:false,legalHold:true},{assessedAt:T1});
  assert.equal(hold.action,"legal-hold");
});

test("exclusive controller conservation path requires anonymization rather than raw retention",()=>{
  const policy=createRetentionPolicy({policyId:"anon-1",dataClass:"other",purpose:"completed processing",conservationGrounds:["exclusive-controller-anonymized-use"]},{createdAt:T0});
  const result=assessRetention({assessmentId:"ret-anon",recordId:"record-1",policy,collectedAt:T0,purposeStillActive:false},{assessedAt:T1});
  assert.equal(result.action,"anonymize");
});

test("incident registry creates a five-year minimum record floor and no automatic notification",()=>{
  const incident=createSecurityIncident({incidentId:"inc-2026-1",discoveredAt:T0,controllerKnowledgeAt:T0,personalDataAffected:true,summary:"synthetic incident",affectedDataCategories:["authentication"]},{registeredAt:T0});
  assert.equal(incident.retentionNotBefore,"2031-09-17T12:00:00.000Z");
  assert.equal(incident.notificationPerformed,false);
  assert.equal(incident.communicationStatus,"undetermined");
});

test("incident notification review uses human-confirmed impact plus qualifying criterion and leaves business-day calendar unresolved",()=>{
  const incident=createSecurityIncident({incidentId:"inc-2026-2",discoveredAt:T0,controllerKnowledgeAt:T0,personalDataAffected:true,summary:"synthetic"},{registeredAt:T0});
  const review=reviewSecurityIncident({incident,reviewId:"review-1",reviewerId:"reviewer-human",humanReviewCompleted:true,significantImpactConfirmed:true,qualifyingCriteria:["authentication-data"],decisionReason:"synthetic fixture meets both RCIS dimensions"},{reviewedAt:T1});
  assert.equal(review.communicationRequired,true);
  assert.equal(review.notificationWindow,"3-business-days-from-controller-knowledge-of-personal-data-impact");
  assert.equal(review.communicationDueAt,null);
  assert.equal(review.deadlineCalendarResolutionRequired,true);
  assert.equal(review.automatedLegalConclusion,false);
  assert.equal(verifySecurityIncidentReview(review),true);
});

test("incident cannot be classified for notification without human review",()=>{
  const incident=createSecurityIncident({incidentId:"inc-2026-3",summary:"synthetic"},{registeredAt:T0});
  assert.throws(()=>reviewSecurityIncident({incident,reviewerId:"r",humanReviewCompleted:false,significantImpactConfirmed:true,qualifyingCriteria:["sensitive-personal-data"],decisionReason:"x"},{reviewedAt:T1}),/revisao humana/);
});

test("RIPD assistant recommends preparation on explicit high-risk signal but does not generate or submit a formal RIPD",()=>{
  const result=buildRipdAssessment({assessmentId:"ripd-1",processingId:"proc-1",purpose:"public-interest investigation",dataCategories:["public procurement records"],processingOperations:["collect","cross-reference"],subjectGroups:["public officials","suppliers"],legalBasisRefs:["basis:1"],safeguards:["publication gate","human review"],identifiedRisks:["incorrect adverse inference"],indicators:{dataCombinationOrProfiling:true}},{assessedAt:T1});
  assert.equal(result.recommendation,"prepare-ripd");
  assert.equal(result.formalRipdGenerated,false);
  assert.equal(result.anpdSubmissionPerformed,false);
  assert.equal(result.automatedLegalConclusion,false);
  assert.equal(verifyRipdAssessment(result),true);
});

test("RIPD assistant exposes missing documentation instead of inventing completeness",()=>{
  const result=buildRipdAssessment({assessmentId:"ripd-2",processingId:"proc-2",purpose:"fixture",dataCategories:[],processingOperations:[],subjectGroups:[],legalBasisRefs:[],safeguards:[],identifiedRisks:[],indicators:{sensitiveData:true}},{assessedAt:T1});
  assert.ok(result.gaps.includes("data-categories-missing"));
  assert.ok(result.gaps.includes("risk-analysis-missing"));
  assert.equal(result.humanReviewRequired,true);
});
