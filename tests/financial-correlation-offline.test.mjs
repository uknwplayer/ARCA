import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FINANCIAL_CORRELATION_REPORT_SCHEMA,
  canonicalEntityIdentifier,
  runFinancialCorrelationOffline
} from "../src/investigation/financial-correlation-offline.mjs";

const fixturePath=path.join(process.cwd(),"examples","multisource-offline-fixtures","financial-correlation-m2-v1.json");
const fixture=()=>JSON.parse(fs.readFileSync(fixturePath,"utf8"));
const run=(extra={})=>runFinancialCorrelationOffline({fixture:fixture(),...extra});

test("canonical entity identifiers are deterministic, namespace-aware and do not expose the identifier",()=>{
  const a=canonicalEntityIdentifier({
    entityType:"SUPPLIER",namespace:"CNPJ",value:"12.345.678/0001-95",
    provenanceRef:"fixture:cnpj#a"
  });
  const b=canonicalEntityIdentifier({
    entityType:"SUPPLIER",namespace:"CNPJ",value:"12345678000195",
    provenanceRef:"fixture:cnpj#b"
  });
  assert.equal(a.ref,b.ref);
  assert.match(a.ref,/^entity:supplier:cnpj:sha256:[0-9a-f]{64}$/);
  assert.equal(a.ref.includes("12345678000195"),false);
  assert.throws(()=>canonicalEntityIdentifier({
    entityType:"SUPPLIER",namespace:"UNKNOWN",value:"x",provenanceRef:"fixture:x"
  }),/UNSUPPORTED_IDENTIFIER_NAMESPACE/);
});

test("M2 preserves payment to many commitments as confirmed fixture relationships",()=>{
  const report=run();
  assert.equal(report.schema,FINANCIAL_CORRELATION_REPORT_SCHEMA);
  assert.equal(report.counts.payments,3);
  assert.equal(report.counts.commitmentImpacts,4);
  assert.equal(report.paymentCommitmentRelations.length,4);
  assert.ok(report.paymentCommitmentRelations.every(item=>
    item.kind==="PAYMENT_IMPACTS_COMMITMENT"&&
    item.state==="CONFIRMED"&&
    item.signals.exactPaymentDocumentKey===true&&
    item.signals.exactCommitmentKey===true&&
    item.adverseFinding===false
  ));
  assert.equal(report.oneToMany.paymentsWithMultipleCommitments,1);
  assert.equal(report.oneToMany.maximumCommitmentsPerPayment,2);
  assert.ok(report.allocation.every(item=>item.deltaCents===0&&item.discrepancyIsNotIrregularity===true));
});

test("M2 produces all four relation states without turning them into findings",()=>{
  const report=run();
  assert.deepEqual(report.relationStateCounts,{
    CANDIDATE:1,
    CONFIRMED:1,
    CONFLICTING:1,
    NOT_OBSERVED:1
  });
  const confirmed=report.procurementFinancialRelations.find(item=>item.state==="CONFIRMED");
  const candidate=report.procurementFinancialRelations.find(item=>item.state==="CANDIDATE");
  const conflicting=report.procurementFinancialRelations.find(item=>item.state==="CONFLICTING");
  const missing=report.procurementFinancialRelations.find(item=>item.state==="NOT_OBSERVED");
  assert.equal(confirmed.signals.explicitStrongBridge,true);
  assert.equal(candidate.signals.explicitStrongBridge,false);
  assert.equal(candidate.signals.agencyIdentifierMatch,true);
  assert.equal(candidate.signals.supplierIdentifierMatch,true);
  assert.equal(candidate.signals.amountUsedForIdentity,false);
  assert.equal(candidate.signals.nameUsedForIdentity,false);
  assert.ok(conflicting.counterEvidenceRefs.length>0);
  assert.equal(missing.signals.nameOnlyMatchIgnored,true);
  assert.equal(missing.signals.amountOnlyMatchIgnored,true);
  assert.ok(report.procurementFinancialRelations.every(item=>
    item.humanReviewRequired===true&&item.adverseFinding===false&&item.anomalyIsNotIrregularity===true
  ));
});

test("strong bridge plus counterevidence is conflicting rather than confirmed",()=>{
  const report=run();
  const conflicting=report.procurementFinancialRelations.filter(item=>item.state==="CONFLICTING");
  assert.equal(conflicting.length,1);
  assert.equal(conflicting[0].basis,"EXPLICIT_BRIDGE_WITH_COUNTEREVIDENCE");
  assert.ok(conflicting[0].alternativeExplanations.some(item=>/human resolution/i.test(item)));
  assert.equal(report.relationStateCounts.CONFIRMED,1);
});

