#!/usr/bin/env node
import {GitHubMachineBridgeTransport} from "../src/machine-bridge/github-transport.mjs";
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
  console.log("Usage: ARCA_GITHUB_TOKEN=... npm run remote:submit -- --repo owner/repo --action worker.ping [--job-id id] [--request-id id] [--queue shared] [--requires node,repository] [--params '{\"echo\":\"hello\"}'] [--timeout 120000] [--worker worker-id] [--ref arca-runtime]");
  process.exit(0);
}

const repository=args.repo||process.env.ARCA_GITHUB_REPOSITORY||process.env.GITHUB_REPOSITORY;
const ref=args.ref||process.env.ARCA_GITHUB_REF||"arca-runtime";
const token=process.env.ARCA_GITHUB_TOKEN||process.env.GITHUB_TOKEN;
const action=args.action;
if(!repository)throw new Error("--repo or ARCA_GITHUB_REPOSITORY is required");
if(!action)throw new Error("--action is required");
if(!token)throw new Error("ARCA_GITHUB_TOKEN or GITHUB_TOKEN is required");
const jobId=args["job-id"]||`job-${Date.now()}`;
const requires=String(args.requires||"").split(",").map(x=>x.trim()).filter(Boolean);
let params={};if(args.params){params=JSON.parse(args.params);if(!params||typeof params!=="object"||Array.isArray(params))throw new Error("--params must be a JSON object")}
const job={format:"arca-remote-job-v3",protocolVersion:3,jobId,action,requires,params};
if(args["request-id"])job.requestId=args["request-id"];
if(args.worker)job.workerTarget=args.worker;
if(args.timeout!==undefined)job.timeoutMs=Number(args.timeout);
assertMachineBridgeJobV3(job);
const transport=new GitHubMachineBridgeTransport({repository,ref,token});
const queue=String(args.queue||job.workerTarget||"shared");
const stored=await transport.enqueue(job,{queue,notify:true});
if(!stored)throw new Error(`job already exists: ${jobId}`);
console.log(JSON.stringify({ok:true,repository,ref,queue,jobId,requestId:job.requestId??null,action,requires},null,2));
