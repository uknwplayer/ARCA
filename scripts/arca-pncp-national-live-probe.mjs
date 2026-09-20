import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {
  BRAZIL_UF_CODES,
  buildPncpNationalWatchPlan
} from "../src/machine-bridge/pncp-national-watcher.mjs";
import {
  createPncpNationalScheduler,
  PNCP_PUBLIC_NETWORK_CONFIRMATION
} from "../src/machine-bridge/pncp-national-scheduler.mjs";
import {
  createPncpNationalDiscoveryRunner,
  PNCP_NATIONAL_NETWORK_CONFIRMATION
} from "../src/machine-bridge/pncp-national-discovery-runner.mjs";
import {
  createPncpConsultaHttpTransport
} from "../packages/pncp-connector/src/discovery.ts";
import {
  sealCustodyDirectory
} from "../src/machine-bridge/encrypted-custody-envelope.mjs";

export const PNCP_LIVE_PROBE_SCHEMA="arca.pncp-controlled-live-probe.v0.1";

function sha256(value){
  return createHash("sha256").update(value).digest("hex");
}
function required(value,name,max=256){
  const text=String(value??"").normalize("NFKC").trim();
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))
    throw new Error(`ARCA_PNCP_LIVE_INVALID_${name}`);
  return text;
}
function modality(value){
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<1||number>10000)
    throw new Error("ARCA_PNCP_LIVE_INVALID_MODALITY");
  return number;
}
function date(value){
  const text=required(value,"DATE",8);
  if(!/^\d{8}$/.test(text))throw new Error("ARCA_PNCP_LIVE_INVALID_DATE");
  return text;
}
function uf(value){
  const text=required(value,"UF",2).toUpperCase();
  if(!BRAZIL_UF_CODES.includes(text))throw new Error("ARCA_PNCP_LIVE_INVALID_UF");
  return text;
}
function revision(value){
  const text=required(value,"REVISION",64).toLowerCase();
  if(!/^[a-f0-9]{40,64}$/.test(text))throw new Error("ARCA_PNCP_LIVE_INVALID_REVISION");
  return text;
}
function confirmation(value){
  if(value!==PNCP_PUBLIC_NETWORK_CONFIRMATION||
     value!==PNCP_NATIONAL_NETWORK_CONFIRMATION)
    throw new Error("ARCA_PNCP_LIVE_NETWORK_NOT_AUTHORIZED");
  return value;
}

