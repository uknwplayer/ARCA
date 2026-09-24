import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {canonicalJson,sha256} from "../src/investigation/public-source-contract.mjs";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {
  observeM5N1ItemsResponse,
  diagnoseM5N1ResponseShape
} from "../src/investigation/m5-n1-pncp-item-response.mjs";
import {observeM5N1CustodialEnvelope} from "../src/investigation/m5-n1-offline-custodial-observation.mjs";

const passphrase="synthetic-m5-n1-offline-passphrase-0123456789";
const h=b=>createHash("sha256").update(b).digest("hex");

function makeEnvelope({
  first=[{numeroItem:1,temResultado:true},{numeroItem:2,temResultado:false}],
  second=[{numeroItem:3,temResultado:true}],
  candidate="a".repeat(64),
  plan="b".repeat(64)
}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5n1-offline-"));
  const b1=Buffer.from(JSON.stringify(first));
  const b2=Buffer.from(JSON.stringify(second));
  const t1="1".repeat(64), t2="2".repeat(64);
  const f1=`items-1-${t1.slice(0,12)}.bin`;
  const f2=`items-2-${t2.slice(0,12)}.bin`;
  fs.writeFileSync(path.join(root,f1),b1);
  fs.writeFileSync(path.join(root,f2),b2);
  fs.writeFileSync(path.join(root,"capture-meta.json"),canonicalJson({
    candidateSha256:candidate,
    planSha256:plan,
    responses:[
      {targetSha256:t1,httpStatus:200,responseByteCount:b1.length,responseBytesSha256:h(b1)},
      {targetSha256:t2,httpStatus:200,responseByteCount:b2.length,responseBytesSha256:h(b2)}
    ]
  })+"\n");
  const envelope=sealCustodyDirectory({
    root,
    passphrase,
    repository:"uknwplayer/ARCA",
    revision:"c".repeat(40),
    scopeHash:plan,
    sealedAt:"2026-09-24T20:00:00.000Z"
  });
  fs.rmSync(root,{recursive:true,force:true});
  return {
    envelope,
    candidate,
    plan,
    targets:[
      {targetSha256:t1,fileName:f1,observedShapeSha256:diagnoseM5N1ResponseShape({bytes:b1,httpStatus:200,targetSha256:t1}).shapeSha256},
      {targetSha256:t2,fileName:f2,observedShapeSha256:diagnoseM5N1ResponseShape({bytes:b2,httpStatus:200,targetSha256:t2}).shapeSha256}
    ]
  };
}

test("M5-N1 aceita bare array runtime e preserva suporte ao objeto documentado",()=>{
  const bare=Buffer.from(JSON.stringify([
    {numeroItem:1,temResultado:true},
    {numeroItem:2,temResultado:false}
  ]));
  const a=observeM5N1ItemsResponse({bytes:bare,httpStatus:200,targetSha256:"a".repeat(64),pageSize:10});
  assert.equal(a.responseShape,"BARE_ARRAY");
  assert.equal(a.itemCount,2);
  assert.equal(a.itemsWithResultCount,1);

  const object=Buffer.from(JSON.stringify({itens:[
    {numeroItem:1,temResultado:true}
  ]}));
  const b=observeM5N1ItemsResponse({bytes:object,httpStatus:200,targetSha256:"b".repeat(64),pageSize:10});
  assert.equal(b.responseShape,"OBJECT_ITENS");
  assert.equal(b.itemCount,1);
  assert.equal(b.itemsWithResultCount,1);
});

test("M5-N1 observação custodial offline soma itens sem nova rede nem valores brutos",()=>{
  const s=makeEnvelope();
  const out=observeM5N1CustodialEnvelope({
    envelope:s.envelope,
    passphrase,
    expectedEnvelopeSha256:sha256(JSON.stringify(s.envelope)),
    expectedCandidateSha256:s.candidate,
    expectedPlanSha256:s.plan,
    expectedTargets:s.targets,
    pageSize:10
  });
  assert.equal(out.sourceRequestCount,0);
  assert.equal(out.sourceNetworkUsed,false);
  assert.equal(out.totalItems,3);
  assert.equal(out.totalItemsWithResult,2);
  assert.equal(out.coverageComplete,true);
  assert.equal(out.m5n2PreparationAllowed,true);
  assert.deepEqual(out.observations.map(x=>x.responseShape),["BARE_ARRAY","BARE_ARRAY"]);
  assert.equal(out.rawValuesIncluded,false);
  assert.equal(out.publicationAttempted,false);
  assert.equal(out.correlationAttempted,false);
  assert.match(out.observationSha256,/^[a-f0-9]{64}$/);
});

test("M5-N1 página cheia com 10 itens bloqueia preparação M5-N2",()=>{
  const full=Array.from({length:10},(_,i)=>({numeroItem:i+1,temResultado:i===0}));
  const s=makeEnvelope({first:full});
  const out=observeM5N1CustodialEnvelope({
    envelope:s.envelope,
    passphrase,
    expectedEnvelopeSha256:sha256(JSON.stringify(s.envelope)),
    expectedCandidateSha256:s.candidate,
    expectedPlanSha256:s.plan,
    expectedTargets:s.targets,
    pageSize:10
  });
  assert.equal(out.observations[0].pagePossiblyTruncated,true);
  assert.equal(out.coverageComplete,false);
  assert.equal(out.m5n2PreparationAllowed,false);
});

test("M5-N1 observação offline falha fechado em envelope/candidato/plano/shape divergentes",()=>{
  const s=makeEnvelope();
  const common={
    envelope:s.envelope,passphrase,
    expectedEnvelopeSha256:sha256(JSON.stringify(s.envelope)),
    expectedCandidateSha256:s.candidate,
    expectedPlanSha256:s.plan,
    expectedTargets:s.targets,
    pageSize:10
  };
  assert.throws(()=>observeM5N1CustodialEnvelope({
    ...common,expectedEnvelopeSha256:"f".repeat(64)
  }),/ENVELOPE_HASH_MISMATCH/);
  assert.throws(()=>observeM5N1CustodialEnvelope({
    ...common,expectedCandidateSha256:"d".repeat(64)
  }),/META_BINDING_INVALID/);
  assert.throws(()=>observeM5N1CustodialEnvelope({
    ...common,expectedPlanSha256:"e".repeat(64)
  }),/META_BINDING_INVALID/);
  assert.throws(()=>observeM5N1CustodialEnvelope({
    ...common,
    expectedTargets:[{...s.targets[0],observedShapeSha256:"f".repeat(64)},s.targets[1]]
  }),/SHAPE_HASH_MISMATCH/);
});

test("workflow offline M5-N1 não executa fonte PNCP",()=>{
  const wf=fs.readFileSync(".github/workflows/arca-m5-n1-offline-observation.yml","utf8");
  assert.match(wf,/m5-n1-offline-observation-\*/);
  assert.match(wf,/run-m5-n1-offline-observation\.mjs/);
  assert.doesNotMatch(wf,/run-m5-n1-pncp-item-discovery-live\.mjs/);
  assert.doesNotMatch(wf,/PNCP_ITEM_DISCOVERY_GET_ONLY/);
  assert.doesNotMatch(wf,/pncp\.gov\.br/);
});
