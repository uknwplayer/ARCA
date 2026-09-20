import {createHash} from "node:crypto";
import {
  PNCP_NATIONAL_SCHEDULER_SCHEMA,
  PNCP_NATIONAL_CHECKPOINT_FORMAT
} from "./pncp-national-scheduler.mjs";
import {PNCP_NATIONAL_RUNNER_SCHEMA} from "./pncp-national-discovery-runner.mjs";

export const PNCP_NATIONAL_OFFLINE_ATTESTATION_SCHEMA="arca.pncp-national-offline-attestation.v0.1";

function digest(value){
  return createHash("sha256").update(typeof value==="string"?value:stableStringify(value)).digest("hex");
}

function stableStringify(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableStringify(value[key])).join(",")+"}";
}

function requiredText(value,field,max=240){
  const text=String(value??"").normalize("NFKC").trim();
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))
    throw new Error(`ARCA_PNCP_ATTESTATION_INVALID_${field}`);
  return text;
}

function sha256(value,field){
  const text=requiredText(value,field,64).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(text))
    throw new Error(`ARCA_PNCP_ATTESTATION_INVALID_${field}`);
  return text;
}

function revision(value){
  const text=requiredText(value,"REVISION",64).toLowerCase();
  if(!/^[a-f0-9]{40,64}$/.test(text))
    throw new Error("ARCA_PNCP_ATTESTATION_INVALID_REVISION");
  return text;
}

function instant(value){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))
    throw new Error("ARCA_PNCP_ATTESTATION_INVALID_TIME");
  return date.toISOString();
}

function assertCycle(result){
  if(result?.schema!=="arca.pncp-national-scheduler-cycle-result.v0.1")
    throw new Error("ARCA_PNCP_ATTESTATION_CYCLE_SCHEMA_INVALID");
  if(result.status!=="COMPLETED"||result.processed!==27||result.succeeded!==27||
     result.failed!==0||result.totals?.shards!==27||result.totals?.completed!==27||
     result.totals?.failed!==0||result.totals?.remaining!==0)
    throw new Error("ARCA_PNCP_ATTESTATION_CYCLE_INCOMPLETE");
  if(result.humanReviewRequired!==true||result.anomalyIsNotIrregularity!==true)
    throw new Error("ARCA_PNCP_ATTESTATION_CYCLE_INVARIANT_INVALID");
}

function assertCheckpoint(checkpoint,planFingerprint){
  if(checkpoint?.format!==PNCP_NATIONAL_CHECKPOINT_FORMAT||
     checkpoint.planFingerprint!==planFingerprint||
     checkpoint.status!=="COMPLETED")
    throw new Error("ARCA_PNCP_ATTESTATION_CHECKPOINT_INVALID");
  const completed=checkpoint.completed&&typeof checkpoint.completed==="object"
    ?Object.keys(checkpoint.completed):[];
  const failed=checkpoint.failed&&typeof checkpoint.failed==="object"
    ?Object.keys(checkpoint.failed):[];
  if(completed.length!==27||failed.length!==0)
    throw new Error("ARCA_PNCP_ATTESTATION_CHECKPOINT_INCOMPLETE");
  for(const shardId of completed){
    if(!/^BR-UF-[A-Z]{2}$/.test(shardId))
      throw new Error("ARCA_PNCP_ATTESTATION_CHECKPOINT_SHARD_INVALID");
    const entry=checkpoint.completed[shardId];
    sha256(entry?.resultHash,"RESULT_HASH");
    if(!Number.isSafeInteger(entry?.targetCount)||entry.targetCount<0||
       !Number.isSafeInteger(entry?.observationCount)||entry.observationCount<0)
      throw new Error("ARCA_PNCP_ATTESTATION_CHECKPOINT_COUNT_INVALID");
  }
}

function assertCustody(summary){
  if(summary?.manifests!==27||summary?.missing!==0||summary?.invalid!==0)
    throw new Error("ARCA_PNCP_ATTESTATION_CUSTODY_INCOMPLETE");
  if(summary.custodyBeforeParsing!==true)
    throw new Error("ARCA_PNCP_ATTESTATION_CUSTODY_INVARIANT_INVALID");
}

export function createPncpNationalOfflineAttestation({
  repository,
  revision:codeRevision,
  cycleResult,
  checkpoint,
  custodySummary,
  networkUsed,
  generatedAt=new Date()
}={}){
  const repositoryName=requiredText(repository,"REPOSITORY");
  const code=revision(codeRevision);
  if(networkUsed!==false)
    throw new Error("ARCA_PNCP_ATTESTATION_NETWORK_MUST_BE_OFFLINE");

  assertCycle(cycleResult);
  const planFingerprint=sha256(cycleResult.planFingerprint,"PLAN_FINGERPRINT");
  assertCheckpoint(checkpoint,planFingerprint);
  assertCustody(custodySummary);

  const completedShardIds=Object.keys(checkpoint.completed).sort();
  const completedDigest=digest(completedShardIds.map(shardId=>({
    shardId,
    resultHash:checkpoint.completed[shardId].resultHash,
    targetCount:checkpoint.completed[shardId].targetCount,
    observationCount:checkpoint.completed[shardId].observationCount
  })));

  const body=Object.freeze({
    schema:PNCP_NATIONAL_OFFLINE_ATTESTATION_SCHEMA,
    status:"VERIFIED_OFFLINE",
    repository:repositoryName,
    revision:code,
    generatedAt:instant(generatedAt),
    dependencies:Object.freeze({
      scheduler:PNCP_NATIONAL_SCHEDULER_SCHEMA,
      runner:PNCP_NATIONAL_RUNNER_SCHEMA,
      checkpoint:PNCP_NATIONAL_CHECKPOINT_FORMAT
    }),
    proof:Object.freeze({
      planFingerprint,
      completedShardIds:Object.freeze(completedShardIds),
      completedDigest,
      shards:27,
      succeeded:27,
      failed:0,
      custodyManifests:27,
      networkUsed:false
    }),
    gates:Object.freeze({
      publicNetworkAuthorized:false,
      realCollectionAuthorized:false,
      executionAuthorized:false,
      automaticAdversePublication:false,
      humanReviewRequired:true,
      anomalyIsNotIrregularity:true
    })
  });

  return Object.freeze({
    ...body,
    attestationHash:digest(body)
  });
}

export function verifyPncpNationalOfflineAttestation(attestation){
  if(attestation?.schema!==PNCP_NATIONAL_OFFLINE_ATTESTATION_SCHEMA||
     attestation.status!=="VERIFIED_OFFLINE")
    return false;
  const {attestationHash,...body}=attestation;
  if(!/^[a-f0-9]{64}$/.test(String(attestationHash??"")))return false;
  if(body.proof?.networkUsed!==false||
     body.gates?.publicNetworkAuthorized!==false||
     body.gates?.realCollectionAuthorized!==false||
     body.gates?.executionAuthorized!==false||
     body.gates?.automaticAdversePublication!==false||
     body.gates?.humanReviewRequired!==true||
     body.gates?.anomalyIsNotIrregularity!==true)
    return false;
  return digest(body)===attestationHash;
}
