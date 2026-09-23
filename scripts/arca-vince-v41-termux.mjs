#!/usr/bin/env node
import process from "node:process";
import {
  TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  TERMUX_V41_DEFAULT_CHANNEL_REPO,
  TERMUX_V41_DEFAULT_IDENTITY_DIR,
  initTermuxV41Identity,
  loadTermuxV41Identity,
  runTermuxV41OneShot
} from "../src/machine-bridge/vince-v4-1-termux-worker.mjs";

function value(args,name,fallback){
  const i=args.indexOf(name);
  if(i<0)return fallback;
  if(i===args.length-1)throw new Error(`missing value for ${name}`);
  return args[i+1];
}
function has(args,name){return args.includes(name)}
function usage(){
  console.log([
    "ARCA Vince V4.1 Termux Worker (one-shot only)",
    "",
    "Commands:",
    "  doctor",
    "  init-identity [--node-id ID] [--identity-dir DIR]",
    "  show-identity [--identity-dir DIR]",
    "  once --job-id ID [--repo-path DIR] [--identity-dir DIR]",
    "       [--channel-repo OWNER/REPO] [--channel-branch BRANCH]",
    "",
    "No daemon/service mode exists."
  ].join("\n"));
}

async function doctor(){
  const {spawnSync}=await import("node:child_process");
  const checks=[
    ["node",["--version"]],
    ["git",["--version"]],
    ["gh",["--version"]],
    ["gh",["auth","status","--hostname","github.com"]]
  ];
  const results=[];
  for(const [command,args] of checks){
    const out=spawnSync(command,args,{encoding:"utf8",shell:false,timeout:15_000});
    results.push({
      command:[command,...args].join(" "),
      ok:!out.error&&out.status===0,
      detail:String(out.stdout||out.stderr||out.error?.message||"").trim().slice(0,500)
    });
  }
  console.log(JSON.stringify({worker:"vince-v4.1-termux",mode:"doctor",results},null,2));
  return results.every(x=>x.ok)?0:2;
}

async function main(){
  const args=process.argv.slice(2);
  const command=args[0];
  if(!command||has(args,"--help")||has(args,"-h")){
    usage();
    return 0;
  }

  if(command==="doctor")return doctor();

  const identityDirectory=value(args,"--identity-dir",TERMUX_V41_DEFAULT_IDENTITY_DIR);

  if(command==="init-identity"){
    const nodeId=value(args,"--node-id","vince-termux-android-1");
    const created=await initTermuxV41Identity({directory:identityDirectory,nodeId});
    console.log(JSON.stringify({
      status:"IDENTITY_CREATED",
      identity:created.identity,
      privateKeyStoredLocally:true,
      privateKeyPrinted:false,
      identityDirectory:created.paths.directory
    },null,2));
    return 0;
  }

  if(command==="show-identity"){
    const loaded=await loadTermuxV41Identity({directory:identityDirectory});
    console.log(JSON.stringify({
      status:"PUBLIC_IDENTITY",
      identity:loaded.identity,
      privateKeyPrinted:false
    },null,2));
    return 0;
  }

  if(command==="once"){
    const jobId=value(args,"--job-id",null);
    if(!jobId)throw new Error("--job-id is required");
    const result=await runTermuxV41OneShot({
      jobId,
      repoPath:value(args,"--repo-path",process.cwd()),
      identityDirectory,
      channelRepository:value(args,"--channel-repo",TERMUX_V41_DEFAULT_CHANNEL_REPO),
      channelBranch:value(args,"--channel-branch",TERMUX_V41_DEFAULT_CHANNEL_BRANCH)
    });
    console.log(JSON.stringify({
      status:"ONE_SHOT_COMPLETED",
      ...result,
      privateKeyPrinted:false,
      processWillExit:true
    },null,2));
    return 0;
  }

  throw new Error(`unknown command: ${command}`);
}

try{
  process.exitCode=await main();
}catch(error){
  console.error(JSON.stringify({
    status:"FAILED",
    error:String(error?.message??error),
    privateKeyPrinted:false
  }));
  process.exitCode=1;
}
