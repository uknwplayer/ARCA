import test from "node:test";
import assert from "node:assert/strict";
import {LegalBasisRegistry,verifyLegalBasisRecord} from "../packages/agent/src/legal-basis-registry.ts";
import {DataSubjectRequestRegistry} from "../packages/agent/src/data-subject-requests.ts";
import {classifyPrivacyRecord} from "../packages/agent/src/privacy-classification.ts";
import {evaluatePublication} from "../packages/agent/src/publication-gate.ts";
import {createRedactionExportReceipt,verifyRedactionExportReceipt} from "../packages/agent/src/redaction-export-receipt.ts";

const T1="2026-09-17T16:00:00.000Z";
const T2="2026-09-17T16:01:00.000Z";
const T3="2026-09-17T16:02:00.000Z";

test("legal basis registry records a claim without pretending it is an automatic legal conclusion",()=>{
  const registry=new LegalBasisRegistry();
  const draft=registry.register({basisId:"basis-1",processingActivityId:"publication.procurement",purpose:"public procurement oversight",basisCode:"legitimate-interest",legalReference:"LGPD art. 7",rationale:"operator claim for later review",sourceRefs:["law:lgpd"]},{createdAt:T1});
  assert.equal(draft.status,"draft");
  assert.equal(draft.automatedLegalConclusion,false);
  assert.equal(draft.legalAdviceProvided,false);
  assert.equal(verifyLegalBasisRecord(draft),true);
  const active=registry.review("basis-1",{accepted:true,reviewerId:"reviewer-1",notes:"reviewed for fixture"},{reviewedAt:T2});
  assert.equal(active.status,"active");
  assert.equal(active.previousRecordHash,draft.recordHash);
  assert.equal(registry.verifyHistory("basis-1"),true);
});

test("legal basis history is tamper evident and can be superseded",()=>{
  const registry=new LegalBasisRegistry();
  registry.register({basisId:"basis-2",processingActivityId:"activity-2",purpose:"fixture",basisCode:"not-assessed"},{createdAt:T1});
  registry.review("basis-2",{accepted:false,reviewerId:"reviewer-1",notes:"insufficient rationale"},{reviewedAt:T2});
  const closed=registry.close("basis-2","superseded",{updatedAt:T3});
  assert.equal(closed.status,"superseded");
  assert.equal(registry.verifyHistory("basis-2"),true);
  const history=registry.history("basis-2");
  history[1].reviewNotes="tampered";
  assert.equal(verifyLegalBasisRecord(history[1]),false);
});

test("data subject correction request creates an active publication hold without storing raw identity document",()=>{
  const registry=new DataSubjectRequestRegistry();
  const request=registry.open({requestId:"req-1",requestType:"correction",subjectRef:"subject-opaque-1",recordIds:["record-1"],claimSummary:"The published field is outdated",requestedAction:"re-check official source",identityVerification:"pending"},{openedAt:T1});
  assert.equal(request.rawIdentityDocumentStored,false);
  assert.equal(request.publicDisclosureAllowed,false);
  assert.equal(registry.hasActivePublicationHold("record-1"),true);
  assert.equal(registry.verifyRequest("req-1"),true);
  registry.startReview("req-1",{reviewerId:"reviewer-1"},{at:T2});
  registry.resolve("req-1",{reviewerId:"reviewer-1",outcome:"corrected",notes:"official source updated"},{at:T3});
  assert.equal(registry.hasActivePublicationHold("record-1"),false);
  assert.equal(registry.verifyRequest("req-1"),true);
});

test("publication gate holds an otherwise public record while a subject request is active",()=>{
  const classification=classifyPrivacyRecord({recordId:"record-1",subjectType:"legal-entity",sourceType:"official-public",purpose:"oversight",indicators:{sourceOfficial:true,sourcePubliclyAccessible:true,publicInterestNecessary:true}},{classifiedAt:T1});
  const decision=evaluatePublication({publicationId:"pub-hold-subject",classification,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,activeSubjectRequest:true},{decidedAt:T2});
  assert.equal(decision.action,"hold");
  assert.ok(decision.reasons.includes("active-data-subject-request"));
  assert.equal(decision.publicationPerformed,false);
});

test("redaction export receipt proves required fields were removed without storing removed values",()=>{
  const classification=classifyPrivacyRecord({recordId:"person-3",subjectType:"natural-person",sourceType:"official-public",purpose:"procurement oversight",indicators:{directIdentifier:true,sourceOfficial:true,sourcePubliclyAccessible:true,publicInterestNecessary:true,canMinimize:true}},{classifiedAt:T1});
  const decision=evaluatePublication({publicationId:"pub-redacted",classification,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true,redactions:[{field:"cpf",reason:"not necessary"}]},{decidedAt:T2});
  assert.equal(decision.action,"publish-with-redaction");
  const receipt=createRedactionExportReceipt({exportId:"export-1",publicationDecision:decision,inputArtifactSha256:"a".repeat(64),outputArtifactSha256:"b".repeat(64),appliedRedactions:[{field:"cpf",reason:"not necessary"}]},{exportedAt:T3});
  assert.equal(receipt.requiredRedactionsSatisfied,true);
  assert.equal(receipt.removedValuesStored,false);
  assert.equal(receipt.removedValueHashesStored,false);
  assert.equal(verifyRedactionExportReceipt(receipt),true);
  assert.equal(JSON.stringify(receipt).includes("123.456"),false);
});

test("export receipt refuses missing mandatory redactions or held decisions",()=>{
  const classification=classifyPrivacyRecord({recordId:"person-4",subjectType:"natural-person",sourceType:"official-public",purpose:"oversight",indicators:{directIdentifier:true,sourceOfficial:true,sourcePubliclyAccessible:true,publicInterestNecessary:true,canMinimize:true}},{classifiedAt:T1});
  const allowed=evaluatePublication({publicationId:"pub-redacted-2",classification,purposeConfirmed:true,necessityConfirmed:true,sourceVerified:true,humanReviewCompleted:true,redactions:[{field:"cpf",reason:"not necessary"}]},{decidedAt:T2});
  assert.throws(()=>createRedactionExportReceipt({exportId:"export-2",publicationDecision:allowed,inputArtifactSha256:"a".repeat(64),outputArtifactSha256:"b".repeat(64),appliedRedactions:[]},{exportedAt:T3}),/obrigatorias ausentes/);
  const held=evaluatePublication({publicationId:"pub-held",classification,purposeConfirmed:false,necessityConfirmed:true,sourceVerified:true},{decidedAt:T2});
  assert.throws(()=>createRedactionExportReceipt({exportId:"export-3",publicationDecision:held,inputArtifactSha256:"a".repeat(64),outputArtifactSha256:"b".repeat(64)},{exportedAt:T3}),/nao autoriza exportacao/);
});
