import fs from "node:fs";
import path from "node:path";
import {runFinancialCorrelationOffline} from "../src/investigation/financial-correlation-offline.mjs";

const fixturePath=path.join(process.cwd(),"examples","multisource-offline-fixtures","financial-correlation-m2-v1.json");
const fixture=JSON.parse(fs.readFileSync(fixturePath,"utf8"));
const report=runFinancialCorrelationOffline({fixture});

const expected={CANDIDATE:1,CONFIRMED:1,CONFLICTING:1,NOT_OBSERVED:1};
if(JSON.stringify(report.relationStateCounts)!==JSON.stringify(expected))
  throw new Error("ARCA_FINANCIAL_CORRELATION_VALIDATION_STATE_COUNTS");
if(report.oneToMany.paymentsWithMultipleCommitments<1||report.oneToMany.maximumCommitmentsPerPayment<2)
  throw new Error("ARCA_FINANCIAL_CORRELATION_VALIDATION_ONE_TO_MANY");
if(report.network.used!==false||report.publication.attempted!==false||
   report.safety.humanReviewRequired!==true||report.safety.adverseFinding!==false||
   report.safety.notObservedIsNotDisappearance!==true)
  throw new Error("ARCA_FINANCIAL_CORRELATION_VALIDATION_SAFETY");

console.log(JSON.stringify({
  schema:"arca.financial-correlation-validation.v1",
  status:"PASS",
  reportSha256:report.reportSha256,
  fixtureSha256:report.fixtureSha256,
  counts:report.counts,
  oneToMany:report.oneToMany,
  relationStateCounts:report.relationStateCounts,
  humanReviewRequired:true,
  adverseFinding:false,
  networkUsed:false,
  publicationAttempted:false
}));
