import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonicalInvestigationId,
  createDurableInvestigationQueue
} from "../src/machine-bridge/investigation-queue.mjs";

const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"arca-investigation-queue-"));
const scope=(jurisdiction="BR/NATIONAL")=>({
  jurisdiction,
  subjectRef:"public-entity:synthetic",
  topic:"public procurement",
  timeWindow:"2026-Q3",
  sourceScopes:["PNCP","OFFICIAL_PORTAL"]
});
const request=(queue,index=1,extra={})=>queue.request({
  scope:scope(extra.jurisdiction),
  triggerKind:"HUMAN_REQUEST",
  triggerRef:extra.triggerRef??"request-"+index,
  participantRef:extra.participantRef??"human-"+index,
  priority:extra.priority??0
});

test("ten humans share one durable investigation across queue restarts",()=>{
  const root=tempRoot();
  const first=createDurableInvestigationQueue({root});
  let investigationId;
  for(let index=0;index<10;index++){
    const result=request(first,index);
    investigationId=result.record.investigationId;
    assert.equal(result.created,index===0);
  }
  assert.equal(first.list().length,1);
  assert.equal(first.get(investigationId).subscribers.length,10);
  assert.equal(first.get(investigationId).pendingWakeReasons.length,10);

  const restarted=createDurableInvestigationQueue({root});
  assert.equal(restarted.list().length,1);
  assert.equal(restarted.get(investigationId).subscribers.length,10);
});

test("canonical key is normalized, source-order independent and jurisdiction generic",()=>{
  const a=canonicalInvestigationId({
    jurisdiction:" BR / NATIONAL ",
    subjectRef:"Órgão:123",
    topic:" Contratação Pública ",
    timeWindow:"2026",
    sourceScopes:["PNCP","Portal Oficial"]
  });
  const b=canonicalInvestigationId({
    jurisdiction:"br / national",
    subjectRef:"órgão:123",
    topic:"contratação pública",
    timeWindow:"2026",
    sourceScopes:["portal oficial","pncp"]
  });
  assert.deepEqual(a,b);
  const c=canonicalInvestigationId({...scope("BR/STATE/MUNICIPALITY-B")});
  assert.notEqual(a.investigationId,c.investigationId);
});

test("duplicate request does not create duplicate wake work",()=>{
  const queue=createDurableInvestigationQueue({root:tempRoot()});
  const first=request(queue,1);
  const second=request(queue,1);
  assert.equal(first.created,true);
  assert.equal(first.awakened,true);
  assert.equal(second.created,false);
  assert.equal(second.awakened,false);
  assert.equal(second.record.pendingWakeReasons.length,1);
});

test("comments and confirmations persist without waking workers or changing evidence state",()=>{
  const queue=createDurableInvestigationQueue({root:tempRoot()});
  const initial=request(queue,1);
  const claim=queue.claim(initial.record.investigationId,{workerId:"worker-a"});
  queue.complete(initial.record.investigationId,{workerId:"worker-a",outcome:"success"});

  const comment=queue.contribute(initial.record.investigationId,{participantRef:"human-2",kind:"COMMENT",reference:"comment-1"});
  const confirmation=queue.contribute(initial.record.investigationId,{participantRef:"human-3",kind:"CONFIRMATION",reference:"confirmation-1"});
  assert.equal(comment.awakened,false);
  assert.equal(confirmation.awakened,false);
  const stored=queue.get(initial.record.investigationId);
  assert.equal(stored.state,"LEAD");
  assert.equal(stored.pendingWakeReasons.length,0);
  assert.equal(stored.contributions.length,2);
});

test("public source dispute and deepening create distinct wake reasons",()=>{
  const queue=createDurableInvestigationQueue({root:tempRoot()});
  const initial=request(queue,1);
  const first=queue.claim(initial.record.investigationId,{workerId:"worker-a"});
  assert.equal(first.acquired,true);
  queue.complete(initial.record.investigationId,{workerId:"worker-a"});
  for(const [kind,reference] of [
    ["PUBLIC_SOURCE","https://example.invalid/record"],
    ["DISPUTE","dispute-1"],
    ["DEEPEN_REQUEST","deepen-1"]
  ])queue.contribute(initial.record.investigationId,{participantRef:"human-2",kind,reference});
  assert.equal(queue.get(initial.record.investigationId).pendingWakeReasons.length,3);
});

