#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import process from "node:process";
import {
  TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  TERMUX_V41_DEFAULT_CHANNEL_REPO,
  makeGhChannelClient
} from "../src/machine-bridge/vince-v4-1-termux-worker.mjs";
import {routeTermuxV5Candidates} from "../src/machine-bridge/vince-v5-termux-presence.mjs";
import {
  proveV5SelectedV411ReplayRejected,
  publishV5SelectedV411Dispatch,
  runV5SelectedV411OneShot,
  verifyConsumeV5SelectedV411
} from "../src/machine-bridge/vince-v5-v411-selected-execution.mjs";

function value(args,name,fallback=null){
  const i=args.indexOf(name);
  if(i<0)return fallback;
  if(i===args.length-1)throw new Error(`missing value for ${name}`);
  return args[i+1];
}
function required(args,name){
  const out=value(args,name,null);
  if(!out)throw new Error(`${name} is required`);
  return out;
}
async function json(path){return JSON.parse(await readFile(path,"utf8"))}
function ttl(args){
  const minutes=Number(value(args,"--expires-minutes","15"));
  if(!Number.isSafeInteger(minutes)||minutes<5||minutes>60)
    throw new Error("--expires-minutes must be an integer from 5 to 60");
  return minutes*60_000;
}

const args=process.argv.slice(2);
const command=args[0];
if(!command||args.includes("--help")||args.includes("-h")){
  console.log([
    "ARCA Vince V5 -> V4.1.1 Selected One-Shot",
    "",
    "Commands:",
    "  prepare --job-id ID --pin-a FILE --presence-a REMOTE --pin-b FILE --presence-b REMOTE [--expires-minutes 15]",
    "  once-selected --job-id ID --pin FILE --identity-dir DIR [--repo-path DIR]",
    "  verify-consume --job-id ID --pin FILE",
    "  replay-check --job-id ID",
    "",
    "Optional:",
    "  --channel-repo OWNER/REPO",
    "  --channel-branch BRANCH",
    "",
    "Operational executor: Termux only. Work/Replit are not used. GitHub Actions is not required."
  ].join("\n"));
  process.exit(0);
}

const channelRepository=value(args,"--channel-repo",TERMUX_V41_DEFAULT_CHANNEL_REPO);
const channelBranch=value(args,"--channel-branch",TERMUX_V41_DEFAULT_CHANNEL_BRANCH);
const client=makeGhChannelClient();

if(command==="prepare"){
  const pinA=await json(required(args,"--pin-a"));
  const pinB=await json(required(args,"--pin-b"));
  const presencePathA=required(args,"--presence-a");
  const presencePathB=required(args,"--presence-b");
  const [presenceA,presenceB]=await Promise.all([
    client.readJson({repository:channelRepository,branch:channelBranch,path:presencePathA}),
    client.readJson({repository:channelRepository,branch:channelBranch,path:presencePathB})
  ]);
  const now=new Date();
  const routeProof=routeTermuxV5Candidates({
    pins:[pinA,pinB],
    presences:[presenceA,presenceB],
    now:now.toISOString()
  });
  const result=await publishV5SelectedV411Dispatch({
    routeProof,
    pins:[pinA,pinB],
    presencePaths:[presencePathA,presencePathB],
    jobId:required(args,"--job-id"),
    expiresAt:new Date(now.getTime()+ttl(args)).toISOString(),
    channelRepository,
    channelBranch,
    channelClient:client,
    clock:()=>now
  });
  console.log(JSON.stringify({
    ...result,
    route:{
      state:routeProof.route.state,
      candidateCount:routeProof.route.candidateCount,
      eligibleCount:routeProof.route.eligibleCount,
      selectedEndpointId:routeProof.route.selectedEndpointId
    }
  },null,2));
  process.exit(0);
}

if(command==="once-selected"){
  const result=await runV5SelectedV411OneShot({
    jobId:required(args,"--job-id"),
    pin:await json(required(args,"--pin")),
    identityDirectory:required(args,"--identity-dir"),
    repoPath:value(args,"--repo-path",process.cwd()),
    channelRepository,
    channelBranch,
    channelClient:client
  });
  console.log(JSON.stringify(result,null,2));
  process.exit(0);
}

if(command==="verify-consume"){
  const result=await verifyConsumeV5SelectedV411({
    jobId:required(args,"--job-id"),
    pin:await json(required(args,"--pin")),
    channelRepository,
    channelBranch,
    channelClient:client
  });
  console.log(JSON.stringify({
    status:result.status,
    acceptedPath:result.acceptedPath,
    acceptance:result.acceptance
  },null,2));
  process.exit(0);
}

if(command==="replay-check"){
  const result=await proveV5SelectedV411ReplayRejected({
    jobId:required(args,"--job-id"),
    channelRepository,
    channelBranch,
    channelClient:client
  });
  console.log(JSON.stringify(result,null,2));
  process.exit(0);
}

throw new Error(`unknown command: ${command}`);
