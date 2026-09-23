#!/usr/bin/env node
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {
  verifyV41AttestedResult
} from "../src/machine-bridge/vince-v4-1-attestation.mjs";

function arg(name, fallback=null){
  const i=process.argv.indexOf(name);
  if(i<0)return fallback;
  if(i===process.argv.length-1)throw new Error(`missing value for ${name}`);
  return process.argv[i+1];
}
async function readJson(path){return JSON.parse(await readFile(path,"utf8"))}

const requestPath=arg("--request");
const resultPath=arg("--result");
const pinPath=arg("--pin");
const proofPath=arg("--proof-output","artifacts/vince-v41-termux-live-proof-006.json");

if(!requestPath||!resultPath||!pinPath)throw new Error("request/result/pin required");

const [request,result,pin]=await Promise.all([
  readJson(requestPath),
  readJson(resultPath),
  readJson(pinPath)
]);

if(pin?.format!=="arca-vince-v4.1-worker-pin"||pin.version!==1)
  throw new Error("VINCE_V41_PIN_SCHEMA_INVALID");
if(pin.workerKind!=="termux-android")
  throw new Error("VINCE_V41_PIN_WORKER_KIND_INVALID");
if(pin.policy?.action!=="git-status"||
   pin.policy?.automaticRetryAllowed!==false||
   pin.policy?.failoverAllowed!==false||
   pin.policy?.authorityExpanded!==false||
   pin.policy?.coreMutationAllowed!==false||
   pin.policy?.trustModificationAllowed!==false)
  throw new Error("VINCE_V41_PIN_POLICY_INVALID");

const proof=verifyV41AttestedResult({
  request,
  result,
  pinnedIdentity:pin.identity,
  challengeLedger:new Set(),
  now:new Date(),
  remoteEnvironment:"termux-android",
  transport:"github-contents-v4.1"
});

await mkdir(dirname(proofPath),{recursive:true});
await writeFile(proofPath,JSON.stringify({
  pin:{
    format:pin.format,
    version:pin.version,
    workerKind:pin.workerKind,
    identity:pin.identity,
    source:pin.source
  },
  request,
  result,
  proof
},null,2)+"\n","utf8");

console.log(JSON.stringify({
  status:"ATTESTED_VERIFIED_RESULT",
  missionId:proof.missionId,
  workerNodeId:proof.workerNodeId,
  workerKeyFingerprint:proof.workerKeyFingerprint,
  resultSha256:proof.resultSha256,
  proofSha256:proof.proofSha256,
  remoteEnvironment:proof.remoteEnvironment,
  automaticRetryPerformed:proof.automaticRetryPerformed,
  failoverAuthorized:proof.failoverAuthorized,
  authorityExpanded:proof.authorityExpanded
}));
