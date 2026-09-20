#!/usr/bin/env node
import {writeFile,mkdir,rename} from "node:fs/promises";
import {join} from "node:path";
import {hostname} from "node:os";
import {createDefaultActionRegistry} from "../src/machine-bridge/action-registry.mjs";
import {FsMachineBridgeTransport} from "../src/machine-bridge/fs-transport.mjs";
import {GitHubMachineBridgeTransport} from "../src/machine-bridge/github-transport.mjs";
import {canExecuteJob,executeClaimedJob} from "../src/machine-bridge/worker-runtime.mjs";

const stateDir=process.env.ARCA_AGENT_STATE_DIR||join(process.cwd(),".arca-worker");
await mkdir(stateDir,{recursive:true});
const workerId=process.env.ARCA_WORKER_ID||`worker-${hostname().replace(/[^A-Za-z0-9._-]/g,"-")}`;
const capabilities=[...new Set((process.env.ARCA_WORKER_CAPABILITIES||"node,repository").split(",").map(x=>x.trim()).filter(Boolean))].sort();
const descriptor={format:"arca-worker-v1",workerId,capabilities,pid:process.pid,startedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString()};
const pncpNetworkEnabled=/^(1|true|yes)$/i.test(process.env.ARCA_PNCP_PUBLIC_NETWORK_ENABLED||"");
const hasPncpNetworkCapability=capabilities.includes("pncp-public-network");
if(pncpNetworkEnabled!==hasPncpNetworkCapability){
  throw new Error("PNCP network requires both ARCA_PNCP_PUBLIC_NETWORK_ENABLED=true and pncp-public-network capability");
}
let pncpNetwork=null;
if(pncpNetworkEnabled){
  const custodyHome=process.env.ARCA_PNCP_CUSTODY_HOME;
  const stagingRoot=process.env.ARCA_PNCP_STAGING_ROOT;
  if(!custodyHome||!stagingRoot)throw new Error("PNCP network requires ARCA_PNCP_CUSTODY_HOME and ARCA_PNCP_STAGING_ROOT");
  pncpNetwork={enabled:true,custodyHome,stagingRoot};
}
const registry=createDefaultActionRegistry({worker:descriptor,root:process.cwd(),pncpNetwork});
const transportKind=(process.env.ARCA_AGENT_TRANSPORT||"filesystem").trim().toLowerCase();
const queueDir=process.env.ARCA_AGENT_QUEUE_DIR||join(stateDir,"remote-jobs");
const transport=transportKind==="github"
  ? new GitHubMachineBridgeTransport({
      repository:process.env.ARCA_GITHUB_REPOSITORY||process.env.GITHUB_REPOSITORY,
      ref:process.env.ARCA_GITHUB_REF||"arca-runtime",
      token:process.env.ARCA_GITHUB_TOKEN||process.env.GITHUB_TOKEN
    })
  : new FsMachineBridgeTransport(queueDir);
await transport.init(workerId);

const heartbeatMs=Math.max(15000,Number(process.env.ARCA_AGENT_HEARTBEAT_MS)||30000);
const pollMs=Math.max(1000,Number(process.env.ARCA_AGENT_POLL_MS)||5000);
const leaseMs=Math.max(15000,Number(process.env.ARCA_AGENT_LEASE_MS)||120000);
const once=/^(1|true|yes)$/i.test(process.env.ARCA_AGENT_ONCE||"");
const maxJobs=Math.max(1,Math.min(100,Number(process.env.ARCA_AGENT_MAX_JOBS)||20));
let busy=false;
let stopping=false;

console.log(`[ARCA Agent] ${workerId} transport=${transportKind} capabilities=${capabilities.join(",")} heartbeat=${heartbeatMs}ms poll=${pollMs}ms`);
console.log(`[ARCA Agent] actions=${registry.list().map(x=>x.name).join(",")}`);

async function heartbeat(){
  descriptor.heartbeatAt=new Date().toISOString();
  const tmp=join(stateDir,"worker.json.tmp");
  await writeFile(tmp,JSON.stringify(descriptor,null,2)+"\n");
  await rename(tmp,join(stateDir,"worker.json"));
}
async function register(){if(typeof transport.registerWorker==="function")await transport.registerWorker(descriptor)}
async function processOne(){
  if(busy||stopping)return false;
  busy=true;
  try{
    const candidates=await transport.listJobs(workerId);
    for(const {job} of candidates){
      if(!canExecuteJob(job,descriptor,registry))continue;
      if(await transport.hasResult(job.jobId))continue;
      const claim=await transport.claim(job,descriptor,{leaseMs});
      if(!claim)continue;
      let renewalFailed=false;
      const renewEvery=Math.max(5000,Math.floor(leaseMs/3));
      const renewTimer=setInterval(()=>transport.renew(job.jobId,workerId,{leaseMs}).catch(error=>{renewalFailed=true;console.error(`[ARCA Agent] lease renewal ${job.jobId}:`,error.message)}),renewEvery);
      try{
        const result=await executeClaimedJob({job,worker:descriptor,claim,registry});
        if(renewalFailed){console.error(`[ARCA Agent] result withheld after lease renewal failure: ${job.jobId}`);return false}
        const stored=await transport.writeResult(result);
        console.log(`[ARCA Agent] ${result.status} ${job.jobId} stored=${stored}`);
      }finally{clearInterval(renewTimer)}
      return true;
    }
    return false;
  }finally{busy=false}
}

await heartbeat();
await register();
if(once){
  let completed=0;
  while(completed<maxJobs&&await processOne())completed+=1;
  console.log(`[ARCA Agent] one-shot complete jobs=${completed}`);
  process.exit(0);
}
const heartbeatTimer=setInterval(()=>heartbeat().catch(e=>console.error("[ARCA Agent] heartbeat:",e.message)),heartbeatMs);
const pollTimer=setInterval(()=>processOne().catch(e=>console.error("[ARCA Agent] poll:",e.message)),pollMs);
await processOne();
function stop(){stopping=true;clearInterval(heartbeatTimer);clearInterval(pollTimer);if(!busy)process.exit(0);setTimeout(()=>process.exit(0),2000).unref()}
process.on("SIGTERM",stop);
process.on("SIGINT",stop);
await new Promise(()=>{});
