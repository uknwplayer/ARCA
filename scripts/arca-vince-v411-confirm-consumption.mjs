#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {
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

const proofPath=arg("--proof-envelope");
const registryPath=arg("--registry");
if(!proofPath||!registryPath)throw new Error("proof-envelope/registry required");

const [envelope,registry]=await Promise.all([readJson(proofPath),readJson(registryPath)]);
validateV41AcceptedChallengeRegistry(registry);
const proof=envelope?.proof;
if(!proof||proof.executionState!=="ATTESTED_VERIFIED_RESULT")
  throw new Error("VINCE_V411_PROOF_ENVELOPE_INVALID");

const challengeSha256=v41ChallengeSha256(proof.challenge);
const entry=registry.entries.find(candidate=>candidate.challengeSha256===challengeSha256);
if(!entry)throw new Error("VINCE_V411_DURABLE_CONSUMPTION_NOT_FOUND");

for(const [entryField,proofField] of [
  ["missionId","missionId"],
  ["requestSha256","requestSha256"],
  ["resultSha256","resultSha256"],
  ["proofSha256","proofSha256"],
  ["workerNodeId","workerNodeId"],
  ["workerKeyFingerprint","workerKeyFingerprint"]
]){
  if(entry[entryField]!==proof[proofField])
    throw new Error("VINCE_V411_DURABLE_CONSUMPTION_MISMATCH");
}

console.log(JSON.stringify({
  status:"ATTESTED_VERIFIED_RESULT",
  missionId:proof.missionId,
  workerNodeId:proof.workerNodeId,
  workerKeyFingerprint:proof.workerKeyFingerprint,
  proofSha256:proof.proofSha256,
  challengeSha256,
  durableChallengeConsumed:true,
  acceptedAt:entry.acceptedAt
}));
