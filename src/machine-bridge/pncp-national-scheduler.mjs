import fs from "node:fs";
import path from "node:path";
import {createHash,randomBytes} from "node:crypto";
import {PNCP_NATIONAL_WATCH_PLAN_FORMAT} from "./pncp-national-watcher.mjs";

export const PNCP_NATIONAL_SCHEDULER_SCHEMA="arca.pncp-national-scheduler.v0.1";
export const PNCP_NATIONAL_CHECKPOINT_FORMAT="arca-pncp-national-watch-checkpoint-v0.1";
export const PNCP_PUBLIC_NETWORK_CONFIRMATION="PNCP_PUBLIC_GET_ONLY";

function digest(value){return createHash("sha256").update(JSON.stringify(value)).digest("hex")}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function positive(value,fallback,max,field){
  const number=value===undefined?fallback:Number(value);
  if(!Number.isSafeInteger(number)||number<1||number>max)
    throw new RangeError(`${field} must be between 1 and ${max}`);
  return number;
}
function instant(clock){
  const value=clock();
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error("ARCA_PNCP_SCHEDULER_INVALID_CLOCK");
  return date.toISOString();
}
function validatePlan(plan){
  if(plan?.format!==PNCP_NATIONAL_WATCH_PLAN_FORMAT||!Array.isArray(plan.shards)||plan.shards.length!==27)
    throw new Error("ARCA_PNCP_SCHEDULER_PLAN_INVALID");
  const ids=new Set();
  for(const shard of plan.shards){
    if(!/^BR-UF-[A-Z]{2}$/.test(shard?.shardId)||!shard?.discovery||shard.discovery.scope?.uf!==shard.uf)
      throw new Error("ARCA_PNCP_SCHEDULER_SHARD_INVALID");
    if(ids.has(shard.shardId))throw new Error("ARCA_PNCP_SCHEDULER_SHARD_DUPLICATE");
    ids.add(shard.shardId);
  }
}
function selectedShards(plan,shardIds){
  if(shardIds===undefined||shardIds===null)return null;
  if(!Array.isArray(shardIds)||shardIds.length<1||shardIds.length>27)
    throw new Error("ARCA_PNCP_SCHEDULER_SELECTION_INVALID");
  const available=new Set(plan.shards.map(shard=>shard.shardId));
  const selected=new Set();
  for(const value of shardIds){
    const id=String(value??"").trim().toUpperCase();
    if(!/^BR-UF-[A-Z]{2}$/.test(id)||!available.has(id)||selected.has(id))
      throw new Error("ARCA_PNCP_SCHEDULER_SELECTION_INVALID");
    selected.add(id);
  }
  return selected;
}
function planFingerprint(plan){
  return digest({
    format:plan.format,
    coverage:plan.coverage,
    scheduling:plan.scheduling,
    budgets:plan.budgets,
    shards:plan.shards.map(shard=>({
      shardId:shard.shardId,
      uf:shard.uf,
      scope:shard.discovery.scope,
      modalidadeIds:shard.discovery.modalidadeIds,
      budgets:shard.discovery.budgets
    }))
  });
}
function errorReference(error){
  const candidates=[error?.code,error?.cause?.code,error?.cause?.cause?.code];
  for(const value of candidates){
    const code=String(value??"").trim().toUpperCase();
    if(/^[A-Z][A-Z0-9_]{2,96}$/.test(code))return `code:${code}`;
  }
  return "sha256:"+createHash("sha256").update(String(error?.message??error??"unknown")).digest("hex");
}

