import fs from "node:fs";
import path from "node:path";
import {buildPortalParserAdmissionCandidate,recordPortalParserAdmissionDecision} from "../src/investigation/m5-portal-parser-admission.mjs";
import {GATE046_LIVE_BINDING} from "./prepare-m5-portal-parser-admission.mjs";

const auth=JSON.parse(fs.readFileSync(
  path.join(process.cwd(),"config/m5-portal-parser-admission-gate046.json"),"utf8"
));
if(auth?.schema!=="arca.m5-portal-parser-admission-authorization.v1")
  throw new Error("ARCA_M5_H_AUTHORIZATION_SCHEMA_INVALID");
if(auth.constraints?.sourceNetworkAuthorized!==false||
   auth.constraints?.newPortalGetAuthorized!==false||
   auth.constraints?.publicationAuthorized!==false||
   auth.constraints?.correlationAuthorized!==false)
  throw new Error("ARCA_M5_H_AUTHORIZATION_CONSTRAINTS_INVALID");

const candidate=buildPortalParserAdmissionCandidate({
  revision:auth.candidateRevision,
  ...GATE046_LIVE_BINDING
});
if(candidate.candidateSha256!==auth.candidateSha256)
  throw new Error("ARCA_M5_H_AUTHORIZATION_CANDIDATE_MISMATCH");

const decision=recordPortalParserAdmissionDecision({
  candidate,
  expectedCandidateSha256:auth.candidateSha256,
  decision:auth.decision,
  reviewerRef:auth.reviewerRef,
  reviewedAt:auth.reviewedAt
});
if(decision.normalizationAuthorized!==true||
   decision.networkAuthorized!==false||
   decision.publicationAuthorized!==false||
   decision.correlationAuthorized!==false)
  throw new Error("ARCA_M5_H_AUTHORIZATION_DECISION_INVALID");

console.log(JSON.stringify({
  status:"PASS",
  phase:"M5-H-ADMISSION",
  candidateSha256:candidate.candidateSha256,
  decisionSha256:decision.decisionSha256,
  normalizationAuthorized:decision.normalizationAuthorized,
  networkAuthorized:decision.networkAuthorized,
  publicationAuthorized:decision.publicationAuthorized,
  correlationAuthorized:decision.correlationAuthorized
},null,2));
