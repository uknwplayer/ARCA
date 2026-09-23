#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import process from "node:process";
import {
  TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  TERMUX_V41_DEFAULT_CHANNEL_REPO,
  makeGhChannelClient
} from "../src/machine-bridge/vince-v4-1-termux-worker.mjs";
import {
  publishTermuxV5Presence,
  routeTermuxV5Candidates
} from "../src/machine-bridge/vince-v5-termux-presence.mjs";

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

const args=process.argv.slice(2);
const command=args[0];
if(!command||args.includes("--help")||args.includes("-h")){
  console.log([
    "ARCA Vince V5 Termux A/B",
    "",
    "Commands:",
    "  announce-ready --identity-dir DIR [--ttl-ms 300000]",
    "  withdraw      --identity-dir DIR [--ttl-ms 300000]",
    "  route --pin-a FILE --presence-a REMOTE_PATH --pin-b FILE --presence-b REMOTE_PATH",
    "",
    "Optional:",
    "  --channel-repo OWNER/REPO",
    "  --channel-branch BRANCH",
    "",
    "No daemon, Work, Replit or GitHub Actions executor is required."
  ].join("\n"));
  process.exit(0);
}

const channelRepository=value(args,"--channel-repo",TERMUX_V41_DEFAULT_CHANNEL_REPO);
const channelBranch=value(args,"--channel-branch",TERMUX_V41_DEFAULT_CHANNEL_BRANCH);

if(command==="announce-ready"||command==="withdraw"){
  const result=await publishTermuxV5Presence({
    identityDirectory:required(args,"--identity-dir"),
    state:command==="announce-ready"?"READY":"WITHDRAWN",
    ttl:Number(value(args,"--ttl-ms","300000")),
    channelRepository,
    channelBranch
  });
  console.log(JSON.stringify(result,null,2));
  process.exit(0);
}

if(command==="route"){
  const pinA=await json(required(args,"--pin-a"));
  const pinB=await json(required(args,"--pin-b"));
  const client=makeGhChannelClient();
  const presenceA=await client.readJson({
    repository:channelRepository,
    branch:channelBranch,
    path:required(args,"--presence-a")
  });
  const presenceB=await client.readJson({
    repository:channelRepository,
    branch:channelBranch,
    path:required(args,"--presence-b")
  });
  const proof=routeTermuxV5Candidates({
    pins:[pinA,pinB],
    presences:[presenceA,presenceB],
    now:new Date().toISOString()
  });
  console.log(JSON.stringify(proof,null,2));
  process.exit(0);
}

throw new Error(`unknown command: ${command}`);
