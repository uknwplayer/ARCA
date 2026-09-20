#!/usr/bin/env node
import {randomUUID} from "node:crypto";
import {GitHubMachineBridgeTransport} from "../src/machine-bridge/github-transport.mjs";
import {MachineBridgeRemoteClient} from "../src/machine-bridge/remote-client.mjs";
import {assertMachineBridgeJobV3} from "../src/machine-bridge/protocol-v3.mjs";

function parse(argv){
  const out={};
  for(let i=0;i<argv.length;i+=1){
    const token=argv[i];if(!token.startsWith("--"))continue;
    const [raw,keyValue]=[token.slice(2),token.slice(2).split("=",2)];
    if(raw.includes("=")){out[keyValue[0]]=keyValue[1];continue}
    const next=argv[i+1];if(next&&!next.startsWith("--")){out[raw]=next;i+=1}else out[raw]=true;
  }
  return out;
}

const args=parse(process.argv.slice(2));
if(args.help){
  console.log("Usage: ARCA_GITHUB_TOKEN=... npm run remote:call -- --repo owner/repo --action worker.ping [--job-id id] [--request-id id] [--queue shared] [--requires node,repository] [--params '{\"echo\":\"hello\"}'] [--timeout 120000] [--wait-timeout 180000] [--poll 1000] [--worker worker-id] [--ref arca-runtime]");
  process.exit(0);
}

const repository=args.repo||process.env.ARCA_GITHUB_REPOSITORY||process.env.GITHUB_REPOSITORY;
const ref=args.ref||process.env.ARCA_GITHUB_REF||"arca-runtime";
const token=process.env.ARCA_GITHUB_TOKEN||process.env.GITHUB_TOKEN;
const action=args.action;
if(!repository)throw new Error("--repo or ARCA_GITHUB_REPOSITORY is required");
if(!action)throw new Error("--action is required");
if(!token)throw new Error("ARCA_GITHUB_TOKEN or GITHUB_TOKEN is required");

const jobId=args["job-id"]||`job-${Date.now()}-${randomUUID().slice(0,8)}`;
const requestId=args["request-id"]||`req-${randomUUID()}`;
const requires=String(args.requires||"").split(",").map(x=>x.trim()).filter(Boolean);
let params={};if(args.params){params=JSON.parse(args.params);if(!params||typeof params!=="object"||Array.isArray(params))throw new Error("--params must be a JSON object")}
const job={format:"arca-remote-job-v3",protocolVersion:3,jobId,requestId,action,requires,params};
if(args.worker)job.workerTarget=args.worker;
if(args.timeout!==undefined)job.timeoutMs=Number(args.timeout);
assertMachineBridgeJobV3(job);

const queue=String(args.queue||job.workerTarget||"shared");
const waitTimeoutMs=args["wait-timeout"]===undefined?180000:Number(args["wait-timeout"]);
const pollIntervalMs=args.poll===undefined?1000:Number(args.poll);
const transport=new GitHubMachineBridgeTransport({repository,ref,token});
const client=new MachineBridgeRemoteClient({transport});
const result=await client.call(job,{queue,notify:true,waitTimeoutMs,pollIntervalMs});
console.log(JSON.stringify({ok:result.status==="completed",repository,ref,queue,jobId,requestId,action,result},null,2));
if(result.status!=="completed")process.exitCode=1;
