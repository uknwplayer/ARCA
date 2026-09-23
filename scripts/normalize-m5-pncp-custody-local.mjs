import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {runPncpCustodialNormalizationOffline} from "../src/investigation/m5-pncp-custodial-normalization.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_PNCP_NORM_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
export function runCli({env=process.env}={}){
  const envelope=JSON.parse(fs.readFileSync(path.resolve(arg("--envelope")),"utf8"));
  const authorization=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-pncp-normalization-authorization.json"),"utf8"
  ));
  const outputDir=path.resolve(arg("--output"));
  fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
  const result=runPncpCustodialNormalizationOffline({
    envelope,
    passphrase:env.ARCA_PNCP_CUSTODY_PASSPHRASE,
    authorization,
    executorRevision:env.GITHUB_SHA??authorization.captureRevision,
    outputDir
  });
  const proofPath=path.join(outputDir,"pncp-normalization-proof.json");
  fs.writeFileSync(proofPath,JSON.stringify(result.proof,null,2)+"\n",{
    encoding:"utf8",mode:0o600,flag:"wx"
  });
  return {proof:result.proof,proofPath};
}
async function main(){
  try{
    const r=runCli();
    process.stdout.write(JSON.stringify({
      status:r.proof.status,
      recordCount:r.proof.recordCount,
      normalizationSha256:r.proof.normalizationSha256,
      normalizedEnvelopeSha256:r.proof.normalizedEnvelopeSha256,
      supplierObserved:r.proof.supplierObserved,
      pncpRequestUsed:r.proof.pncpRequestUsed,
      publicationAttempted:r.proof.publicationAttempted,
      correlationAttempted:r.proof.correlationAttempted
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))?error.message:"ARCA_M5_PNCP_NORM_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