export async function runPncpControlledLiveProbe({
  env=process.env,
  fetchImpl=globalThis.fetch
}={}){
  const confirm=confirmation(env.ARCA_PNCP_CONFIRMATION);
  const passphrase=required(env.ARCA_PNCP_CUSTODY_PASSPHRASE,"CUSTODY_SECRET",4096);
  if(passphrase.length<24)throw new Error("ARCA_PNCP_LIVE_CUSTODY_SECRET_WEAK");
  if(typeof fetchImpl!=="function")throw new Error("ARCA_PNCP_LIVE_FETCH_UNAVAILABLE");

  const selectedUf=uf(env.ARCA_PNCP_LIVE_UF);
  const selectedDate=date(env.ARCA_PNCP_LIVE_DATE);
  const modalidadeId=modality(env.ARCA_PNCP_LIVE_MODALITY_ID);
  const repository=required(env.GITHUB_REPOSITORY??"local/ARCA","REPOSITORY");
  const codeRevision=revision(env.GITHUB_SHA);
  const outputDir=path.resolve(env.ARCA_PNCP_LIVE_OUTPUT_DIR??path.join(process.cwd(),"artifacts"));
  fs.mkdirSync(outputDir,{recursive:true});

  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-live-"));
  const custodyRoot=path.join(root,"custody");
  const stagingRoot=path.join(root,"staging");
  const schedulerRoot=path.join(root,"scheduler");
  const shardId=`BR-UF-${selectedUf}`;

  try{
    const plan=buildPncpNationalWatchPlan({
      dataInicial:selectedDate,
      dataFinal:selectedDate,
      modalidadeIds:[modalidadeId]
    },{
      maxPagesPerModality:1,
      maxTotalPages:1,
      maxRecords:10,
      pageSize:10,
      maxConcurrentShards:1
    });

    const runner=createPncpNationalDiscoveryRunner({
      custodyRoot,
      stagingRoot,
      transportFactory:()=>createPncpConsultaHttpTransport({
        allowNetwork:true,
        fetchImpl,
        maxRetries:0,
        timeoutMs:15000
      }),
      networkEnabled:true,
      authorizePublicNetwork:true,
      confirmation:confirm
    });

    const scheduler=createPncpNationalScheduler({root:schedulerRoot});
    const cycle=await scheduler.runCycle({
      plan,
      discoveryRunner:runner,
      classifier:{async classify(){return []}},
      ingress:{async ingest(){throw new Error("ARCA_PNCP_LIVE_INGRESS_MUST_NOT_RUN")}},
      shardIds:[shardId],
      maxShardsPerRun:1,
      maxFailuresPerRun:1,
      maxObservationsPerShard:1,
      retryFailed:false,
      authorizePublicNetwork:true,
      confirmation:confirm
    });

    if(cycle.processed!==1||cycle.succeeded!==1||cycle.failed!==0||
       cycle.selectedShardIds?.length!==1||cycle.selectedShardIds[0]!==shardId)
      throw new Error("ARCA_PNCP_LIVE_CYCLE_FAILED");

    const checkpoint=scheduler.getCheckpoint(plan);
    const completed=checkpoint.completed?.[shardId];
    if(!completed||!/^[a-f0-9]{64}$/.test(completed.resultHash))
      throw new Error("ARCA_PNCP_LIVE_CHECKPOINT_INVALID");

    const scopeHash=sha256(JSON.stringify({
      schema:PNCP_LIVE_PROBE_SCHEMA,
      uf:selectedUf,
      date:selectedDate,
      modalidadeId,
      planFingerprint:cycle.planFingerprint,
      shardId
    }));

    const envelope=sealCustodyDirectory({
      root:custodyRoot,
      passphrase,
      repository,
      revision:codeRevision,
      scopeHash
    });
    const envelopePath=path.join(outputDir,"pncp-live-custody.envelope.json");
    fs.writeFileSync(envelopePath,JSON.stringify(envelope)+"\n",{encoding:"utf8",mode:0o600});

    const envelopeHash=sha256(JSON.stringify(envelope));
    const proof={
      schema:PNCP_LIVE_PROBE_SCHEMA,
      status:"CAPTURED_AND_SEALED",
      repository,
      revision:codeRevision,
      scope:{uf:selectedUf,date:selectedDate,modalidadeId},
      shardId,
      planFingerprint:cycle.planFingerprint,
      resultHash:completed.resultHash,
      targetCount:completed.targetCount,
      observationCount:completed.observationCount,
      networkUsed:true,
      budgets:{maxShards:1,maxPages:1,maxRecords:10,pageSize:10},
      custody:{
        encrypted:true,
        envelopeHash,
        contentRootHash:envelope.contentRootHash,
        payloadHash:envelope.payloadHash,
        fileCount:envelope.fileCount,
        totalBytes:envelope.totalBytes,
        plaintextPublished:false
      },
      classifierEmittedSignals:false,
      investigationIngressUsed:false,
      automaticAdversePublication:false,
      humanReviewRequired:true,
      anomalyIsNotIrregularity:true
    };
    const proofPath=path.join(outputDir,"pncp-live-proof.json");
    fs.writeFileSync(proofPath,JSON.stringify(proof,null,2)+"\n",{encoding:"utf8",mode:0o600});

    return Object.freeze({proof,envelopePath,proofPath});
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}

async function main(){
  try{
    const {proof}=await runPncpControlledLiveProbe();
    process.stdout.write(JSON.stringify({
      schema:proof.schema,
      status:proof.status,
      shardId:proof.shardId,
      planFingerprint:proof.planFingerprint,
      resultHash:proof.resultHash,
      targetCount:proof.targetCount,
      envelopeHash:proof.custody.envelopeHash,
      humanReviewRequired:true
    })+"\n");
  }catch(error){
    const errorRef=sha256(String(error?.message??error??"unknown"));
    process.stderr.write(JSON.stringify({
      schema:PNCP_LIVE_PROBE_SCHEMA,
      status:"FAILED",
      errorRef:`sha256:${errorRef}`
    })+"\n");
    process.exitCode=1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await main();
}
