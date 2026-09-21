import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BRAZIL_UF_CODES,
  buildPncpNationalWatchPlan,
  createPncpNationalInvestigationIngress,
  PNCP_WATCH_OBSERVATION_SCHEMA
} from "../src/machine-bridge/pncp-national-watcher.mjs";
import {
  createPncpNationalScheduler,
  PNCP_PUBLIC_NETWORK_CONFIRMATION
} from "../src/machine-bridge/pncp-national-scheduler.mjs";
import {createInvestigationAutonomyRuntime} from "../src/machine-bridge/investigation-event-runtime.mjs";

const baseRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-scheduler-"));
const clock=()=>new Date("2026-09-21T01:00:00.000Z");
const plan=()=>buildPncpNationalWatchPlan({
  dataInicial:"20260901",dataFinal:"20260902",modalidadeIds:[6]
});
const discovery=shard=>({
  format:"arca-pncp-discovery-result-v2",
  investigationId:`INV-PNCP-${shard.uf}`,
  scope:{uf:shard.uf,dataInicial:"20260901",dataFinal:"20260902"},
  targets:[{procurementControlNumber:`fixture-${shard.uf}`}]
});
const offlineRunner=(calls=[],failUf=null)=>({
  networkEnabled:false,
  async run(shard){
    calls.push(shard.uf);
    if(shard.uf===failUf)throw new Error("sensitive source locator must not persist");
    return discovery(shard);
  }
});
const emptyClassifier={async classify(){return []}};
const emptyIngress={async ingest(){throw new Error("must not ingest")}};

test("UF constants and scheduler execution order are lexicographic",async()=>{
  assert.deepEqual([...BRAZIL_UF_CODES],[...BRAZIL_UF_CODES].sort());
  const calls=[];
  const scheduler=createPncpNationalScheduler({root:baseRoot(),clock});
  const result=await scheduler.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(calls),classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:3
  });
  assert.deepEqual(calls,[...BRAZIL_UF_CODES].sort().slice(0,3));
  assert.equal(result.processed,3);
  assert.equal(result.succeeded,3);
  assert.equal(result.totals.completed,3);
  assert.equal(result.totals.remaining,24);
  assert.deepEqual(result.selectedShardIds,[]);
});

test("explicit shard selection runs only requested UFs without changing national plan",async()=>{
  const calls=[];
  const scheduler=createPncpNationalScheduler({root:baseRoot(),clock});
  const result=await scheduler.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(calls),classifier:emptyClassifier,
    ingress:emptyIngress,shardIds:["BR-UF-SP"],maxShardsPerRun:1
  });
  assert.deepEqual(calls,["SP"]);
  assert.deepEqual(result.selectedShardIds,["BR-UF-SP"]);
  assert.equal(result.processed,1);
  assert.equal(result.succeeded,1);
  assert.equal(result.status,"IN_PROGRESS");
  const checkpoint=scheduler.getCheckpoint(plan());
  assert.deepEqual(Object.keys(checkpoint.completed),["BR-UF-SP"]);
});

test("invalid or duplicate shard selection fails before discovery",async()=>{
  const calls=[];
  const scheduler=createPncpNationalScheduler({root:baseRoot(),clock});
  const input={
    plan:plan(),discoveryRunner:offlineRunner(calls),classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:1
  };
  await assert.rejects(()=>scheduler.runCycle({...input,shardIds:["BR-UF-ZZ"]}),/SELECTION_INVALID/);
  await assert.rejects(()=>scheduler.runCycle({...input,shardIds:["BR-UF-SP","BR-UF-SP"]}),/SELECTION_INVALID/);
  assert.deepEqual(calls,[]);
});

test("checkpoint survives restart and completed shards are not repeated",async()=>{
  const root=baseRoot(),calls=[];
  const first=createPncpNationalScheduler({root,clock});
  await first.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(calls),classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:2
  });
  const restarted=createPncpNationalScheduler({root,clock});
  await restarted.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(calls),classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:2
  });
  assert.deepEqual(calls,[...BRAZIL_UF_CODES].sort().slice(0,4));
  assert.equal(restarted.getCheckpoint(plan()).status,"IN_PROGRESS");
  assert.equal(Object.keys(restarted.getCheckpoint(plan()).completed).length,4);
});

