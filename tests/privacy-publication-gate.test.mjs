import test from "node:test";
import assert from "node:assert/strict";
import {classifyPrivacyRecord,verifyPrivacyClassification} from "../packages/agent/src/privacy-classification.ts";
import {evaluatePublication,verifyPublicationDecision} from "../packages/agent/src/publication-gate.ts";

const T1="2026-09-17T15:20:00.000Z";
const T2="2026-09-17T15:21:00.000Z";

test("official non-personal public record can be classified public",()=>{
  const record=classifyPrivacyRecord({recordId:"contract-1",subjectType:"legal-entity",sourceType:"official-public",purpose:"public procurement oversight",sourceRefs:["pncp:1"],indicators:{sourcePubliclyAccessible:true,sourceOfficial:true,publicInterestNecessary:true}},{classifiedAt:T1});
  assert.equal(record.privacyClass,"public");
  assert.equal(verifyPrivacyClassification(record),true);
  assert.match(record.classificationHash,/^[a-f0-9]{64}$/);
});

test("personal data with available minimization is classified redact-before-publication",()=>{
  const record=classifyPrivacyRecord({recordId:"person-1",subjectType:"natural-person",sourceType:"official-public",purpose:"verify office holder",indicators:{directIdentifier:true,sourcePubliclyAccessible:true,sourceOfficial:true,publicInterestNecessary:true,canMinimize:true}},{classifiedAt:T1});
  assert.equal(record.privacyClass,"redact-before-publication");
  assert.ok(record.reasons.includes("minimization-available"));
});

test("secrets and private communications are restricted and rejected from publication",()=>{
  const record=classifyPrivacyRecord({recordId:"secret-1",subjectType:"natural-person",sourceType:"user-provided",purpose:"fixture",indicators:{secretOrCredential:true,privateCommunication:true}},{classifiedAt:T1});
  assert.equal(record.privacyClass,"restricted");
  const decision=evaluatePublication({publicationId:"pub-secret",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true},{decidedAt:T2});
  assert.equal(decision.action,"reject");
  assert.equal(decision.publicationPerformed,false);
  assert.equal(verifyPublicationDecision(decision),true);
});

test("sensitive or high-risk material requires public-interest rationale and human review",()=>{
  const record=classifyPrivacyRecord({recordId:"health-1",subjectType:"natural-person",sourceType:"official-public",purpose:"public-interest fixture",indicators:{healthOrBiometric:true,sourcePubliclyAccessible:true,sourceOfficial:true,publicInterestNecessary:true}},{classifiedAt:T1});
  assert.equal(record.privacyClass,"sensitive");
  const noRationale=evaluatePublication({publicationId:"pub-health-0",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:false},{decidedAt:T2});
  assert.equal(noRationale.action,"hold");
  assert.ok(noRationale.reasons.includes("public-interest-rationale-required"));
  const held=evaluatePublication({publicationId:"pub-health",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:false,publicInterestRationale:"Necessary to explain a verified public-interest finding without adding unrelated detail."},{decidedAt:T2});
  assert.equal(held.action,"hold");
  assert.ok(held.reasons.includes("human-review-required"));
});

test("explicit legal-review requirement cannot be bypassed by automated gate",()=>{
  const record=classifyPrivacyRecord({recordId:"legal-1",subjectType:"natural-person",sourceType:"official-public",purpose:"public-interest fixture",legalReviewState:"required",indicators:{directIdentifier:true,sourceOfficial:true,sourcePubliclyAccessible:true,publicInterestNecessary:true}},{classifiedAt:T1});
  const held=evaluatePublication({publicationId:"pub-legal-1",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true},{decidedAt:T2});
  assert.equal(held.action,"hold");
  assert.ok(held.reasons.includes("legal-review-required"));
  const reviewed=evaluatePublication({publicationId:"pub-legal-2",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true,legalReviewCompleted:true},{decidedAt:T2});
  assert.equal(reviewed.action,"publish");
  assert.equal(reviewed.automatedLegalConclusion,false);
});

test("redaction class cannot publish until explicit redaction exists",()=>{
  const record=classifyPrivacyRecord({recordId:"person-2",subjectType:"natural-person",sourceType:"official-public",purpose:"procurement oversight",indicators:{directIdentifier:true,publicInterestNecessary:true,canMinimize:true,sourceOfficial:true,sourcePubliclyAccessible:true}},{classifiedAt:T1});
  const held=evaluatePublication({publicationId:"pub-redact-1",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true},{decidedAt:T2});
  assert.equal(held.action,"hold");
  assert.ok(held.reasons.includes("redaction-required"));
  const allowed=evaluatePublication({publicationId:"pub-redact-2",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true,redactions:[{field:"cpf",reason:"identifier not necessary"}]},{decidedAt:T2});
  assert.equal(allowed.action,"publish-with-redaction");
  assert.equal(allowed.redactions[0].field,"cpf");
  assert.equal(allowed.publicationPerformed,false);
});

test("missing purpose, necessity or source verification blocks publication",()=>{
  const record=classifyPrivacyRecord({recordId:"contract-2",subjectType:"legal-entity",sourceType:"official-public",purpose:"oversight",indicators:{sourceOfficial:true,sourcePubliclyAccessible:true,publicInterestNecessary:true}},{classifiedAt:T1});
  const decision=evaluatePublication({publicationId:"pub-hold",classification:record,purposeConfirmed:false,necessityConfirmed:true,sourceVerified:true},{decidedAt:T2});
  assert.equal(decision.action,"hold");
  assert.ok(decision.reasons.includes("purpose-not-confirmed"));
});

test("disputed or outdated material is held rather than silently published",()=>{
  const record=classifyPrivacyRecord({recordId:"dispute-1",subjectType:"legal-entity",sourceType:"official-public",purpose:"oversight",indicators:{sourceOfficial:true,sourcePubliclyAccessible:true,publicInterestNecessary:true,disputedOrOutdated:true}},{classifiedAt:T1});
  const decision=evaluatePublication({publicationId:"pub-dispute",classification:record,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true},{decidedAt:T2});
  assert.equal(decision.action,"hold");
  assert.ok(decision.reasons.includes("disputed-or-outdated"));
});

test("tampered classification cannot pass publication gate",()=>{
  const record=classifyPrivacyRecord({recordId:"tamper-1",subjectType:"legal-entity",sourceType:"official-public",purpose:"oversight",indicators:{sourceOfficial:true}},{classifiedAt:T1});
  const tampered={...record,purpose:"tampered-purpose"};
  assert.equal(verifyPrivacyClassification(tampered),false);
  assert.throws(()=>evaluatePublication({publicationId:"pub-tamper",classification:tampered,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true}),/adulterada/);
});
