import test from "node:test";
import assert from "node:assert/strict";
import {GitHubMachineBridgeTransport} from "../src/machine-bridge/github-transport.mjs";
import {isMachineBridgeJobV3} from "../src/machine-bridge/protocol-v3.mjs";

function makeApi(){
  const store=new Map();let seq=0,dispatches=0;
  const response=(status,body)=>({ok:status>=200&&status<300,status,statusText:String(status),async text(){return body==null?"":JSON.stringify(body)}});
  const put=(path,value)=>store.set(path,{text:JSON.stringify(value,null,2)+"\n",sha:`sha-${++seq}`});
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url);const method=options.method||"GET";
    if(method==="POST"&&u.pathname.endsWith("/dispatches")){dispatches+=1;return response(204,null)}
    const marker="/contents/";const raw=u.pathname.slice(u.pathname.indexOf(marker)+marker.length);const path=raw.split("/").map(decodeURIComponent).join("/");
    if(method==="PUT"){
      const body=JSON.parse(options.body);const current=store.get(path);
      if(current&&body.sha!==current.sha)return response(409,{message:"sha mismatch"});
      if(!current&&body.sha)return response(409,{message:"missing path"});
      const text=Buffer.from(body.content,"base64").toString("utf8");
      store.set(path,{text,sha:`sha-${++seq}`});
      return response(201,{content:{path,sha:store.get(path).sha}});
    }
    const file=store.get(path);
    if(file)return response(200,{type:"file",name:path.split("/").at(-1),path,sha:file.sha,content:Buffer.from(file.text).toString("base64")});
    const prefix=path.replace(/\/$/,"")+"/";const children=new Map();
    for(const [key,value] of store){if(!key.startsWith(prefix))continue;const rest=key.slice(prefix.length);const name=rest.split("/")[0];if(!name)continue;const childPath=prefix+name;if(!children.has(name))children.set(name,rest.includes("/")?{type:"dir",name,path:childPath}:{type:"file",name,path:childPath,sha:value.sha});}
    return children.size?response(200,[...children.values()]):response(404,{message:"Not Found"});
  };
  return {store,put,fetchImpl,get dispatches(){return dispatches}};
}

const worker={format:"arca-worker-v1",workerId:"worker-a",capabilities:["node","repository"],heartbeatAt:"2026-09-16T12:00:00.000Z",startedAt:"2026-09-16T11:00:00.000Z"};
const job=(id="job-1")=>({format:"arca-remote-job-v3",protocolVersion:3,jobId:id,action:"worker.ping",requires:[],params:{echo:id}});

test("V3 protocol validation fails closed on malformed jobs",()=>{
  assert.equal(isMachineBridgeJobV3(job()),true);
  assert.equal(isMachineBridgeJobV3({...job(),requestId:"req-1"}),true);
  assert.equal(isMachineBridgeJobV3({...job(),requestId:"../escape"}),false);
  assert.equal(isMachineBridgeJobV3({...job(),requires:"node"}),false);
  assert.equal(isMachineBridgeJobV3({...job(),jobId:"../escape"}),false);
  assert.equal(isMachineBridgeJobV3({...job(),timeoutMs:999}),false);
});

test("GitHub transport requires repository credentials",()=>{
  assert.throws(()=>new GitHubMachineBridgeTransport({repository:"owner/repo"}),/token required/);
  assert.throws(()=>new GitHubMachineBridgeTransport({repository:"bad",token:"x"}),/invalid GitHub repository/);
});

test("GitHub transport defaults durable operational state away from source main",()=>{
  const transport=new GitHubMachineBridgeTransport({repository:"owner/repo",token:"secret"});
  assert.equal(transport.ref,"arca-runtime");
});

test("GitHub transport enqueues once and wakes the controller",async()=>{
  const api=makeApi();const transport=new GitHubMachineBridgeTransport({repository:"owner/repo",ref:"jobs",token:"secret",fetchImpl:api.fetchImpl});
  assert.equal(await transport.enqueue(job("job-submit"),{queue:"shared"}),true);
  assert.equal(api.dispatches,1);
  assert.equal(JSON.parse(api.store.get("remote-jobs/queues/shared/job-submit.json").text).jobId,"job-submit");
  assert.equal(await transport.enqueue(job("job-submit"),{queue:"shared"}),false);
  assert.equal(api.dispatches,1);
  await assert.rejects(()=>transport.enqueue({...job("bad"),requires:"node"}),/invalid Machine Bridge V3 job/);
});

