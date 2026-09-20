import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {
  createGitHubPrivateCustodyBackend
} from "../src/machine-bridge/durable-private-custody.mjs";

export const DURABLE_CUSTODY_MIGRATION_SCHEMA="arca.durable-custody-migration-proof.v0.1";
export const DURABLE_CUSTODY_MIGRATION_CONFIRMATION="MIGRATE_ENCRYPTED_CUSTODY_ONLY";

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function required(value,name,max=4096){
  const text=String(value??"").normalize("NFKC").trim();
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))
    throw new Error(`ARCA_CUSTODY_MIGRATION_INVALID_${name}`);
  return text;
}
function runId(value){
  const text=required(value,"SOURCE_RUN_ID",32);
  if(!/^[1-9][0-9]{0,19}$/.test(text))
    throw new Error("ARCA_CUSTODY_MIGRATION_INVALID_SOURCE_RUN_ID");
  return text;
}
function readJson(file,name,maxBytes){
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<2||stat.size>maxBytes)
    throw new Error(`ARCA_CUSTODY_MIGRATION_INVALID_${name}_SIZE`);
  return JSON.parse(fs.readFileSync(file,"utf8"));
}

export async function migrateEncryptedCustodyArtifact({
  env=process.env,
  fetchImpl=globalThis.fetch,
  durableCustodyBackend=null
}={}){
  if(env.ARCA_CUSTODY_MIGRATION_CONFIRMATION!==DURABLE_CUSTODY_MIGRATION_CONFIRMATION)
    throw new Error("ARCA_CUSTODY_MIGRATION_NOT_AUTHORIZED");

  const sourceRunId=runId(env.ARCA_CUSTODY_SOURCE_RUN_ID);
  const inputDir=path.resolve(required(env.ARCA_CUSTODY_MIGRATION_INPUT_DIR,"INPUT_DIR",2048));
  const outputDir=path.resolve(env.ARCA_CUSTODY_MIGRATION_OUTPUT_DIR??path.join(process.cwd(),"artifacts"));
  fs.mkdirSync(outputDir,{recursive:true});

  const envelopePath=path.join(inputDir,"pncp-live-custody.envelope.json");
  const proofPath=path.join(inputDir,"pncp-live-proof.json");
  if(!fs.existsSync(envelopePath)||!fs.existsSync(proofPath))
    throw new Error("ARCA_CUSTODY_MIGRATION_SOURCE_FILES_MISSING");

  const envelope=readJson(envelopePath,"ENVELOPE",60*1024*1024);
  const sourceProof=readJson(proofPath,"PROOF",2*1024*1024);
  if(envelope?.schema!=="arca.encrypted-custody-envelope.v0.1"||
     envelope?.status!=="SEALED"||
     envelope?.plaintextIncluded!==false)
    throw new Error("ARCA_CUSTODY_MIGRATION_ENVELOPE_INVALID");
  if(sourceProof?.schema!=="arca.pncp-controlled-live-probe.v0.1"||
     sourceProof?.status!=="CAPTURED_AND_SEALED"||
     sourceProof?.custody?.encrypted!==true||
     sourceProof?.custody?.plaintextPublished!==false)
    throw new Error("ARCA_CUSTODY_MIGRATION_PROOF_INVALID");

  let backend=durableCustodyBackend;
  if(!backend){
    backend=createGitHubPrivateCustodyBackend({
      repository:required(env.ARCA_CUSTODY_VAULT_REPOSITORY,"VAULT_REPOSITORY",256),
      branch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
      token:required(env.ARCA_CUSTODY_VAULT_TOKEN,"VAULT_TOKEN",4096),
      fetchImpl
    });
  }
  if(typeof backend?.preflight!=="function"||typeof backend?.persist!=="function")
    throw new Error("ARCA_CUSTODY_MIGRATION_BACKEND_INVALID");

  const preflight=await backend.preflight();
  if(preflight?.ready!==true||preflight?.private!==true)
    throw new Error("ARCA_CUSTODY_MIGRATION_PREFLIGHT_FAILED");

  const stored=await backend.persist({envelope,proof:sourceProof});
  if(!["STORED","ALREADY_STORED"].includes(stored?.status)||
     !/^[a-f0-9]{64}$/.test(stored?.receiptHash??"")||
     !/^[a-f0-9]{40}$/.test(stored?.vaultCommitSha??""))
    throw new Error("ARCA_CUSTODY_MIGRATION_PERSIST_FAILED");

  const migrationProof={
    schema:DURABLE_CUSTODY_MIGRATION_SCHEMA,
    status:stored.status==="STORED"?"MIGRATED_PRIVATE":"ALREADY_MIGRATED_PRIVATE",
    sourceRunId,
    sourceProofSchema:sourceProof.schema,
    sourceRevision:sourceProof.revision,
    sourceResultHash:sourceProof.resultHash,
    envelopeHash:sourceProof.custody.envelopeHash,
    durableReceiptHash:stored.receiptHash,
    vaultCommitRefHash:sha256(stored.vaultCommitSha),
    plaintextRead:false,
    plaintextStored:false,
    decryptionPerformed:false,
    pncpNetworkUsed:false,
    classifierEmittedSignals:false,
    investigationIngressUsed:false,
    automaticAdversePublication:false,
    humanReviewRequired:true,
    anomalyIsNotIrregularity:true
  };
  const out=path.join(outputDir,"durable-custody-migration-proof.json");
  fs.writeFileSync(out,JSON.stringify(migrationProof,null,2)+"\n",{encoding:"utf8",mode:0o600});
  return Object.freeze({proof:migrationProof,proofPath:out});
}

async function main(){
  try{
    const {proof}=await migrateEncryptedCustodyArtifact();
    process.stdout.write(JSON.stringify({
      schema:proof.schema,
      status:proof.status,
      sourceRunId:proof.sourceRunId,
      envelopeHash:proof.envelopeHash,
      durableReceiptHash:proof.durableReceiptHash,
      vaultCommitRefHash:proof.vaultCommitRefHash,
      plaintextStored:false
    })+"\n");
  }catch(error){
    const errorRef=sha256(String(error?.message??error??"unknown"));
    process.stderr.write(JSON.stringify({
      schema:DURABLE_CUSTODY_MIGRATION_SCHEMA,
      status:"FAILED",
      errorRef:`sha256:${errorRef}`
    })+"\n");
    process.exitCode=1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await main();
}
