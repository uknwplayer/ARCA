import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createPrivateNormalizationReader} from "../src/investigation/m5-private-normalization-reader.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_L_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
function req(value,code){
  const out=String(value??"");
  if(!out)throw new Error(code);
  return out;
}
export async function fetchScreeningEnvelope({env=process.env}={}){
  const source=arg("--source").toUpperCase();
  if(!["PORTAL","PNCP"].includes(source))throw new Error("ARCA_M5_L_SOURCE_INVALID");
  const output=path.resolve(arg("--output"));
  const cfg=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-private-candidate-screening.json"),"utf8"
  ));
  const selected=source==="PORTAL"?cfg.portal:cfg.pncp;
  if(cfg.constraints?.sourceNetworkAuthorized!==false||
     cfg.constraints?.newPortalGetAuthorized!==false||
     cfg.constraints?.newPncpGetAuthorized!==false||
     cfg.constraints?.publicationAuthorized!==false||
     cfg.constraints?.strongCorrelationAuthorized!==false)
    throw new Error("ARCA_M5_L_CONSTRAINTS_INVALID");
  const reader=createPrivateNormalizationReader({
    repository:req(env.ARCA_CUSTODY_VAULT_REPOSITORY,"ARCA_M5_L_VAULT_REPOSITORY_REQUIRED"),
    targetBranch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
    githubToken:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_M5_L_VAULT_TOKEN_REQUIRED")
  });
  const result=await reader.readEnvelope({
    path:selected.vaultEnvelopePath,
    expectedEnvelopeSha256:selected.normalizedEnvelopeSha256
  });
  fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(result.envelope,null,2)+"\n",{
    encoding:"utf8",mode:0o600,flag:"wx"
  });
  return {source,envelopeSha256:result.envelopeSha256,output:path.basename(output)};
}
async function main(){
  try{
    const out=await fetchScreeningEnvelope();
    process.stdout.write(JSON.stringify({status:"FETCHED_ENCRYPTED_PRIVATE_ENVELOPE",...out})+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_L_FETCH_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