test("failed shard is checkpointed without raw error and needs explicit retry",async()=>{
  const root=baseRoot(),calls=[];
  const firstUf=[...BRAZIL_UF_CODES].sort()[0];
  const scheduler=createPncpNationalScheduler({root,clock});
  const failed=await scheduler.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(calls,firstUf),classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:2,maxFailuresPerRun:1
  });
  assert.equal(failed.failed,1);
  assert.deepEqual(calls,[firstUf]);
  const serialized=JSON.stringify(scheduler.getCheckpoint(plan()));
  assert.equal(serialized.includes("sensitive source locator"),false);
  assert.match(scheduler.getCheckpoint(plan()).failed[`BR-UF-${firstUf}`].errorRef,/^sha256:/);

  await scheduler.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(calls),classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:1
  });
  assert.equal(calls.filter(uf=>uf===firstUf).length,1);

  await scheduler.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(calls),classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:1,retryFailed:true
  });
  assert.equal(calls.filter(uf=>uf===firstUf).length,2);
});



test("nested transport cause code is preserved without raw fetch error text",async()=>{
  const root=baseRoot();
  const firstUf=[...BRAZIL_UF_CODES].sort()[0];
  const runner={
    networkEnabled:false,
    async run(){
      const error=new TypeError("fetch failed");
      error.cause={code:"UND_ERR_SOCKET",message:"private low-level socket detail"};
      throw error;
    }
  };
  const scheduler=createPncpNationalScheduler({root,clock});
  const result=await scheduler.runCycle({
    plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:1,maxFailuresPerRun:1
  });
  assert.equal(result.failed,1);
  const failure=scheduler.getCheckpoint(plan()).failed[`BR-UF-${firstUf}`];
  assert.equal(failure.errorRef,"code:UND_ERR_SOCKET");
  const serialized=JSON.stringify(scheduler.getCheckpoint(plan()));
  assert.equal(serialized.includes("fetch failed"),false);
  assert.equal(serialized.includes("private low-level socket detail"),false);
});



test("source-unavailable shards become bounded observer outcomes and later shards continue",async()=>{
  const root=baseRoot();
  const calls=[];
  const ordered=[...BRAZIL_UF_CODES].sort();
  const unavailableSet=new Set(ordered.slice(0,2));
  const runner={
    networkEnabled:false,
    async run(shard){
      calls.push(shard.uf);
      if(unavailableSet.has(shard.uf)){
        const error=new Error("ARCA_PNCP_SOURCE_UNAVAILABLE");
        error.code="ARCA_PNCP_SOURCE_UNAVAILABLE";
        error.sourceFailureRef="code:UND_ERR_SOCKET";
        throw error;
      }
      return discovery(shard);
    }
  };
  const scheduler=createPncpNationalScheduler({root,clock});
  const first=await scheduler.runCycle({
    plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,ingress:emptyIngress,
    maxShardsPerRun:3,maxFailuresPerRun:1,maxUnavailablePerRun:3,
    continueOnSourceUnavailable:true
  });
  assert.deepEqual(calls,ordered.slice(0,3));
  assert.equal(first.processed,3);
  assert.equal(first.succeeded,1);
  assert.equal(first.failed,0);
  assert.equal(first.unavailable,2);
  assert.equal(first.totals.completed,1);
  assert.equal(first.totals.unavailable,2);
  const checkpoint=scheduler.getCheckpoint(plan());
  for(const uf of ordered.slice(0,2)){
    const item=checkpoint.unavailable[`BR-UF-${uf}`];
    assert.equal(item.category,"SOURCE_UNAVAILABLE");
    assert.equal(item.errorRef,"code:UND_ERR_SOCKET");
    assert.equal(item.humanReviewRequired,true);
    assert.equal(item.anomalyIsNotIrregularity,true);
  }
  assert.equal(JSON.stringify(checkpoint).includes("ARCA_PNCP_SOURCE_UNAVAILABLE"),false);

  const before=calls.length;
  await scheduler.runCycle({
    plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,ingress:emptyIngress,
    maxShardsPerRun:1,maxUnavailablePerRun:1,continueOnSourceUnavailable:true
  });
  assert.equal(calls.length,before+1);
  assert.equal(calls.at(-1),ordered[3]);
});

