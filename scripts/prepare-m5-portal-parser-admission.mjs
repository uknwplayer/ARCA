import path from "node:path";
import {pathToFileURL} from "node:url";
import {buildPortalParserAdmissionCandidate} from "../src/investigation/m5-portal-parser-admission.mjs";

export const GATE046_LIVE_BINDING=Object.freeze({
  liveRunId:"35917902630",
  custodyEnvelopeSha256:"d398da542596a7ad387f0d1c5bbe2b9e201e00e1f812507a7e2c97b16d421db5",
  custodyReceiptSha256:"1ed2cadf58f1a3213271387400e3015089c24c690b7e1c948eb63d056c564cbc",
  responseBytesSha256:"9f2d6cde37f88966204e84121da6b935f4082c7fdfa5f785f3fa649065720e66",
  scopeSha256:"38637de67d7f7eb5a5fc57fa327069c20857bd7ae7ed62b8072312a2fad37eb1"
});

export function buildGate046ParserAdmissionCandidate({env=process.env}={}){
  return buildPortalParserAdmissionCandidate({
    revision:env.GITHUB_SHA,
    ...GATE046_LIVE_BINDING
  });
}

async function main(){
  try{
    const candidate=buildGate046ParserAdmissionCandidate();
    process.stdout.write(JSON.stringify({
      status:candidate.status,
      revision:candidate.revision,
      liveRunId:candidate.liveRunId,
      observedSchemaSha256:candidate.observedSchemaSha256,
      parserContractSha256:candidate.parserContractSha256,
      custodyEnvelopeSha256:candidate.custodyEnvelopeSha256,
      custodyReceiptSha256:candidate.custodyReceiptSha256,
      responseBytesSha256:candidate.responseBytesSha256,
      scopeSha256:candidate.scopeSha256,
      candidateSha256:candidate.candidateSha256,
      liveNormalizationAuthorized:candidate.liveNormalizationAuthorized,
      networkAuthorized:candidate.networkAuthorized,
      publicationAuthorized:candidate.publicationAuthorized
    })+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_M5_G_ADMISSION_PREFLIGHT_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
