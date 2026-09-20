import test from "node:test";
import assert from "node:assert/strict";
import {
  MachineBridgeMeshClient,
  MachineBridgeMeshEndpoint,
  MachineBridgeMeshRelay,
  createMeshEnvelope,
  verifyMeshEnvelope,
  verifyMeshResult
} from "../src/machine-bridge/mesh.mjs";

const job=(overrides={})=>({
  format:"arca-remote-job-v3",
  protocolVersion:3,
  jobId:"mesh-job-001",
  requestId:"mesh-req-001",
  action:"worker.ping",
  requires:[],
  params:{echo:"hello mesh"},
  ...overrides
});

const fixedNow=()=>new Date("2026-09-17T19:00:00.000Z");

test("mesh routes Bridge A -> Relay A -> Relay B -> endpoint and preserves request correlation",async()=>{
  let downstreamJob=null;
  const directClient={
    async call(value){
      downstreamJob=value;
      return {
        format:"arca-result-v1",
        protocolVersion:3,
        jobId:value.jobId,
        requestId:value.requestId,
        workerId:"worker-b",
        attempt:1,
        status:"completed",
        startedAt:"2026-09-17T19:00:01.000Z",
        completedAt:"2026-09-17T19:00:02.000Z",
        output:{ok:true,echo:value.params.echo}
      };
    }
  };

  const endpoint=new MachineBridgeMeshEndpoint({
    nodeId:"worker-b",
    capabilities:["llm.reasoning","document.read"],
    client:directClient,
    now:fixedNow
  });
  const relayB=new MachineBridgeMeshRelay({nodeId:"relay-b",now:fixedNow});
  relayB.addPeer(endpoint.advertise());
  const relayA=new MachineBridgeMeshRelay({nodeId:"relay-a",now:fixedNow});
  relayA.addPeer(relayB.advertise());

  const client=new MachineBridgeMeshClient({originNode:"bridge-a",entry:relayA,now:fixedNow});
  const result=await client.call(job(),{requiredCapabilities:["llm.reasoning"],maxHops:5,ttlMs:60000});

  assert.equal(downstreamJob.requestId,"mesh-req-001");
  assert.equal(result.result.status,"completed");
  assert.equal(result.result.output.echo,"hello mesh");
  assert.deepEqual(result.route,["relay-a","relay-b","worker-b"]);
  assert.deepEqual(result.replyRoute,["worker-b","relay-b","relay-a"]);
  assert.equal(result.receipts.length,3);
  assert.equal(result.receipts[0].nextNode,"relay-b");
  assert.equal(result.receipts[1].nextNode,"worker-b");
  assert.equal(result.receipts[2].nextNode,"local-executor");
  assert.equal(verifyMeshResult(result),true);
});

test("mesh fails closed when no reachable peer satisfies required capabilities",async()=>{
  const endpoint=new MachineBridgeMeshEndpoint({
    nodeId:"worker-basic",
    capabilities:["document.read"],
    client:{call:async value=>({jobId:value.jobId,requestId:value.requestId,status:"completed"})},
    now:fixedNow
  });
  const relay=new MachineBridgeMeshRelay({nodeId:"relay-basic",now:fixedNow,peers:[endpoint.advertise()]});
  const client=new MachineBridgeMeshClient({originNode:"bridge-a",entry:relay,now:fixedNow});
  await assert.rejects(()=>client.call(job(),{requiredCapabilities:["llm.reasoning"]}),/mesh no route/);
});

test("mesh detects loops, hop exhaustion and expiry before forwarding",async()=>{
  const relay=new MachineBridgeMeshRelay({nodeId:"relay-a",now:fixedNow});
  const base=createMeshEnvelope(job(),{originNode:"bridge-a",requiredCapabilities:[],maxHops:3,ttlMs:60000,now:fixedNow()});

  await assert.rejects(()=>relay.forward({...base,route:["relay-a"],receipts:[{
    nodeId:"relay-a",nextNode:"relay-z",hop:1,requestId:base.requestId,jobId:base.job.jobId,
    forwardedAt:"2026-09-17T19:00:00.000Z",previousHash:base.payloadHash,receiptHash:"bad"
  }]}),/receipt hash mismatch|loop detected/);

  const exhausted={...base,maxHops:1,route:["relay-x"],receipts:[]};
  await assert.rejects(()=>relay.forward(exhausted),/invalid mesh route/);

  const expiredRelay=new MachineBridgeMeshRelay({nodeId:"relay-expired",now:()=>new Date("2026-09-17T19:02:00.000Z")});
  const expired=createMeshEnvelope(job({jobId:"mesh-job-expired",requestId:"mesh-req-expired"}),{
    originNode:"bridge-a",ttlMs:1000,now:new Date("2026-09-17T19:00:00.000Z")
  });
  await assert.rejects(()=>expiredRelay.forward(expired),/mesh envelope expired/);
});

test("mesh hash chain detects payload or receipt tampering",()=>{
  const envelope=createMeshEnvelope(job(),{originNode:"bridge-a",ttlMs:60000,now:fixedNow()});
  assert.equal(verifyMeshEnvelope(envelope),true);
  assert.throws(()=>verifyMeshEnvelope({...envelope,job:{...envelope.job,params:{echo:"tampered"}}}),/payload hash mismatch/);
});
