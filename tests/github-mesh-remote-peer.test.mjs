import test from "node:test";
import assert from "node:assert/strict";
import {GitHubMeshMailboxTransport} from "../src/machine-bridge/github-mesh-mailbox.mjs";
import {MachineBridgeMeshEndpoint,createMeshEnvelope} from "../src/machine-bridge/mesh.mjs";

function makeApi(){
  const store=new Map();let seq=0,dispatches=0;
  const response=(status,body)=>({ok:status>=200&&status<300,status,statusText:String(status),async text(){return body==null?"":JSON.stringify(body)}});
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches")){dispatches+=1;return response(204,null)}
    const marker="/contents/";const index=u.pathname.indexOf(marker);if(index<0)return response(404,{message:"Not Found"});
    const path=u.pathname.slice(index+marker.length).split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      store.set(path,{text:Buffer.from(body.content,"base64").toString("utf8"),sha:`sha-${++seq}`});
      return response(201,{content:{path,sha:store.get(path).sha}});
    }
    const file=store.get(path);if(file)return response(200,{type:"file",name:path.split("/").at(-1),path,sha:file.sha,content:Buffer.from(file.text).toString("base64")});
    const prefix=path.replace(/\/$/,"")+"/";const children=new Map();
    for(const [key,value] of store){if(!key.startsWith(prefix))continue;const rest=key.slice(prefix.length);const name=rest.split("/")[0];if(!name)continue;const childPath=prefix+name;if(!children.has(name))children.set(name,rest.includes("/")?{type:"dir",name,path:childPath}:{type:"file",name,path:childPath,sha:value.sha});}
    return children.size?response(200,[...children.values()]):response(404,{message:"Not Found"});
  };
  return {fetchImpl,get dispatches(){return dispatches}};
}

const job={format:"arca-remote-job-v3",protocolVersion:3,jobId:"mesh-peer-job-1",requestId:"mesh-peer-req-1",action:"worker.ping",requires:[],params:{echo:"peer"}};

test("remote Mesh peer enqueues a durable handoff and waits for the shared terminal result",async()=>{
  const api=makeApi();const mailbox=new GitHubMeshMailboxTransport({repository:"owner/repo",ref:"main",token:"secret",fetchImpl:api.fetchImpl});
  const envelope=createMeshEnvelope(job,{originNode:"bridge-a",requiredCapabilities:["node"],now:new Date("2026-09-17T19:00:00.000Z")});
  const endpoint=new MachineBridgeMeshEndpoint({nodeId:"worker-b",capabilities:["node"],now:()=>new Date("2026-09-17T19:00:01.000Z"),client:{call:async value=>({format:"arca-result-v1",protocolVersion:3,jobId:value.jobId,requestId:value.requestId,workerId:"worker-b",attempt:1,status:"completed",startedAt:"2026-09-17T19:00:01.000Z",completedAt:"2026-09-17T19:00:02.000Z",output:{ok:true}})}});
  const terminal=await endpoint.forward(envelope);
  let now=0,sleeps=0;
  const peer=mailbox.remotePeer("relay-b",{
    reachableCapabilities:["node"],waitTimeoutMs:5000,pollIntervalMs:100,
    now:()=>now,
    sleepImpl:async()=>{sleeps+=1;now+=100;await mailbox.writeResult(terminal)}
  });
  const result=await peer.forward(envelope);
  assert.equal(api.dispatches,1);
  assert.equal(sleeps,1);
  assert.equal(result.requestId,"mesh-peer-req-1");
  assert.equal(result.result.status,"completed");
  const queued=await mailbox.listEnvelopes("relay-b");
  assert.equal(queued.length,1);
});