test("lease ownership blocks duplicate workers and expired work is recovered",()=>{
  const root=tempRoot();
  let current=new Date("2026-09-20T12:00:00Z");
  const queue=createDurableInvestigationQueue({root,clock:()=>current});
  const initial=request(queue,1);
  const first=queue.claimNext({workerId:"worker-a",leaseMs:1000});
  assert.equal(first.acquired,true);
  assert.equal(first.lease.attempt,1);

  const blocked=queue.claim(initial.record.investigationId,{workerId:"worker-b",leaseMs:1000});
  assert.equal(blocked.acquired,false);
  assert.equal(blocked.reason,"leased");

  current=new Date("2026-09-20T12:00:01.001Z");
  const recovered=queue.claim(initial.record.investigationId,{workerId:"worker-b",leaseMs:1000});
  assert.equal(recovered.acquired,true);
  assert.equal(recovered.reason,"recovered");
  assert.equal(recovered.lease.attempt,2);
  assert.throws(()=>queue.renew(initial.record.investigationId,{workerId:"worker-a"}),/OWNER_MISMATCH/);
});

test("failed work remains pending while successful completion acknowledges claimed reasons",()=>{
  const queue=createDurableInvestigationQueue({root:tempRoot()});
  const initial=request(queue,1);
  queue.claim(initial.record.investigationId,{workerId:"worker-a"});
  const failed=queue.complete(initial.record.investigationId,{workerId:"worker-a",outcome:"failure"});
  assert.equal(failed.record.pendingWakeReasons.length,1);

  const retry=queue.claim(initial.record.investigationId,{workerId:"worker-b"});
  assert.equal(retry.acquired,true);
  assert.equal(retry.lease.attempt,2);
  const completed=queue.complete(initial.record.investigationId,{workerId:"worker-b",outcome:"success"});
  assert.equal(completed.record.pendingWakeReasons.length,0);
  assert.equal(queue.claimNext({workerId:"worker-c"}).reason,"empty");
});

test("queue is priority ordered rather than user-count ordered",()=>{
  const queue=createDurableInvestigationQueue({root:tempRoot()});
  const low=request(queue,1,{jurisdiction:"BR/STATE/A",priority:1});
  const high=request(queue,2,{jurisdiction:"BR/STATE/B",priority:90});
  const claimed=queue.claimNext({workerId:"worker-a"});
  assert.equal(claimed.record.investigationId,high.record.investigationId);
  assert.notEqual(claimed.record.investigationId,low.record.investigationId);
});

test("state transition and publication gate survive restart",()=>{
  const root=tempRoot();
  let queue=createDurableInvestigationQueue({root});
  const initial=request(queue,1);
  assert.throws(()=>queue.transition(initial.record.investigationId,"PUBLICABLE"),/INVALID_TRANSITION/);
  for(const state of ["TRIAGE","COLLECTION","ANALYSIS","ADVERSARIAL_VERIFICATION","HUMAN_REVIEW"]){
    queue.transition(initial.record.investigationId,state);
  }
  assert.throws(()=>queue.transition(initial.record.investigationId,"PUBLICABLE"),/HUMAN_REVIEW_REQUIRED/);
  queue=createDurableInvestigationQueue({root});
  const published=queue.transition(initial.record.investigationId,"PUBLICABLE",{humanReviewed:true});
  assert.equal(published.state,"PUBLICABLE");
});

test("unsafe raw or secret-like contribution references fail closed",()=>{
  const queue=createDurableInvestigationQueue({root:tempRoot()});
  const initial=request(queue,1);
  assert.throws(()=>queue.contribute(initial.record.investigationId,{participantRef:"human-2",kind:"PUBLIC_SOURCE",reference:"data:text/plain;base64,AAAA"}),/UNSAFE/);
  assert.throws(()=>queue.contribute(initial.record.investigationId,{participantRef:"human-2",kind:"PUBLIC_SOURCE",reference:"access_token=not-allowed"}),/SECRET_LIKE/);
});

test("active record lock fails closed and stale lock is recovered",()=>{
  const root=tempRoot();
  let current=new Date("2026-09-20T12:00:00Z");
  const queue=createDurableInvestigationQueue({root,clock:()=>current,lockStaleMs:1000});
  const {investigationId}=canonicalInvestigationId(scope());
  const locks=path.join(root,"locks");
  fs.mkdirSync(locks,{recursive:true});
  const lock=path.join(locks,investigationId+".lock");
  fs.writeFileSync(lock,"locked\n");
  fs.utimesSync(lock,current,current);
  assert.throws(()=>request(queue,1),/BUSY/);

  fs.utimesSync(lock,new Date("2020-01-01T00:00:00Z"),new Date("2020-01-01T00:00:00Z"));
  const recovered=request(queue,1);
  assert.equal(recovered.created,true);
});
