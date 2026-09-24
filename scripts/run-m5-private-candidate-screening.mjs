import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {buildM5PortalLiveNormalizedBinding} from "../src/investigation/m5-portal-live-normalized-binding.mjs";
import {buildM5PncpLiveNormalizedBinding} from "../src/investigation/m5-pncp-live-normalized-binding.mjs";
import {buildM5CorrelationReadinessFromInputs} from "../src/investigation/m5-correlation-readiness.mjs";
import {runM5PrivateCandidateScreening} from "../src/investigation/m5-private-candidate-screening.mjs";

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||i+1>=process.argv.length)throw new Error("ARCA_M5_L_ARGUMENT_REQUIRED");
  return process.argv[i+1];
}
function pass(value,code){
  const out=String(value??"");
  if(out.length<24||out.length>4096)throw new Error(code);
  return out;
}
function bindingInput(name){
  const doc=JSON.parse(fs.readFileSync(path.join(process.cwd(),"config",name),"utf8"));
  delete doc.schema;
  return doc;
}
export function runCli({env=process.env}={}){
  const portalEnvelope=JSON.parse(fs.readFileSync(path.resolve(arg("--portal-envelope")),"utf8"));
  const pncpEnvelope=JSON.parse(fs.readFileSync(path.resolve(arg("--pncp-envelope")),"utf8"));
  const output=path.resolve(arg("--output"));

  const portalInput=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-portal-live-normalized-binding-gate046.json"),"utf8"
  ));
  const pncpInput=JSON.parse(fs.readFileSync(
    path.join(process.cwd(),"config/m5-pncp-live-normalized-binding.json"),"utf8"
  ));
  const readiness=buildM5CorrelationReadinessFromInputs({portalInput,pncpInput});
  const portalBinding=buildM5PortalLiveNormalizedBinding(
    bindingInput("m5-portal-live-normalized-binding-gate046.json")
  );
  const pncpBinding=buildM5PncpLiveNormalizedBinding(
    bindingInput("m5-pncp-live-normalized-binding.json")
  );
  const result=runM5PrivateCandidateScreening({
    portalEnvelope,
    portalPassphrase:pass(env.ARCA_PORTAL_CUSTODY_PASSPHRASE,"ARCA_M5_L_PORTAL_PASSPHRASE_REQUIRED"),
    portalBinding,
    pncpEnvelope,
    pncpPassphrase:pass(env.ARCA_PNCP_CUSTODY_PASSPHRASE,"ARCA_M5_L_PNCP_PASSPHRASE_REQUIRED"),
    pncpBinding,
    readiness,
    vaultTransportUsed:true
  });
  fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n",{
    encoding:"utf8",mode:0o600,flag:"wx"
  });
  return result;
}
async function main(){
  try{
    const r=runCli();
    process.stdout.write(JSON.stringify({
      status:r.status,
      pairCount:r.pairCount,
      candidateCount:r.candidateCount,
      notObservedCount:r.notObservedCount,
      strongBridgeObserved:r.strongBridgeObserved,
      confirmedCount:r.confirmedCount,
      screeningSha256:r.screeningSha256,
      privateValuesIncluded:r.privateValuesIncluded,
      sourceNetworkUsed:r.sourceNetworkUsed
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_L_SCREENING_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
