import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  MachineBridgeMeshEndpoint,
  MachineBridgeMeshRelay,
  createMeshEnvelope,
  meshIncomingOwnershipBinding,
  verifyMeshEnvelope
} from "../src/machine-bridge/mesh.mjs";
import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {
  RemoteRequestEvidenceLedger,
  createFileRemoteRequestEvidenceStorage
} from "../src/machine-bridge/remote-request-evidence.mjs";
import {RemoteEvidenceProcessor} from "../src/machine-bridge/remote-evidence-processor.mjs";

const T0=new Date("2026-09-18T05:30:00.000Z");
const BINDING_HASH="b".repeat(64);

function job(id="1"){
  return {
    format:"arca-remote-job-v3",
    protocolVersion:3,
    jobId:"processor-job-"+id,
    requestId:"processor-req-"+id,
    action:"worker.ping",
    requires:["reasoning"],
    params:{echo:id}
  };
}

async function ownershipEnvelope({id="1",relaySigner,trustStore,signed=true}){
  const base=createMeshEnvelope(job(id),{
    originNode:"origin-a",
    requiredCapabilities:["reasoning"],
    now:T0,
    ttlMs:60_000
  });
  let captured=null;
  const requestOwnership={
    async reserveForward(context){
      return Object.freeze({
        requestId:context.requestId,
        jobId:context.jobId,
        selectedNodeId:context.selectedNodeId,
        bindingHash:BINDING_HASH
      });
    },
    async markForwardStarted(){return true},
    async beginForward(){throw new Error("advanced ownership path expected")},
    async completeForward(){return true},
    async failForward(){return true}
  };
  const relay=new MachineBridgeMeshRelay({
    nodeId:"relay-a",
    peers:[{
      nodeId:"peer-a",
      capabilities:["reasoning"],
      reachableCapabilities:["reasoning"],
      async forward(envelope){
        captured=envelope;
        const error=new Error("capture only");
        error.code="CAPTURE";
        throw error;
      }
    }],
    requestOwnership,
    receiptSigner:signed?relaySigner:null,
    trustStore,
    requireSignedReceipts:false,
    now:()=>T0
  });
  await assert.rejects(()=>relay.forward(base),/capture only/);
  assert.ok(captured);
  return captured;
}

class MemoryMailbox{
  constructor({envelopes=[],writeMode="normal",onWrite=null}={}){
    this.envelopes=[...envelopes];
    this.results=new Map();
    this.claims=new Set();
    this.writeMode=writeMode;
    this.onWrite=onWrite;
  }
  async listEnvelopes(){return this.envelopes.map(envelope=>({envelope,path:"queue/"+envelope.requestId,sha:"sha"}))}
  async claimEnvelope(_nodeId,requestId){
    if(this.claims.has(requestId))return null;
    this.claims.add(requestId);
    return {requestId};
  }
  async getResult(requestId){
    return this.results.has(requestId)?{path:"result/"+requestId,result:this.results.get(requestId),sha:"sha"}:null;
  }
  async writeResult(result){
    if(this.results.has(result.requestId))return false;
    this.results.set(result.requestId,result);
    await this.onWrite?.(result);
    if(this.writeMode==="store-then-throw")throw new Error("synthetic lost write acknowledgement");
    if(this.writeMode==="throw-before-store"){
      this.results.delete(result.requestId);
      throw new Error("synthetic result store failure");
    }
    return true;
  }
}

