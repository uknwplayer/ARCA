import {createHash} from "node:crypto";

export const ARCA_VINCE_V411_REGISTRY_FORMAT="arca-vince-v4.1-accepted-challenge-registry";
export const ARCA_VINCE_V411_REGISTRY_VERSION=1;

const HASH=/^[a-f0-9]{64}$/;
const B64URL=/^[A-Za-z0-9_-]+$/;
const MISSION_ID=/^vince-v41-[A-Za-z0-9._-]{1,96}$/;
const NODE_ID=/^[A-Za-z0-9._-]{1,120}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function exactKeys(value,expected){
  return JSON.stringify(Object.keys(value).sort())===JSON.stringify([...expected].sort());
}
function decodeChallenge(value){
  if(typeof value!=="string"||!B64URL.test(value))throw new Error("VINCE_V411_CHALLENGE_INVALID");
  let bytes;
  try{bytes=Buffer.from(value,"base64url")}catch{throw new Error("VINCE_V411_CHALLENGE_INVALID")}
  if(bytes.length!==32||bytes.toString("base64url")!==value)throw new Error("VINCE_V411_CHALLENGE_INVALID");
  return bytes;
}
function isoInstant(value){
  if(typeof value!=="string")return false;
  const millis=Date.parse(value);
  return Number.isFinite(millis)&&new Date(millis).toISOString()===value;
}
function validateEntry(entry){
  if(!plain(entry)||!exactKeys(entry,[
    "acceptedAt","challengeSha256","missionId","proofSha256","requestSha256","resultSha256",
    "workerKeyFingerprint","workerNodeId"
  ]))throw new Error("VINCE_V411_REGISTRY_ENTRY_SCHEMA_INVALID");
  if(!isoInstant(entry.acceptedAt))throw new Error("VINCE_V411_REGISTRY_ACCEPTED_AT_INVALID");
  if(!HASH.test(entry.challengeSha256)||!HASH.test(entry.requestSha256)||!HASH.test(entry.resultSha256)||
     !HASH.test(entry.proofSha256)||!HASH.test(entry.workerKeyFingerprint))
    throw new Error("VINCE_V411_REGISTRY_HASH_INVALID");
  if(!MISSION_ID.test(entry.missionId))throw new Error("VINCE_V411_REGISTRY_MISSION_INVALID");
  if(typeof entry.workerNodeId!=="string"||!NODE_ID.test(entry.workerNodeId))
    throw new Error("VINCE_V411_REGISTRY_WORKER_INVALID");
}

export function v41ChallengeSha256(challenge){
  return createHash("sha256").update(decodeChallenge(challenge)).digest("hex");
}

export function createEmptyV41AcceptedChallengeRegistry(){
  return {
    format:ARCA_VINCE_V411_REGISTRY_FORMAT,
    version:ARCA_VINCE_V411_REGISTRY_VERSION,
    entries:[]
  };
}

export function validateV41AcceptedChallengeRegistry(registry){
  if(!plain(registry)||!exactKeys(registry,["entries","format","version"])||
     registry.format!==ARCA_VINCE_V411_REGISTRY_FORMAT||
     registry.version!==ARCA_VINCE_V411_REGISTRY_VERSION||
     !Array.isArray(registry.entries))
    throw new Error("VINCE_V411_REGISTRY_SCHEMA_INVALID");
  const challenges=new Set();
  const missions=new Set();
  for(const entry of registry.entries){
    validateEntry(entry);
    if(challenges.has(entry.challengeSha256))throw new Error("VINCE_V411_REGISTRY_DUPLICATE_CHALLENGE");
    if(missions.has(entry.missionId))throw new Error("VINCE_V411_REGISTRY_DUPLICATE_MISSION");
    challenges.add(entry.challengeSha256);
    missions.add(entry.missionId);
  }
  return registry;
}

export function hasV41AcceptedChallenge(registry,challenge){
  validateV41AcceptedChallengeRegistry(registry);
  const digest=v41ChallengeSha256(challenge);
  return registry.entries.some(entry=>entry.challengeSha256===digest);
}

export function createV41DurableChallengeLedger(registry){
  validateV41AcceptedChallengeRegistry(registry);
  const accepted=new Set(registry.entries.map(entry=>entry.challengeSha256));
  const pending=new Set();
  return Object.freeze({
    has(challenge){
      const digest=v41ChallengeSha256(challenge);
      return accepted.has(digest)||pending.has(digest);
    },
    add(challenge){
      const digest=v41ChallengeSha256(challenge);
      if(accepted.has(digest)||pending.has(digest))throw new Error("VINCE_V41_CHALLENGE_REPLAY");
      pending.add(digest);
    },
    pendingDigests(){return [...pending].sort()}
  });
}

export function appendV41AcceptedChallenge(registry,proof,{acceptedAt=new Date().toISOString()}={}){
  validateV41AcceptedChallengeRegistry(registry);
  if(!plain(proof))throw new Error("VINCE_V411_PROOF_REQUIRED");
  for(const field of [
    "challenge","missionId","requestSha256","resultSha256","proofSha256",
    "workerNodeId","workerKeyFingerprint"
  ]){
    if(typeof proof[field]!=="string"||!proof[field])throw new Error("VINCE_V411_PROOF_FIELDS_INVALID");
  }
  if(proof.executionState!=="ATTESTED_VERIFIED_RESULT"||proof.cryptographicWorkerAttestation!==true)
    throw new Error("VINCE_V411_PROOF_NOT_ATTESTED");
  if(!isoInstant(acceptedAt))throw new Error("VINCE_V411_REGISTRY_ACCEPTED_AT_INVALID");

  const challengeSha256=v41ChallengeSha256(proof.challenge);
  if(registry.entries.some(entry=>entry.challengeSha256===challengeSha256))
    throw new Error("VINCE_V41_CHALLENGE_REPLAY");
  if(registry.entries.some(entry=>entry.missionId===proof.missionId))
    throw new Error("VINCE_V411_MISSION_ALREADY_ACCEPTED");

  const entry={
    acceptedAt,
    challengeSha256,
    missionId:proof.missionId,
    requestSha256:proof.requestSha256,
    resultSha256:proof.resultSha256,
    proofSha256:proof.proofSha256,
    workerNodeId:proof.workerNodeId,
    workerKeyFingerprint:proof.workerKeyFingerprint
  };
  validateEntry(entry);
  return {
    format:ARCA_VINCE_V411_REGISTRY_FORMAT,
    version:ARCA_VINCE_V411_REGISTRY_VERSION,
    entries:[...registry.entries,entry].sort(
      (a,b)=>a.acceptedAt.localeCompare(b.acceptedAt)||a.missionId.localeCompare(b.missionId)
    )
  };
}