test("GitHub transport registers worker using authenticated repository transport",async()=>{
  const api=makeApi();const transport=new GitHubMachineBridgeTransport({repository:"owner/repo",ref:"jobs",token:"secret",fetchImpl:api.fetchImpl});
  const registration=await transport.registerWorker(worker,{now:new Date("2026-09-16T12:01:00.000Z")});
  assert.equal(registration.transport.authentication,"repository-bearer-token");
  assert.equal(registration.transport.ref,"jobs");
  assert.equal(JSON.parse(api.store.get("remote-jobs/workers/worker-a.json").text).worker.workerId,"worker-a");
});

test("GitHub transport discovers targeted and shared V3 jobs",async()=>{
  const api=makeApi();api.put("remote-jobs/queues/worker-a/a.json",job("job-a"));api.put("remote-jobs/queues/shared/b.json",job("job-b"));
  const transport=new GitHubMachineBridgeTransport({repository:"owner/repo",token:"secret",fetchImpl:api.fetchImpl});
  assert.deepEqual((await transport.listJobs("worker-a")).map(x=>x.job.jobId),["job-a","job-b"]);
});

test("GitHub transport exposes durable results to downstream consumers and direct callers",async()=>{
  const api=makeApi();
  api.put("remote-jobs/results/job-b.json",{format:"arca-result-v1",jobId:"job-b",status:"completed"});
  api.put("remote-jobs/results/job-a.json",{format:"arca-result-v1",jobId:"job-a",requestId:"req-a",status:"completed"});
  const transport=new GitHubMachineBridgeTransport({repository:"owner/repo",token:"secret",fetchImpl:api.fetchImpl});
  const results=await transport.listResults();
  assert.deepEqual(results.map(x=>x.result.jobId),["job-a","job-b"]);
  assert.ok(results.every(x=>x.sha));
  const direct=await transport.getResult("job-a");
  assert.equal(direct.result.requestId,"req-a");
  assert.ok(direct.sha);
  assert.equal(await transport.getResult("job-missing"),null);
  assert.equal(await transport.hasResult("job-a"),true);
});

test("GitHub claim is exclusive and permits takeover only after lease expiry",async()=>{
  const api=makeApi();const a=new GitHubMachineBridgeTransport({repository:"owner/repo",token:"a",fetchImpl:api.fetchImpl});const b=new GitHubMachineBridgeTransport({repository:"owner/repo",token:"b",fetchImpl:api.fetchImpl});
  const first=await a.claim(job(),worker,{leaseMs:1000,now:new Date("2026-09-16T12:00:00.000Z")});
  assert.equal(first.attempt,1);
  assert.equal(await b.claim(job(),{...worker,workerId:"worker-b"},{leaseMs:1000,now:new Date("2026-09-16T12:00:00.500Z")}),null);
  const second=await b.claim(job(),{...worker,workerId:"worker-b"},{leaseMs:1000,now:new Date("2026-09-16T12:00:02.000Z")});
  assert.equal(second.attempt,2);assert.equal(second.workerId,"worker-b");
});

test("GitHub result publication is idempotent and renewal enforces ownership",async()=>{
  const api=makeApi();const transport=new GitHubMachineBridgeTransport({repository:"owner/repo",token:"secret",fetchImpl:api.fetchImpl});
  await transport.claim(job(),worker,{leaseMs:60000,now:new Date("2026-09-16T12:00:00.000Z")});
  await assert.rejects(()=>transport.renew("job-1","worker-b",{leaseMs:60000,now:new Date("2026-09-16T12:00:01.000Z")}),/another worker/);
  const renewed=await transport.renew("job-1","worker-a",{leaseMs:60000,now:new Date("2026-09-16T12:00:01.000Z")});
  assert.equal(renewed.workerId,"worker-a");
  const result={format:"arca-result-v1",protocolVersion:3,jobId:"job-1",workerId:"worker-a",attempt:1,status:"completed",startedAt:"2026-09-16T12:00:00.000Z",completedAt:"2026-09-16T12:00:02.000Z",output:{ok:true}};
  assert.equal(await transport.writeResult(result),true);assert.equal(await transport.writeResult(result),false);
});
