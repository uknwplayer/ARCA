import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {observePncpCustodyStructure} from "../src/investigation/m5-pncp-custody-structure-observer.mjs";

const EXPECTED={
  envelopeSha256:"c707689e04d7bd091a59555d883a2d2a4d716b442b485d8b3b55efa1c65c6202",
  receiptSha256:"ad1fd3f1c3e09637f48f8e387f47f518392246cb30338704e914bac99028e19b",
  scopeSha256:"1d0354ffdf1bf0971aab175eb170e9bcb05491a708daba015e8b967cdf59b084"
};
function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_PNCP_OBSERVER_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
export function runObserver({env=process.env}={}){
  const input=path.resolve(arg("--envelope"));
  const output=path.resolve(arg("--output"));
  const envelope=JSON.parse(fs.readFileSync(input,"utf8"));
  const observation=observePncpCustodyStructure({
    envelope,
    passphrase:env.ARCA_PNCP_CUSTODY_PASSPHRASE,
    expectedEnvelopeSha256:EXPECTED.envelopeSha256,
    expectedReceiptSha256:EXPECTED.receiptSha256,
    expectedScopeSha256:EXPECTED.scopeSha256,
    observerRevision:env.GITHUB_SHA??null
  });
  fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(observation,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  return observation;
}
async function main(){
  try{
    const o=runObserver();
    process.stdout.write(JSON.stringify({
      status:"SCHEMA_OBSERVED",
      fileCount:o.structure.fileCount,
      totalBytes:o.structure.totalBytes,
      observedStructureSha256:o.observedStructureSha256,
      observationSha256:o.observationSha256,
      valuesIncluded:o.valuesIncluded,
      rawBytesIncluded:o.rawBytesIncluded,
      observerNetworkUsed:o.observerNetworkUsed
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))?error.message:"ARCA_M5_PNCP_OBSERVER_FAILED";
    process.stderr.write(code+"\n"); process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
