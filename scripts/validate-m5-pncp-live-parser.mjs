import fs from "node:fs";
import path from "node:path";
import {
  M5_PNCP_LIVE_PARSER_CONTRACT_SHA256,
  normalizePncpLivePageFixture
} from "../src/investigation/m5-pncp-live-parser.mjs";

const fixture=JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"examples/multisource-offline-fixtures/m5-pncp-live-parser-v1.json"),"utf8"
));
const result=normalizePncpLivePageFixture(fixture);
if(result.recordCount!==1||
   result.normalizationState!=="NORMALIZED_SYNTHETIC_FIXTURE"||
   result.liveNormalizationAuthorized!==false||
   result.networkUsed!==false||
   result.publicationAttempted!==false||
   result.correlationAttempted!==false)
  throw new Error("ARCA_M5_PNCP_PARSER_VALIDATION_FAILED");
console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-PNCP-PARSER",
  parserContractSha256:M5_PNCP_LIVE_PARSER_CONTRACT_SHA256,
  observedStructureSha256:result.observedStructureSha256,
  normalizationSha256:result.normalizationSha256,
  recordCount:result.recordCount,
  liveNormalizationAuthorized:result.liveNormalizationAuthorized
},null,2));