test("source-unavailable retry is explicit and success clears availability gap",async()=>{
  const root=baseRoot();
  const firstUf=[...BRAZIL_UF_CODES].sort()[0];
  let unavailable=true;
  const calls=[];
  const runner={
    networkEnabled:false,
    async run(shard){
      calls.push(shard.uf);
      if(shard.uf===firstUf&&unavailable){
        const error=new Error("ARCA_PNCP_SOURCE_UNAVAILABLE");
        error.code="ARCA_PNCP_SOURCE_UNAVAILABLE";
        error.sourceFailureRef="sha256:"+"a".repeat(64);
        throw error;
      }
      return discovery(shard);
    }
  };
  const scheduler=createPncpNationalScheduler({root,clock});
  await scheduler.runCycle({
    plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,ingress:emptyIngress,
    shardIds:[`BR-UF-${firstUf}`],maxShardsPerRun:1,maxUnavailablePerRun:1,
    continueOnSourceUnavailable:true
  });
  assert.ok(scheduler.getCheckpoint(plan()).unavailable[`BR-UF-${firstUf}`]);

  unavailable=false;
  const skipped=await scheduler.runCycle({
    plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,ingress:emptyIngress,
    shardIds:[`BR-UF-${firstUf}`],maxShardsPerRun:1,maxUnavailablePerRun:1,
    continueOnSourceUnavailable:true
  });
  assert.equal(skipped.processed,0);

  const retried=await scheduler.runCycle({
    plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,ingress:emptyIngress,
    shardIds:[`BR-UF-${firstUf}`],maxShardsPerRun:1,maxUnavailablePerRun:1,
    continueOnSourceUnavailable:true,retryUnavailable:true
  });
  assert.equal(retried.succeeded,1);
  const checkpoint=scheduler.getCheckpoint(plan());
  assert.equal(checkpoint.unavailable[`BR-UF-${firstUf}`],undefined);
  assert.ok(checkpoint.completed[`BR-UF-${firstUf}`]);
});

test("hard internal failures remain failed even when availability continuation is enabled",async()=>{
  const root=baseRoot();
  const firstUf=[...BRAZIL_UF_CODES].sort()[0];
  const scheduler=createPncpNationalScheduler({root,clock});
  const result=await scheduler.runCycle({
    plan:plan(),
    discoveryRunner:{
      networkEnabled:false,
      async run(){throw Object.assign(new Error("invalid internal state"),{code:"ARCA_INTERNAL_TEST_FAILURE"})}
    },
    classifier:emptyClassifier,ingress:emptyIngress,maxShardsPerRun:3,maxFailuresPerRun:1,
    maxUnavailablePerRun:3,continueOnSourceUnavailable:true
  });
  assert.equal(result.processed,1);
  assert.equal(result.failed,1);
  assert.equal(result.unavailable,0);
  assert.equal(scheduler.getCheckpoint(plan()).failed[`BR-UF-${firstUf}`].errorRef,"code:ARCA_INTERNAL_TEST_FAILURE");
});

test("a full cycle can complete with availability gaps without calling them irregularities",async()=>{
  const root=baseRoot();
  const scheduler=createPncpNationalScheduler({root,clock});
  const runner={
    networkEnabled:false,
    async run(shard){
      if(shard.uf==="TO")return discovery(shard);
      const error=new Error("ARCA_PNCP_SOURCE_UNAVAILABLE");
      error.code="ARCA_PNCP_SOURCE_UNAVAILABLE";
      error.sourceFailureRef="code:ETIMEDOUT";
      throw error;
    }
  };
  const result=await scheduler.runCycle({
    plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,ingress:emptyIngress,
    maxShardsPerRun:27,maxFailuresPerRun:1,maxUnavailablePerRun:27,
    continueOnSourceUnavailable:true
  });
  assert.equal(result.status,"COMPLETED_WITH_AVAILABILITY_GAPS");
  assert.equal(result.failed,0);
  assert.equal(result.unavailable,26);
  assert.equal(result.succeeded,1);
  assert.equal(result.totals.remaining,0);
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.anomalyIsNotIrregularity,true);
});

