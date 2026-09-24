import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {deriveM5PncpContractCoverage} from "../src/investigation/m5-pncp-contract-coverage-private.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_M_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
function pass(value){
  const out=String(value??"");
  if(out.length<24||out.length>4096)throw new Error("ARCA_M5_M_PASSPHRASE_REQUIRED");
  return out;
}
function rev(value){
  const out=String(value??"").trim().toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(out))throw new Error("ARCA_M5_M_REVISION_INVALID");
  return out;
}

export function runM5PncpContractCoveragePreflight({env=process.env}={}){
  const envelope=JSON.parse(fs.readFileSync(path.resolve(arg("--pncp-envelope")),"utf8"));
  const cfg=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-pncp-contract-coverage.json"),"utf8"
  ));
  const bindingInput=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),cfg.pncpBindingConfig),"utf8"
  ));
  if(cfg.constraints?.maxRequests!==2||
     cfg.constraints?.retries!==0||
     cfg.constraints?.sourceNetworkAuthorized!==false||
     cfg.constraints?.newPncpGetAuthorized!==false||
     cfg.constraints?.publicationAuthorized!==false||
     cfg.constraints?.correlationAuthorized!==false)
    throw new Error("ARCA_M5_M_CONFIG_CONSTRAINTS_INVALID");
  const result=deriveM5PncpContractCoverage({
    envelope,
    passphrase:pass(env.ARCA_PNCP_CUSTODY_PASSPHRASE),
    pncpBindingInput:bindingInput,
    expectedEnvelopeSha256:cfg.normalizedEnvelopeSha256,
    screeningSha256:cfg.screeningSha256,
    revision:rev(env.GITHUB_SHA)
  });
  const output=path.resolve(arg("--output"));
  fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(result.candidate,null,2)+"\n",{
    encoding:"utf8",mode:0o600,flag:"wx"
  });
  return result.candidate;
}
async function main(){
  try{
    const c=runM5PncpContractCoveragePreflight();
    process.stdout.write(JSON.stringify({
      status:c.status,
      targetCount:c.targetCount,
      planSha256:c.planSha256,
      candidateSha256:c.candidateSha256,
      targetHashes:c.targetHashes,
      sourceNetworkAuthorized:c.sourceNetworkAuthorized,
      newPncpGetAuthorized:c.newPncpGetAuthorized,
      publicationAuthorized:c.publicationAuthorized,
      correlationAuthorized:c.correlationAuthorized
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_M_PREFLIGHT_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