async function fixture(fn,{id="1",signed=true}={}){
  const root=await mkdtemp(join(tmpdir(),"arca-remote-processor-"));
  try{
    const relaySigner=generateMeshNodeIdentity("relay-a");
    const peerSigner=generateMeshNodeIdentity("peer-a");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(relaySigner.identity);
    trustStore.trust(peerSigner.identity);
    const envelope=await ownershipEnvelope({id,relaySigner,trustStore,signed});
    const ledger=new RemoteRequestEvidenceLedger({
      nodeId:"peer-a",
      signer:peerSigner,
      trustStore,
      storage:createFileRemoteRequestEvidenceStorage({root:join(root,"evidence")}),
      now:()=>T0
    });
    const endpoint=new MachineBridgeMeshEndpoint({
      nodeId:"peer-a",
      capabilities:["reasoning"],
      receiptSigner:peerSigner,
      requireSignedReceipts:true,
      trustStore,
      now:()=>new Date(T0.getTime()+1000),
      client:{
        async call(value){
          return {
            format:"arca-result-v1",
            protocolVersion:3,
            jobId:value.jobId,
            requestId:value.requestId,
            workerId:"peer-a-worker",
            attempt:1,
            status:"completed",
            startedAt:new Date(T0.getTime()+1000).toISOString(),
            completedAt:new Date(T0.getTime()+1500).toISOString(),
            output:{ok:true}
          };
        }
      }
    });
    await fn({root,relaySigner,peerSigner,trustStore,envelope,ledger,endpoint});
  }finally{
    await rm(root,{recursive:true,force:true});
  }
}

test("ownership binding is carried in the signed incoming receipt",async()=>{
  await fixture(async({envelope,trustStore})=>{
    assert.equal(verifyMeshEnvelope(envelope,{requireSignedReceipts:true,trustStore}),true);
    const ownership=meshIncomingOwnershipBinding(envelope,{nodeId:"peer-a"});
    assert.equal(ownership.bindingHash,BINDING_HASH);
    assert.equal(ownership.relayNodeId,"relay-a");
    assert.equal(ownership.selectedNodeId,"peer-a");
    assert.equal(ownership.signed,true);

    const tampered=structuredClone(envelope);
    tampered.receipts.at(-1).ownershipBindingHash="c".repeat(64);
    assert.throws(
      ()=>verifyMeshEnvelope(tampered,{requireSignedReceipts:true,trustStore}),
      /receipt hash mismatch|signed receipt payload mismatch/
    );
  });
});

test("strict processor rejects unsigned ownership binding before acceptance or execution",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    let executed=0;
    const mailbox=new MemoryMailbox({envelopes:[envelope]});
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,
      execute:async value=>{executed+=1;return endpoint.forward(value)},
      now:()=>T0
    });
    await assert.rejects(
      ()=>processor.processEnvelope(envelope),
      /signed receipt required/
    );
    assert.equal(executed,0);
    assert.equal((await ledger.status(envelope.requestId)).state,"unseen");
  },{id:"unsigned",signed:false});
});

test("policy rejection is signed before execution and never authorizes failover",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    let executed=0;
    const mailbox=new MemoryMailbox({envelopes:[envelope]});
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,
      acceptancePolicy:async context=>{
        assert.equal(context.ownerBindingHash,BINDING_HASH);
        return {accept:false,category:"policy"};
      },
      execute:async value=>{executed+=1;return endpoint.forward(value)},
      now:()=>T0
    });
    const event=await processor.processEnvelope(envelope);
    assert.equal(event.state,"rejected");
    assert.equal(event.rejectionCategory,"policy");
    assert.equal(event.automaticFailoverAllowed,false);
    assert.equal(executed,0);
    assert.equal((await ledger.status(envelope.requestId)).state,"rejected");
  },{id:"reject"});
});

