#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {ExecutionEndpointRegistry,wakeExecutionEndpointForJob} from "../src/machine-bridge/execution-endpoint.mjs";
import {createChatGPTWorkGitHubTriggerEndpoint} from "../src/machine-bridge/work-github-trigger-endpoint.mjs";

function help(){process.stdout.write(`ARCA ChatGPT Work Execution Endpoint V0.1\n\nUsage:\n  npm run work:endpoint -- heartbeat\n  npm run work:endpoint -- wake --job ./job.json\n  npm run work:endpoint -- ack --wake-id <sha256> [--commit-sha <sha>]\n  npm run work:endpoint -- result --job-id <job-id> [--request-id <request-id>]\n\nEnvironment:\n  ARCA_GITHUB_TOKEN          required; never store in repository\n  ARCA_GITHUB_REPOSITORY     owner/name\n  ARCA_WORK_WAKE_REF         non-canonical PR head branch\n  ARCA_WORK_WAKE_PR          open pull-request number watched by Work\n  ARCA_WORK_WAKE_PATH        default experiments/work-wakeup/PROBE.md\n  ARCA_WORK_ENDPOINT_ID      default chatgpt-work\n  ARCA_WORK_CAPABILITIES     comma-separated public capability names\n\nThe command does not use GitHub Actions. Wake writes only correlation metadata to the isolated PR stimulus file.\n`)}
function valueOf(args,name){const i=args.indexOf(name);return i>=0?args[i+1]:null}
function requiredEnv(name){const value=String(process.env[name]??"").trim();if(!value)throw new Error(`${name} is required`);return value}

const args=process.argv.slice(2);
if(args.length===0||args.includes("--help")||args.includes("-h")){help();process.exit(0)}
const mode=args[0];
if(!["heartbeat","wake","ack","result"].includes(mode))throw new Error("mode must be heartbeat, wake, ack, or result");
const endpointId=String(process.env.ARCA_WORK_ENDPOINT_ID??"chatgpt-work").trim();
const capabilities=[...new Set(String(process.env.ARCA_WORK_CAPABILITIES??"reasoning").split(",").map(x=>x.trim()).filter(Boolean))];
const endpoint=createChatGPTWorkGitHubTriggerEndpoint({
  endpointId,
  capabilities,
  repository:requiredEnv("ARCA_GITHUB_REPOSITORY"),
  ref:requiredEnv("ARCA_WORK_WAKE_REF"),
  pullRequestNumber:Number(requiredEnv("ARCA_WORK_WAKE_PR")),
  stimulusPath:String(process.env.ARCA_WORK_WAKE_PATH??"experiments/work-wakeup/PROBE.md").trim(),
  token:requiredEnv("ARCA_GITHUB_TOKEN")
});
const registry=new ExecutionEndpointRegistry();
registry.register(endpoint.descriptor,endpoint.adapter);
let result;
if(mode==="heartbeat")result=await registry.heartbeat(endpointId);
if(mode==="wake"){
  const jobPath=valueOf(args,"--job");if(!jobPath)throw new Error("--job is required for wake");
  const job=JSON.parse(await readFile(resolve(jobPath),"utf8"));
  const eventId=valueOf(args,"--event-id");
  result=await wakeExecutionEndpointForJob({registry,endpointId,job,eventId:eventId||null});
}
if(mode==="ack"){
  const wakeId=valueOf(args,"--wake-id");if(!wakeId)throw new Error("--wake-id is required for ack");
  result=await registry.ack(endpointId,{wakeId,commitSha:valueOf(args,"--commit-sha")});
}
if(mode==="result"){
  const jobId=valueOf(args,"--job-id");if(!jobId)throw new Error("--job-id is required for result");
  result=await registry.result(endpointId,{jobId,requestId:valueOf(args,"--request-id")});
}
process.stdout.write(JSON.stringify(result,null,2)+"\n");
