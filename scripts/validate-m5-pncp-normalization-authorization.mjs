import fs from "node:fs";
import path from "node:path";
import {
  M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256,
  M5_PNCP_AP_PAGE_FILE_SHA256,
  M5_PNCP_LIVE_PARSER_CONTRACT_SHA256
} from "../src/investigation/m5-pncp-live-parser.mjs";
import {sha256} from "../src/investigation/public-source-contract.mjs";

const auth=JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"config/m5-pncp-normalization-authorization.json"),"utf8"
));
if(auth?.schema!=="arca.m5-pncp-normalization-authorization.v1"||
   auth.authorizationBasis!=="operator-general-continuation-current-chat"||
   auth.observedStructureSha256!==M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256||
   auth.pageFileSha256!==M5_PNCP_AP_PAGE_FILE_SHA256||
   auth.parserContractSha256!==M5_PNCP_LIVE_PARSER_CONTRACT_SHA256||
   auth.constraints?.newPncpGetAuthorized!==false||
   auth.constraints?.publicationAuthorized!==false||
   auth.constraints?.correlationAuthorized!==false)
  throw new Error("ARCA_M5_PNCP_AUTH_VALIDATION_FAILED");
console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-PNCP-NORMALIZATION-AUTH",
  authorizationSha256:sha256(auth),
  parserContractSha256:auth.parserContractSha256,
  observedStructureSha256:auth.observedStructureSha256,
  newPncpGetAuthorized:false,
  publicationAuthorized:false,
  correlationAuthorized:false
},null,2));
