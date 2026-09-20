import test from "node:test";import assert from "node:assert/strict";
import {DeliberationRoom} from "../../src/machine-bridge/deliberation-room.mjs";
import {DeliberationController} from "../../src/machine-bridge/deliberation-controller.mjs";
import {AuditorGateway,createReadOnlySource} from "../../src/machine-bridge/auditor-gateway.mjs";
import {createAuditorToolInterface} from "../../src/machine-bridge/auditor-tool-interface.mjs";
import {createToolEnabledAuditorAdapter} from "../../src/machine-bridge/tool-enabled-auditor-adapter.mjs";

test("full MBDP circuit: independent audit, reveal, challenge and close",async()=>{
 const participants=[{agentId:"alpha",provider:"sim-a",model:"audit-a",role:"auditor"},{agentId:"beta",provider:"sim-b",model:"audit-b",role:"auditor"}];
 const evidence={sha:"deadbeef",claim:"transport completed",externalTrail:"present"};
 const gateway=new AuditorGateway({sources:{github:createReadOnlySource({read:async()=>evidence})}});
 const room=new DeliberationRoom({roomId:"e2e-1",evidenceSetHash:"c".repeat(64),participants});
 const make=p=>{
  const tools=createAuditorToolInterface({gateway,agentId:p.agentId});let phaseSeen=new Set();
  return createToolEnabledAuditorAdapter({...p,tools,reason:async({input,transcript})=>{
   if(!transcript.length)return{kind:"tool",name:"audit_get_commit",args:{repo:"example/arca",sha:"deadbeef"}};
   const ev=transcript[0].result;phaseSeen.add(input.phase);
   if(input.phase==="independent")return{kind:"final",body:p.agentId+" independently verified "+ev.sha,evidenceRefs:[ev.sha]};
   if(input.phase==="cross_review")return{kind:"final",type:"challenge",body:p.agentId+" reviewed peer claims against "+ev.sha,evidenceRefs:[ev.sha]};
   if(input.phase==="rebuttal")return{kind:"final",type:"response",body:p.agentId+" preserves evidence-bound conclusion",evidenceRefs:[ev.sha]};
   return{kind:"final",type:"final",body:p.agentId+" final: evidence consistent; independence not inferred",evidenceRefs:[ev.sha]};
  }});
 };
 const controller=new DeliberationController({room,adapters:participants.map(make),timeoutMs:200});
 const end=await controller.runToClose();
 assert.equal(end.phase,"closed");assert.equal(end.messages.length,8);
 assert.equal(end.messages.filter(m=>m.phase==="independent").length,2);
 assert.equal(end.messages.filter(m=>m.type==="challenge").length,2);
 assert.equal(end.messages.filter(m=>m.type==="response").length,2);
 assert.ok(end.messages.every(m=>m.evidenceRefs.includes("deadbeef")));
 const events=gateway.events();assert.equal(events.length,8);assert.deepEqual(new Set(events.map(e=>e.agentId)),new Set(["alpha","beta"]));
 for(let i=1;i<end.messages.length;i++)assert.equal(end.messages[i].previousHash,end.messages[i-1].messageHash);
});