test("processor ordering is accepted -> execute -> durable result -> signed completion",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    const order=[];
    const mailbox=new MemoryMailbox({
      envelopes:[envelope],
      onWrite:async()=>{
        order.push("durable-result");
        assert.equal((await ledger.status(envelope.requestId)).state,"accepted");
      }
    });
    const originalAccept=ledger.accept.bind(ledger);
    ledger.accept=async input=>{
      const value=await originalAccept(input);
      order.push("accepted");
      return value;
    };
    const originalComplete=ledger.complete.bind(ledger);
    ledger.complete=async input=>{
      order.push("completion");
      assert.ok(await mailbox.getResult(envelope.requestId));
      return originalComplete(input);
    };
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,
      execute:async value=>{
        order.push("execute");
        assert.equal((await ledger.status(envelope.requestId)).state,"accepted");
        assert.equal(await mailbox.getResult(envelope.requestId),null);
        return endpoint.forward(value);
      },
      now:()=>T0
    });
    const event=await processor.processEnvelope(envelope);
    assert.equal(event.state,"completed");
    assert.equal(event.executed,true);
    assert.deepEqual(order,["accepted","execute","durable-result","completion"]);
    assert.equal((await ledger.status(envelope.requestId)).state,"completed");
  },{id:"order"});
});

test("execution failure after acceptance becomes uncertain and retry never re-executes",async()=>{
  await fixture(async({envelope,trustStore,ledger})=>{
    let calls=0;
    const mailbox=new MemoryMailbox({envelopes:[envelope]});
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,
      execute:async()=>{
        calls+=1;
        throw new Error("synthetic executor crash");
      },
      now:()=>T0
    });
    await assert.rejects(
      ()=>processor.processEnvelope(envelope),
      error=>error.code==="ARCA_REMOTE_EVIDENCE_EXECUTION_UNCERTAIN"
    );
    assert.equal(calls,1);
    assert.equal((await ledger.status(envelope.requestId)).state,"accepted");

    const retry=await processor.processEnvelope(envelope);
    assert.equal(retry.state,"accepted-uncertain");
    assert.equal(retry.executed,false);
    assert.equal(retry.automaticFailoverAllowed,false);
    assert.equal(calls,1);
  },{id:"exec-crash"});
});

test("lost result-write acknowledgement recovers durable result without re-execution",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    let calls=0;
    const mailbox=new MemoryMailbox({envelopes:[envelope],writeMode:"store-then-throw"});
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,
      execute:async value=>{calls+=1;return endpoint.forward(value)},
      now:()=>T0
    });
    await assert.rejects(
      ()=>processor.processEnvelope(envelope),
      error=>error.code==="ARCA_REMOTE_EVIDENCE_RESULT_PERSIST_UNCERTAIN"
    );
    assert.equal(calls,1);
    assert.ok(await mailbox.getResult(envelope.requestId));
    assert.equal((await ledger.status(envelope.requestId)).state,"accepted");

    mailbox.writeMode="normal";
    const recovered=await processor.processEnvelope(envelope);
    assert.equal(recovered.state,"completed");
    assert.equal(recovered.recovered,true);
    assert.equal(recovered.executed,false);
    assert.equal(calls,1);
    assert.equal((await ledger.status(envelope.requestId)).state,"completed");
  },{id:"write-ack"});
});

test("crash after durable result but before signed completion recovers without replay",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    let calls=0,completeCalls=0;
    const mailbox=new MemoryMailbox({envelopes:[envelope]});
    const realComplete=ledger.complete.bind(ledger);
    const wrapper={
      nodeId:"peer-a",
      status:(...args)=>ledger.status(...args),
      accept:(...args)=>ledger.accept(...args),
      reject:(...args)=>ledger.reject(...args),
      async complete(...args){
        completeCalls+=1;
        if(completeCalls===1)throw new Error("synthetic signer unavailable");
        return realComplete(...args);
      }
    };
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:wrapper,trustStore,
      execute:async value=>{calls+=1;return endpoint.forward(value)},
      now:()=>T0
    });
    await assert.rejects(
      ()=>processor.processEnvelope(envelope),
      error=>error.code==="ARCA_REMOTE_EVIDENCE_COMPLETION_PENDING"
    );
    assert.equal(calls,1);
    assert.ok(await mailbox.getResult(envelope.requestId));
    assert.equal((await ledger.status(envelope.requestId)).state,"accepted");

    const recovered=await processor.processEnvelope(envelope);
    assert.equal(recovered.state,"completed");
    assert.equal(recovered.recovered,true);
    assert.equal(calls,1);
    assert.equal(completeCalls,2);
  },{id:"completion-crash"});
});

