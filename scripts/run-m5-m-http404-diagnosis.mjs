import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {openCustodyEnvelope} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {createM5MCustodyReader} from "../src/investigation/m5-m-custody-reader.mjs";
import {diagnoseM5MHttp404Body,summarizeM5MHttp404Diagnosis} from "../src/investigation/m5-m-http404-diagnosis.mjs";

function arg(name){const i=process.argv.indexOf(name);if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_M_404_ARGUMENT_REQUIRED");return process.argv[i+1]}
function req(value,code,min=1,max=4096){const out=String(value??"");if(out.length<min||out.length>max)throw new Error(code);return out}

export async function runM5MHttp404OfflineDiagnosis({env=process.env}={}){
  const cfg=JSON.parse(fs.readFileSync(path.join(process.cwd(),"config/m5-m-http404-diagnosis.json"),"utf8"));
  if(cfg.constraints?.sourceNetworkAuthorized!==false||cfg.constraints?.newPncpGetAuthorized!==false||
     cfg.constraints?.publicationAuthorized!==false||cfg.constraints?.correlationAuthorized!==false)
    throw new Error("ARCA_M5_M_404_CONSTRAINTS_INVALID");
  const reader=createM5MCustodyReader({
    repository:req(env.ARCA_CUSTODY_VAULT_REPOSITORY,"ARCA_M5_M_404_VAULT_REPO_REQUIRED",3,256),
    targetBranch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
    githubToken:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_M5_M_404_VAULT_TOKEN_REQUIRED",20,4096)
  });
  const {envelope}=await reader.readExactEnvelope({path:cfg.vaultEnvelopePath,expectedEnvelopeSha256:cfg.custodyEnvelopeSha256});
  const payload=openCustodyEnvelope({envelope,passphrase:req(env.ARCA_PNCP_CUSTODY_PASSPHRASE,"ARCA_M5_M_404_PASSPHRASE_REQUIRED",24,4096)});
  if(payload.files?.length!==3)throw new Error("ARCA_M5_M_404_FILE_COUNT_INVALID");
  const byName=new Map(payload.files.map(f=>[f.path,f]));
  const metaFile=byName.get("capture-meta.json");
  if(!metaFile)throw new Error("ARCA_M5_M_404_META_MISSING");
  const meta=JSON.parse(Buffer.from(metaFile.data,"base64").toString("utf8"));
  if(meta.candidateSha256!==cfg.candidateSha256||meta.planSha256!==cfg.planSha256||meta.responses?.length!==2)
    throw new Error("ARCA_M5_M_404_META_BINDING_INVALID");
  const items=cfg.responses.map((expected,index)=>{
    const f=byName.get(expected.fileName); if(!f)throw new Error("ARCA_M5_M_404_RESPONSE_FILE_MISSING");
    const mr=meta.responses[index];
    if(mr?.targetSha256!==expected.targetSha256||mr?.httpStatus!==404||mr?.responseBytesSha256!==expected.responseBytesSha256)
      throw new Error("ARCA_M5_M_404_RESPONSE_META_MISMATCH");
    return diagnoseM5MHttp404Body({
      bytes:Buffer.from(f.data,"base64"),
      expectedResponseSha256:expected.responseBytesSha256,
      targetSha256:expected.targetSha256
    });
  });
  const summary=summarizeM5MHttp404Diagnosis({items});
  const output=path.resolve(arg("--output"));fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(summary,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  return summary;
}
async function main(){
  try{
    const d=await runM5MHttp404OfflineDiagnosis();
    process.stdout.write(JSON.stringify({
      status:"DIAGNOSED_OFFLINE",liveRunId:d.liveRunId,sourceRequestCount:d.sourceRequestCount,
      sourceNetworkUsed:d.sourceNetworkUsed,sameDiagnosis:d.sameDiagnosis,sameJsonShape:d.sameJsonShape,
      diagnosisSha256:d.diagnosisSha256,
      items:d.items.map(x=>({
        targetSha256:x.targetSha256,jsonKind:x.jsonKind,topLevelKeys:x.topLevelKeys,numericStatus:x.numericStatus,
        diagnosis:x.diagnosis,aggregateFlags:x.aggregateFlags,
        stringFields:x.stringFields.map(s=>({
          key:s.key,length:s.length,sha256:s.sha256,allowlistedValue:s.allowlistedValue??null,
          pathPresent:s.pathPresent??false,internalPncpApiPrefix:s.internalPncpApiPrefix??false,
          pathTemplateSha256:s.pathTemplateSha256??null,mentionsNotFound:s.mentionsNotFound,
          mentionsContract:s.mentionsContract,mentionsRoute:s.mentionsRoute,mentionsParameter:s.mentionsParameter
        }))
      }))
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))?error.message:"ARCA_M5_M_404_DIAG_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
