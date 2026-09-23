#!/usr/bin/env node
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {verifyV41AttestedResult} from "../src/machine-bridge/vince-v4-1-attestation.mjs";
import {
  appendV41AcceptedChallenge,
  createV41DurableChallengeLedger,
  hasV41AcceptedChallenge,
  validateV41AcceptedChallengeRegistry,
  v41ChallengeSha256
} from "../src/machine-bridge/vince-v4-1-durable-challenge-registry.mjs";

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  if(i<0)return fallback;
  if(i===process.argv.length-1)throw new Error(`missing value for ${name}`);
  return process.argv[i+1];
}
async function readJson(path){return JSON.parse(await readFile(path,"utf8"))}
async function writeJson(path,value){
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(value,null,2)+"\n","utf8");
}

const requestPath=arg("--request");
const resultPath=arg("--result");
const pinPath=arg("--pin");
const registryPath=arg("--registry");
const proofPath=arg("--proof-output","artifacts/vince-v411-termux-proof.json");
const registryOutputPath=arg("--registry-output","artifacts/vince-v411-next-registry.json");
const acceptedAt=arg("--accepted-at",new Date().toISOString());

if(!requestPath||!resultPath||!pinPath||!registryPath)
  throw new Error("request/result/pin/registry required");

const [request,result,pin,registry]=await Promise.all([
  readJson(requestPath),
  readJson(resultPath),
  readJson(pinPath),
  readJson(registryPath)
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

validateV41AcceptedChallengeRegistry(registry);
if(hasV41AcceptedChallenge(registry,request?.challenge))
  throw new Error("VINCE_V41_CHALLENGE_REPLAY");
const challengeLedger=createV41DurableChallengeLedger(registry);
const proof=verifyV41AttestedResult({
  request,
  result,
  pinnedIdentity:pin.identity,
  challengeLedger,
  now:new Date(),
  remoteEnvironment:"termux-android",
  transport:"github-contents-v4.1"
});

const expectedDigest=v41ChallengeSha256(proof.challenge);
if(JSON.stringify(challengeLedger.pendingDigests())!==JSON.stringify([expectedDigest]))
  throw new Error("VINCE_V411_PENDING_CHALLENGE_STATE_INVALID");

const nextRegistry=appendV41AcceptedChallenge(registry,proof,{acceptedAt});

await Promise.all([
  writeJson(proofPath,{
    pin:{
      format:pin.format,
      version:pin.version,
      workerKind:pin.workerKind,
      identity:pin.identity,
      source:pin.source
    },
    request,
    result,
    proof,
    durableChallengeConsumption:{
      state:"PENDING_CONTROL_PLANE_COMMIT",
      registryFormat:nextRegistry.format,
      challengeSha256:expectedDigest,
      previousEntryCount:registry.entries.length,
      nextEntryCount:nextRegistry.entries.length
    }
  }),
  writeJson(registryOutputPath,nextRegistry)
]);

console.log(JSON.stringify({
  status:"ATTESTATION_VALID_PENDING_DURABLE_CONSUMPTION",
  missionId:proof.missionId,
  workerNodeId:proof.workerNodeId,
  workerKeyFingerprint:proof.workerKeyFingerprint,
  resultSha256:proof.resultSha256,
  proofSha256:proof.proofSha256,
  challengeSha256:expectedDigest,
  durableRegistryPreviousEntries:registry.entries.length,
  durableRegistryNextEntries:nextRegistry.entries.length
}));
