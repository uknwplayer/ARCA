import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {buildPortalParserAdmissionCandidate,recordPortalParserAdmissionDecision} from "../src/investigation/m5-portal-parser-admission.mjs";
import {runPortalCustodialNormalizationOffline} from "../src/investigation/m5-portal-custodial-normalization.mjs";
import {GATE046_LIVE_BINDING} from "./prepare-m5-portal-parser-admission.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_H_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
function passphrase(value){
  if(typeof value!=="string"||value.length<24||value.length>4096)
    throw new Error("ARCA_M5_H_PASSPHRASE_REQUIRED");
  return value;
}
export function runLocalCli({env=process.env}={}){
  const envelopePath=path.resolve(arg("--envelope"));
  const outputDir=path.resolve(arg("--output"));
  const auth=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-portal-parser-admission-gate046.json"),"utf8"
  ));
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
  const envelope=JSON.parse(fs.readFileSync(envelopePath,"utf8"));
  fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
  const result=runPortalCustodialNormalizationOffline({
    envelope,
    passphrase:passphrase(env.ARCA_PORTAL_CUSTODY_PASSPHRASE),
    candidate,
    decision,
    outputDir
  });
  const proofPath=path.join(outputDir,"portal-normalization-proof.json");
  fs.writeFileSync(proofPath,JSON.stringify(result.proof,null,2)+"\n",{
    encoding:"utf8",mode:0o600,flag:"wx"
  });
  return {proof:result.proof,proofPath};
}
async function main(){
  try{
    const result=runLocalCli();
    process.stdout.write(JSON.stringify({
      status:result.proof.status,
      candidateSha256:result.proof.candidateSha256,
      decisionSha256:result.proof.decisionSha256,
      recordCount:result.proof.recordCount,
      normalizationSha256:result.proof.normalizationSha256,
      normalizedEnvelopeSha256:result.proof.normalizedEnvelopeSha256,
      sourceNetworkUsed:result.proof.sourceNetworkUsed,
      portalRequestUsed:result.proof.portalRequestUsed,
      publicationAttempted:result.proof.publicationAttempted,
      correlationAttempted:result.proof.correlationAttempted,
      proofPath:path.basename(result.proofPath)
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_H_LOCAL_NORMALIZATION_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