test("concurrent processors sharing the evidence ledger cause at most one execution",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    let calls=0;
    let release;
    const gate=new Promise(resolve=>{release=resolve});
    const mailbox=new MemoryMailbox({envelopes:[envelope]});
    const execute=async value=>{
      calls+=1;
      await gate;
      return endpoint.forward(value);
    };
    const a=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,execute,now:()=>T0
    });
    const b=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,execute,now:()=>T0
    });
    const first=a.processEnvelope(envelope);
    const second=b.processEnvelope(envelope);
    for(let i=0;i<100;i+=1){
      if((await ledger.status(envelope.requestId)).state==="accepted")break;
      await new Promise(resolve=>setImmediate(resolve));
    }
    release();
    const settled=await Promise.allSettled([first,second]);
    assert.equal(calls,1);
    assert.equal(settled.filter(value=>value.status==="fulfilled").length,2);
    const states=settled.map(value=>value.value.state);
    assert.ok(states.includes("completed"));
    assert.ok(states.every(state=>state==="completed"||state==="accepted-uncertain"));
  },{id:"concurrent"});
});

test("durable result without prior signed acceptance fails closed instead of creating retroactive evidence",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    const mailbox=new MemoryMailbox({envelopes:[envelope]});
    const result=await endpoint.forward(envelope);
    mailbox.results.set(envelope.requestId,result);
    let calls=0;
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,
      execute:async()=>{calls+=1;throw new Error("must not execute")},
      now:()=>T0
    });
    await assert.rejects(
      ()=>processor.processEnvelope(envelope),
      error=>error.code==="ARCA_REMOTE_EVIDENCE_ACCEPTANCE_MISSING"
    );
    assert.equal(calls,0);
    assert.equal((await ledger.status(envelope.requestId)).state,"unseen");
  },{id:"missing-acceptance"});
});

test("existing accepted evidence plus no durable result never runs executor on restart",async()=>{
  await fixture(async({envelope,trustStore,ledger})=>{
    const ownership=meshIncomingOwnershipBinding(envelope,{nodeId:"peer-a"});
    await ledger.accept({
      requestId:envelope.requestId,
      jobId:envelope.job.jobId,
      payloadHash:envelope.payloadHash,
      ownerBindingHash:ownership.bindingHash,
      now:T0
    });
    let calls=0;
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",
      mailbox:new MemoryMailbox({envelopes:[envelope]}),
      evidenceLedger:ledger,
      trustStore,
      execute:async()=>{calls+=1;throw new Error("must not execute")},
      now:()=>T0
    });
    const event=await processor.processEnvelope(envelope);
    assert.equal(event.state,"accepted-uncertain");
    assert.equal(calls,0);
  },{id:"restart"});
});

test("runOnce claims queue items and returns sanitized events",async()=>{
  await fixture(async({envelope,trustStore,ledger,endpoint})=>{
    const mailbox=new MemoryMailbox({envelopes:[envelope]});
    const processor=new RemoteEvidenceProcessor({
      nodeId:"peer-a",mailbox,evidenceLedger:ledger,trustStore,
      execute:value=>endpoint.forward(value),
      now:()=>T0
    });
    const scan=await processor.runOnce({processorId:"remote-processor-a"});
    assert.equal(scan.scanned,1);
    assert.equal(scan.processed,1);
    assert.equal(scan.events[0].state,"completed");
    assert.equal(JSON.stringify(scan).includes("params"),false);
    assert.equal(JSON.stringify(scan).includes("vault://"),false);
    assert.deepEqual(processor.snapshot(),{
      format:"arca-remote-evidence-processor-v1",
      version:1,
      nodeId:"peer-a",
      signedReceiptsRequired:true,
      remoteEvidenceEnabled:true
    });
  },{id:"scan"});
});