export function createPncpNationalScheduler({
  root,
  clock=()=>new Date(),
  fsImpl=fs
}={}){
  if(!root)throw new Error("ARCA_PNCP_SCHEDULER_ROOT_REQUIRED");
  const checkpointsDir=path.join(root,"checkpoints");
  const tmpDir=path.join(root,"tmp");
  fsImpl.mkdirSync(checkpointsDir,{recursive:true});
  fsImpl.mkdirSync(tmpDir,{recursive:true});

  function fileFor(fingerprint){return path.join(checkpointsDir,fingerprint+".json")}
  function read(file){return fsImpl.existsSync(file)?JSON.parse(fsImpl.readFileSync(file,"utf8")):null}
  function atomicWrite(file,value){
    const temporary=path.join(tmpDir,path.basename(file)+"."+process.pid+"."+randomBytes(6).toString("hex")+".tmp");
    let descriptor=null;
    try{
      descriptor=fsImpl.openSync(temporary,"wx",0o600);
      fsImpl.writeFileSync(descriptor,JSON.stringify(value)+"\n","utf8");
      fsImpl.fsyncSync?.(descriptor);
      fsImpl.closeSync(descriptor);descriptor=null;
      fsImpl.renameSync(temporary,file);
      try{
        const directory=fsImpl.openSync(path.dirname(file),"r");
        fsImpl.fsyncSync?.(directory);fsImpl.closeSync(directory);
      }catch{}
    }finally{
      if(descriptor!==null)try{fsImpl.closeSync(descriptor)}catch{}
      if(fsImpl.existsSync(temporary))try{fsImpl.unlinkSync(temporary)}catch{}
    }
  }

  function checkpointFor(plan){
    validatePlan(plan);
    const fingerprint=planFingerprint(plan);
    const file=fileFor(fingerprint);
    const existing=read(file);
    if(existing){
      if(existing.format!==PNCP_NATIONAL_CHECKPOINT_FORMAT||existing.planFingerprint!==fingerprint)
        throw new Error("ARCA_PNCP_SCHEDULER_CHECKPOINT_INVALID");
      return {checkpoint:existing,file,fingerprint};
    }
    const at=instant(clock);
    return {
      file,
      fingerprint,
      checkpoint:{
        format:PNCP_NATIONAL_CHECKPOINT_FORMAT,
        planFingerprint:fingerprint,
        status:"READY",
        completed:{},
        failed:{},
        createdAt:at,
        updatedAt:at
      }
    };
  }

  return Object.freeze({
    schema:PNCP_NATIONAL_SCHEDULER_SCHEMA,

    getCheckpoint(plan){
      const {checkpoint}=checkpointFor(plan);
      return clone(checkpoint);
    },

    async runCycle({
      plan,
      discoveryRunner,
      classifier,
      ingress,
      shardIds=null,
      maxShardsPerRun=3,
      maxFailuresPerRun=1,
      maxObservationsPerShard=100,
      retryFailed=false,
      authorizePublicNetwork=false,
      confirmation=null
    }={}){
      validatePlan(plan);
      const selection=selectedShards(plan,shardIds);
      if(!discoveryRunner||typeof discoveryRunner.run!=="function"||
         typeof discoveryRunner.networkEnabled!=="boolean")
        throw new Error("ARCA_PNCP_SCHEDULER_RUNNER_INVALID");
      if(!classifier||typeof classifier.classify!=="function")
        throw new Error("ARCA_PNCP_SCHEDULER_CLASSIFIER_INVALID");
      if(!ingress||typeof ingress.ingest!=="function")
        throw new Error("ARCA_PNCP_SCHEDULER_INGRESS_INVALID");
      if(discoveryRunner.networkEnabled&&
         (authorizePublicNetwork!==true||confirmation!==PNCP_PUBLIC_NETWORK_CONFIRMATION))
        throw new Error("ARCA_PNCP_SCHEDULER_PUBLIC_NETWORK_NOT_AUTHORIZED");

      const shardBudget=positive(maxShardsPerRun,3,27,"maxShardsPerRun");
      const failureBudget=positive(maxFailuresPerRun,1,27,"maxFailuresPerRun");
      const observationBudget=positive(maxObservationsPerShard,100,1000,"maxObservationsPerShard");
      if(typeof retryFailed!=="boolean")throw new Error("ARCA_PNCP_SCHEDULER_RETRY_POLICY_INVALID");

      const {checkpoint,file,fingerprint}=checkpointFor(plan);
      checkpoint.status="RUNNING";
      checkpoint.updatedAt=instant(clock);
      atomicWrite(file,checkpoint);

      const pending=[...plan.shards]
        .sort((a,b)=>a.shardId.localeCompare(b.shardId))
        .filter(shard=>(selection===null||selection.has(shard.shardId))&&
          !checkpoint.completed[shard.shardId]&&
          (retryFailed||!checkpoint.failed[shard.shardId]))
        .slice(0,shardBudget);

      let processed=0,succeeded=0,failed=0,observations=0,created=0,awakened=0;
      for(const shard of pending){
        if(failed>=failureBudget)break;
        processed+=1;
        try{
          const discovery=await discoveryRunner.run(shard);
          if(discovery?.format!=="arca-pncp-discovery-result-v2"||
             discovery.scope?.uf!==shard.uf)
            throw Object.assign(new Error("invalid shard discovery result"),{code:"ARCA_PNCP_SCHEDULER_DISCOVERY_INVALID"});
          const classified=await classifier.classify({shard,discovery});
          if(!Array.isArray(classified)||classified.length>observationBudget)
            throw Object.assign(new Error("classification exceeded observation budget"),{code:"ARCA_PNCP_SCHEDULER_CLASSIFICATION_INVALID"});
          let shardCreated=0,shardAwakened=0;
          for(const observation of classified){
            const result=await ingress.ingest(observation);
            if(result?.created===true)shardCreated+=1;
            if(result?.awakened===true)shardAwakened+=1;
          }
          const completedAt=instant(clock);
          checkpoint.completed[shard.shardId]={
            completedAt,
            resultHash:digest(discovery),
            targetCount:Array.isArray(discovery.targets)?discovery.targets.length:0,
            observationCount:classified.length,
            createdCount:shardCreated,
            awakenedCount:shardAwakened
          };
          delete checkpoint.failed[shard.shardId];
          succeeded+=1;
          observations+=classified.length;
          created+=shardCreated;
          awakened+=shardAwakened;
        }catch(error){
          const previous=checkpoint.failed[shard.shardId];
          checkpoint.failed[shard.shardId]={
            attempts:(previous?.attempts??0)+1,
            failedAt:instant(clock),
            errorRef:errorReference(error)
          };
          failed+=1;
        }
        checkpoint.updatedAt=instant(clock);
        atomicWrite(file,checkpoint);
      }

      const completeCount=Object.keys(checkpoint.completed).length;
      const failedCount=Object.keys(checkpoint.failed).length;
      const remaining=plan.shards.length-completeCount-failedCount;
      checkpoint.status=completeCount===plan.shards.length
        ?"COMPLETED"
        :remaining===0&&failedCount>0?"ATTENTION_REQUIRED":"IN_PROGRESS";
      checkpoint.updatedAt=instant(clock);
      atomicWrite(file,checkpoint);

      return Object.freeze({
        schema:"arca.pncp-national-scheduler-cycle-result.v0.1",
        planFingerprint:fingerprint,
        status:checkpoint.status,
        processed,
        succeeded,
        failed,
        observations,
        investigationsCreated:created,
        investigationsAwakened:awakened,
        selectedShardIds:Object.freeze(selection===null?[]:[...selection].sort()),
        totals:Object.freeze({
          shards:plan.shards.length,
          completed:completeCount,
          failed:failedCount,
          remaining
        }),
        humanReviewRequired:true,
        anomalyIsNotIrregularity:true
      });
    }
  });
}
