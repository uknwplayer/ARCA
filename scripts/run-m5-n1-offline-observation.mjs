import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createM5MCustodyReader} from "../src/investigation/m5-m-custody-reader.mjs";
import {observeM5N1CustodialEnvelope} from "../src/investigation/m5-n1-offline-custodial-observation.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_N1_OFFLINE_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
function req(value,code,min=1,max=4096){
  const out=String(value??"");
  if(out.length<min||out.length>max)throw new Error(code);
  return out;
}

export async function runM5N1OfflineObservation({env=process.env}={}){
  const cfg=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-n1-offline-observation.json"),"utf8"
  ));
  if(cfg.constraints?.sourceNetworkAuthorized!==false||
     cfg.constraints?.newPncpGetAuthorized!==false||
     cfg.constraints?.publicationAuthorized!==false||
     cfg.constraints?.correlationAuthorized!==false)
    throw new Error("ARCA_M5_N1_OFFLINE_CONSTRAINTS_INVALID");

  const reader=createM5MCustodyReader({
    repository:req(env.ARCA_CUSTODY_VAULT_REPOSITORY,"ARCA_M5_N1_OFFLINE_VAULT_REPO_REQUIRED",3,256),
    targetBranch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
    githubToken:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_M5_N1_OFFLINE_VAULT_TOKEN_REQUIRED",20,4096)
  });
  const {envelope}=await reader.readExactEnvelope({
    path:cfg.vaultEnvelopePath,
    expectedEnvelopeSha256:cfg.custodyEnvelopeSha256
  });

  const observation=observeM5N1CustodialEnvelope({
    envelope,
    passphrase:req(env.ARCA_PNCP_CUSTODY_PASSPHRASE,"ARCA_M5_N1_OFFLINE_PASSPHRASE_REQUIRED",24,4096),
    expectedEnvelopeSha256:cfg.custodyEnvelopeSha256,
    expectedCandidateSha256:cfg.candidateSha256,
    expectedPlanSha256:cfg.planSha256,
    expectedTargets:cfg.targets,
    pageSize:cfg.pageSize
  });

  const output=path.resolve(arg("--output"));
  fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(observation,null,2)+"\n",{
    encoding:"utf8",mode:0o600,flag:"wx"
  });
  return observation;
}

async function main(){
  try{
    const o=await runM5N1OfflineObservation();
    process.stdout.write(JSON.stringify({
      status:"OBSERVED_FROM_DURABLE_CUSTODY",
      sourceLiveRunId:o.sourceLiveRunId,
      sourceRequestCount:o.sourceRequestCount,
      sourceNetworkUsed:o.sourceNetworkUsed,
      totalItems:o.totalItems,
      totalItemsWithResult:o.totalItemsWithResult,
      coverageComplete:o.coverageComplete,
      m5n2PreparationAllowed:o.m5n2PreparationAllowed,
      observationSha256:o.observationSha256,
      observations:o.observations.map(x=>({
        targetSha256:x.targetSha256,
        responseShape:x.responseShape,
        itemCount:x.itemCount,
        itemsWithResultCount:x.itemsWithResultCount,
        pagePossiblyTruncated:x.pagePossiblyTruncated,
        resultItemSetSha256:x.resultItemSetSha256,
        nextStageReady:x.nextStageReady
      }))
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_N1_OFFLINE_OBSERVATION_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