test("matching agency and supplier identifiers only create a candidate, never confirmation",()=>{
  const report=run();
  const candidate=report.procurementFinancialRelations.find(item=>item.state==="CANDIDATE");
  assert.ok(candidate);
  assert.equal(candidate.basis,"MULTI_IDENTIFIER_MATCH_WITHOUT_EXPLICIT_BRIDGE");
  assert.ok(Number.isInteger(candidate.temporalDistanceDays));
  assert.ok(candidate.temporalDistanceDays>=0);
});

test("name, amount or temporal proximity cannot substitute for canonical identifier matches",()=>{
  const changed=fixture();
  const target=changed.procurements.find(item=>item.recordKey.includes("candidate"));
  target.agencyIdentifier.value="ORG-DIFFERENT";
  target.supplierIdentifier.value="SUPPLIER-DIFFERENT";
  target.displayName="FORNECEDOR FICTICIO AM";
  target.estimatedValue=98000;
  const report=runFinancialCorrelationOffline({fixture:changed});
  assert.equal(report.relationStateCounts.CANDIDATE,0);
  assert.equal(report.relationStateCounts.NOT_OBSERVED,2);
  assert.equal(report.safety.nameOrAmountAloneNeverConfirmsIdentity,true);
});

test("candidate temporal window is bounded and temporal distance is preserved",()=>{
  const changed=fixture();
  const target=changed.procurements.find(item=>item.recordKey.includes("candidate"));
  target.publishedAt="2024-01-01";
  const report=runFinancialCorrelationOffline({fixture:changed});
  assert.equal(report.relationStateCounts.CANDIDATE,0);
  assert.equal(report.relationStateCounts.NOT_OBSERVED,2);
});

test("every relation has provenance and deterministic integrity identity",()=>{
  const first=run();
  const second=run();
  assert.equal(first.reportSha256,second.reportSha256);
  assert.match(first.reportSha256,/^[0-9a-f]{64}$/);
  for(const item of [...first.paymentCommitmentRelations,...first.procurementFinancialRelations]){
    assert.ok(item.provenanceRefs.length>=1);
    assert.match(item.relationId,/^[0-9a-f]{64}$/);
  }
  assert.equal(first.safety.notObservedIsNotDisappearance,true);
  assert.equal(first.safety.confirmedRelationDoesNotProveRegularity,true);
});

test("sanitized M2 report does not expose raw fixture identifiers or document keys",()=>{
  const serialized=JSON.stringify(run());
  for(const forbidden of [
    "FIXTURE-PAYMENT-AC-001",
    "FIXTURE-NE-AC-001",
    "ORG-AC-A",
    "SUPPLIER-AC-A"
  ])assert.equal(serialized.includes(forbidden),false);
});

test("broken relationship references and duplicate keys fail closed",()=>{
  const missingPayment=fixture();
  missingPayment.commitmentImpacts[0].paymentDocumentCode="UNKNOWN-PAYMENT";
  assert.throws(()=>runFinancialCorrelationOffline({fixture:missingPayment}),/IMPACT_PAYMENT_NOT_FOUND/);

  const missingCommitment=fixture();
  missingCommitment.strongBindings[0].commitmentCode="UNKNOWN-COMMITMENT";
  assert.throws(()=>runFinancialCorrelationOffline({fixture:missingCommitment}),/BINDING_COMMITMENT_NOT_FOUND/);

  const duplicate=fixture();
  duplicate.payments.push(structuredClone(duplicate.payments[0]));
  assert.throws(()=>runFinancialCorrelationOffline({fixture:duplicate}),/DUPLICATE_PAYMENT/);
});

test("network and publication remain forbidden in M2",()=>{
  assert.throws(()=>run({networkEnabled:true}),/NETWORK_FORBIDDEN/);
  assert.throws(()=>run({publicationEnabled:true}),/PUBLICATION_FORBIDDEN/);
  const report=run();
  assert.deepEqual(report.network,{enabled:false,used:false});
  assert.deepEqual(report.publication,{enabled:false,attempted:false});
  assert.equal(report.safety.adverseFinding,false);
  assert.equal(report.safety.humanReviewRequired,true);
});
