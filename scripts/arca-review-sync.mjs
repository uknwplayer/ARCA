#!/usr/bin/env node
import {join} from "node:path";
import {HumanReviewQueue,syncMachineBridgeReviews} from "../packages/agent/src/index.ts";
import {FsMachineBridgeTransport} from "../src/machine-bridge/fs-transport.mjs";
import {GitHubMachineBridgeTransport} from "../src/machine-bridge/github-transport.mjs";

const home=process.env.ARCA_REVIEW_HOME||process.env.ARCA_HOME||join(process.cwd(),".arca");
const transportKind=(process.env.ARCA_REVIEW_SYNC_TRANSPORT||process.env.ARCA_AGENT_TRANSPORT||"filesystem").trim().toLowerCase();
const queueDir=process.env.ARCA_AGENT_QUEUE_DIR||join(process.cwd(),".arca-worker","remote-jobs");
const once=!/^(0|false|no)$/i.test(process.env.ARCA_REVIEW_SYNC_ONCE||"1");
const pollMs=Math.max(1000,Number(process.env.ARCA_REVIEW_SYNC_INTERVAL_MS)||10000);

const transport=transportKind==="github"
  ? new GitHubMachineBridgeTransport({
      repository:process.env.ARCA_GITHUB_REPOSITORY||process.env.GITHUB_REPOSITORY,
      ref:process.env.ARCA_GITHUB_REF||"arca-runtime",
      token:process.env.ARCA_GITHUB_TOKEN||process.env.GITHUB_TOKEN
    })
  : transportKind==="filesystem"
    ? new FsMachineBridgeTransport(queueDir)
    : null;

if(!transport)throw new Error(`unsupported review sync transport: ${transportKind}`);
const queue=new HumanReviewQueue(home);
await queue.init();

async function cycle(){
  const summary=await syncMachineBridgeReviews({transport,queue});
  process.stdout.write(`${JSON.stringify({...summary,transport:transportKind,at:new Date().toISOString()})}\n`);
  return summary;
}

if(once){
  await cycle();
  process.exit(0);
}

let running=false;
let stopping=false;
async function guardedCycle(){
  if(running||stopping)return;
  running=true;
  try{await cycle()}catch(error){console.error(`[ARCA Review Sync] ${String(error?.message||error)}`)}finally{running=false}
}

console.log(`[ARCA Review Sync] transport=${transportKind} interval=${pollMs}ms home=${home}`);
await guardedCycle();
const timer=setInterval(guardedCycle,pollMs);
function stop(){stopping=true;clearInterval(timer);if(!running)process.exit(0);setTimeout(()=>process.exit(0),2000).unref()}
process.on("SIGTERM",stop);
process.on("SIGINT",stop);
await new Promise(()=>{});
