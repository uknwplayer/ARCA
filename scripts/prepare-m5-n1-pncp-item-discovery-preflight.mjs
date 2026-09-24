import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {deriveM5N1ItemDiscovery} from "../src/investigation/m5-n1-pncp-item-discovery-private.mjs";

function arg(name){const i=process.argv.indexOf(name);if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_N1_ARGUMENT_REQUIRED");return process.argv[i+1]}
function pass(v){const o=String(v??"");if(o.length<24||o.length>4096)throw new Error("ARCA_M5_N1_PASSPHRASE_REQUIRED");return o}
function rev(v){const o=String(v??"").trim().toLowerCase();if(!/^[a-f0-9]{40}$/.test(o))throw new Error("ARCA_M5_N1_REVISION_INVALID");return o}

export function runM5N1Preflight({env=process.env}={}){
  const cfg=JSON.parse(fs.readFileSync(path.join(process.cwd(),"config/m5-n1-pncp-item-discovery.json"),"utf8"));
  if(cfg.constraints?.maxRequests!==2||cfg.constraints?.retries!==0||
     cfg.constraints?.pagina!==1||cfg.constraints?.tamanhoPagina!==10||
     cfg.constraints?.sourceNetworkAuthorized!==true||cfg.constraints?.newPncpGetAuthorized!==true||
     cfg.constraints?.humanAuthorizationRequired!==false||
     cfg.constraints?.publicationAuthorized!==false||cfg.constraints?.correlationAuthorized!==false||
     cfg.billing?.method!=="GET"||
     cfg.billing?.costClass!=="NO_MONETARY_CHARGE_OBSERVED"||
     cfg.billing?.autoExecutionAllowed!==true)
    throw new Error("ARCA_M5_N1_CONFIG_INVALID");
  const envelope=JSON.parse(fs.readFileSync(path.resolve(arg("--pncp-envelope")),"utf8"));
  const binding=JSON.parse(fs.readFileSync(path.join(process.cwd(),cfg.pncpBindingConfig),"utf8"));
  const {candidate}=deriveM5N1ItemDiscovery({
    envelope,passphrase:pass(env.ARCA_PNCP_CUSTODY_PASSPHRASE),
    pncpBindingInput:binding,expectedEnvelopeSha256:cfg.normalizedEnvelopeSha256,
    screeningSha256:cfg.screeningSha256,m5mDiagnosisSha256:cfg.m5mDiagnosisSha256,
    revision:rev(env.GITHUB_SHA)
  });
  const output=path.resolve(arg("--output"));fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(candidate,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  return candidate;
}
async function main(){
  try{
    const c=runM5N1Preflight();
    process.stdout.write(JSON.stringify({
      status:c.status,targetCount:c.targetCount,planSha256:c.planSha256,candidateSha256:c.candidateSha256,
      targetHashes:c.targetHashes,pagination:c.pagination,sourceNetworkAuthorized:c.sourceNetworkAuthorized,
      newPncpGetAuthorized:c.newPncpGetAuthorized,publicationAuthorized:c.publicationAuthorized,
      correlationAuthorized:c.correlationAuthorized
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))?error.message:"ARCA_M5_N1_PREFLIGHT_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
