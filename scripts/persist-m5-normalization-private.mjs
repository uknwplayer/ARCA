import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createGitHubPrivateNormalizationStore} from "../src/investigation/m5-private-normalization-store.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_H_STORE_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
function req(value,code){
  const out=String(value??"");
  if(!out)throw new Error(code);
  return out;
}

export async function persistM5Normalization({env=process.env}={}){
  const envelope=JSON.parse(fs.readFileSync(path.resolve(arg("--envelope")),"utf8"));
  const proof=JSON.parse(fs.readFileSync(path.resolve(arg("--proof")),"utf8"));
  const store=createGitHubPrivateNormalizationStore({
    repository:req(env.ARCA_CUSTODY_VAULT_REPOSITORY,"ARCA_M5_H_STORE_REPOSITORY_REQUIRED"),
    targetBranch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
    githubToken:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_M5_H_STORE_TOKEN_REQUIRED")
  });
  return store.persist({envelope,proof});
}
async function main(){
  try{
    const result=await persistM5Normalization();
    process.stdout.write(JSON.stringify(result)+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_H_STORE_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
