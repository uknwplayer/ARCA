import fs from "node:fs";
import path from "node:path";
import {normalizePortalRelatedDocumentsFixture} from "../src/investigation/m5-portal-related-documents-parser.mjs";

const fixture=JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"examples/multisource-offline-fixtures/m5-portal-related-documents-parser-v1.json"),
  "utf8"
));
const result=normalizePortalRelatedDocumentsFixture(fixture);
if(result.normalizationState!=="NORMALIZED_SYNTHETIC_FIXTURE"||
   result.liveNormalizationAuthorized!==false||
   result.networkUsed!==false||
   result.publicationAttempted!==false||
   result.adverseFinding!==false||
   result.humanReviewRequired!==true||
   result.recordCount!==2)
  throw new Error("ARCA_M5_PORTAL_PARSER_VALIDATION_FAILED");

console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-F-PARSER-OFFLINE",
  observedSchemaSha256:result.observedSchemaSha256,
  normalizationSha256:result.normalizationSha256,
  recordCount:result.recordCount,
  executionMode:result.executionMode,
  liveNormalizationAuthorized:result.liveNormalizationAuthorized,
  networkUsed:result.networkUsed,
  publicationAttempted:result.publicationAttempted
},null,2));