test("network-enabled runner requires exact explicit authorization",async()=>{
  const runner={...offlineRunner(),networkEnabled:true};
  const scheduler=createPncpNationalScheduler({root:baseRoot(),clock});
  const input={plan:plan(),discoveryRunner:runner,classifier:emptyClassifier,ingress:emptyIngress,maxShardsPerRun:1};
  await assert.rejects(()=>scheduler.runCycle(input),/PUBLIC_NETWORK_NOT_AUTHORIZED/);
  await assert.rejects(()=>scheduler.runCycle({...input,authorizePublicNetwork:true,confirmation:"WRONG"}),/PUBLIC_NETWORK_NOT_AUTHORIZED/);
  const accepted=await scheduler.runCycle({
    ...input,authorizePublicNetwork:true,confirmation:PNCP_PUBLIC_NETWORK_CONFIRMATION
  });
  assert.equal(accepted.succeeded,1);
});

test("scheduler routes classified observations through the shared runtime",async()=>{
  const root=baseRoot(),received=[];
  const runtime=createInvestigationAutonomyRuntime({
    queueRoot:path.join(root,"queue"),eventRoot:path.join(root,"events"),clock,
    backend:{async acceptWork(work){received.push(work);return {accepted:true}}}
  });
  const ingress=createPncpNationalInvestigationIngress({investigationRuntime:runtime});
  const classifier={async classify({shard}){
    return [{
      schema:PNCP_WATCH_OBSERVATION_SCHEMA,
      category:"POTENTIAL_INTEGRITY_RELEVANCE",
      recordRef:`pncp:fixture-${shard.uf}`,
      jurisdictionRef:`BR/UF/${shard.uf}`,
      sourceRef:`https://pncp.gov.br/app/editais/fixture-${shard.uf}`,
      observedAt:"2026-09-21T00:30:00.000Z",
      humanReviewRequired:true,
      anomalyIsNotIrregularity:true
    }];
  }};
  const scheduler=createPncpNationalScheduler({root:path.join(root,"scheduler"),clock});
  const result=await scheduler.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(),classifier,ingress,maxShardsPerRun:2
  });
  assert.equal(result.investigationsCreated,2);
  assert.equal(result.investigationsAwakened,2);
  assert.equal(runtime.list().length,2);
  assert.equal(received.length,2);
  assert.equal(JSON.stringify(received).includes("pncp.gov.br"),false);
});

test("cross-shard results and observation-budget overflow fail closed",async()=>{
  const firstUf=[...BRAZIL_UF_CODES].sort()[0];
  const wrongRunner={
    networkEnabled:false,
    async run(shard){return {...discovery(shard),scope:{...discovery(shard).scope,uf:"ZZ"}}}
  };
  const scheduler=createPncpNationalScheduler({root:baseRoot(),clock});
  const wrong=await scheduler.runCycle({
    plan:plan(),discoveryRunner:wrongRunner,classifier:emptyClassifier,
    ingress:emptyIngress,maxShardsPerRun:1
  });
  assert.equal(wrong.failed,1);
  assert.match(scheduler.getCheckpoint(plan()).failed[`BR-UF-${firstUf}`].errorRef,/DISCOVERY_INVALID/);

  const excessive=createPncpNationalScheduler({root:baseRoot(),clock});
  const overflow=await excessive.runCycle({
    plan:plan(),discoveryRunner:offlineRunner(),
    classifier:{async classify(){return [{},{}]}},
    ingress:emptyIngress,maxShardsPerRun:1,maxObservationsPerShard:1
  });
  assert.equal(overflow.failed,1);
});
