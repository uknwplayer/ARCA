import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {canonicalJson,sha256} from "../src/investigation/public-source-contract.mjs";
import {sealCustodyDirectory} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {buildM5PncpLiveNormalizedBinding} from "../src/investigation/m5-pncp-live-normalized-binding.mjs";
import {buildM5N1ItemDiscoveryPlan,buildM5N1ItemDiscoveryCandidate} from "../src/investigation/m5-n1-pncp-item-discovery-plan.mjs";
import {deriveM5N1ItemDiscovery} from "../src/investigation/m5-n1-pncp-item-discovery-private.mjs";
import {createM5N1ItemDiscoveryTransport} from "../src/investigation/m5-n1-pncp-item-discovery-transport.mjs";
import {observeM5N1ItemsResponse} from "../src/investigation/m5-n1-pncp-item-response.mjs";

const passphrase="synthetic-m5-n1-passphrase-0123456789";

function normalizedRecord(i){
  return {
    schema:"arca.m5-pncp-live-parser.v1",version:1,
    recordRef:`pncp:control:sha256:${String(i).repeat(64).slice(0,64)}`,
    procurementControlNumber:`1234567800019${i}-1-${i}/2026`,
    agencyIdentifier:{namespace:"CNPJ",value:`1234567800019${i}`},
    year:2026,sequence:i,supplierObserved:false,identityInferencesMade:false
  };
}

function setupPrivate(){
  const bindingInput={
    captureRunId:"1",captureRevision:"1".repeat(40),captureScopeSha256:"2".repeat(64),
    captureEnvelopeSha256:"3".repeat(64),captureReceiptSha256:"4".repeat(64),
    observedStructureSha256:"5".repeat(64),pageFileSha256:"6".repeat(64),
    parserContractSha256:"7".repeat(64),normalizationRunId:"2",
    executorRevision:"8".repeat(40),normalizationSha256:"9".repeat(64),
    normalizedEnvelopeSha256:"0".repeat(64),normalizedContentRootSha256:"a".repeat(64),
    normalizedStoreReceiptSha256:"b".repeat(64),proofSha256:"c".repeat(64),
    recordCount:2,supplierObserved:false
  };
  const binding=buildM5PncpLiveNormalizedBinding(bindingInput);
  const body={
    schema:"arca.m5-pncp-custodial-normalization.v1",
    parserContractSha256:binding.parser.contractSha256,
    observedStructureSha256:binding.capture.observedStructureSha256,
    sourceEnvelopeSha256:binding.capture.envelopeSha256,
    sourceReceiptSha256:binding.capture.receiptSha256,
    sourceScopeSha256:binding.capture.scopeSha256,
    pageFileSha256:binding.capture.pageFileSha256,
    recordCount:2,
    records:[normalizedRecord(1),normalizedRecord(2)]
  };
  const doc={...body,normalizationSha256:sha256(canonicalJson(body)),sourceCaptureRunId:"1"};
  bindingInput.normalizationSha256=doc.normalizationSha256;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"arca-m5n1-"));
  fs.writeFileSync(path.join(root,"normalized-private.json"),canonicalJson(doc)+"\n");
  const envelope=sealCustodyDirectory({
    root,passphrase,repository:"uknwplayer/ARCA",
    revision:"8".repeat(40),scopeHash:"2".repeat(64),sealedAt:"2026-09-24T18:30:00.000Z"
  });
  fs.rmSync(root,{recursive:true,force:true});
  bindingInput.normalizedEnvelopeSha256=sha256(JSON.stringify(envelope));
  return {envelope,bindingInput};
}

test("M5-N1 cria dois alvos de itens com pagina 1 e tamanho 10",()=>{
  const plan=buildM5N1ItemDiscoveryPlan({records:[normalizedRecord(1),normalizedRecord(2)]});
  assert.equal(plan.targetCount,2);
  assert.deepEqual(plan.targets.map(x=>x.query),[
    {pagina:1,tamanhoPagina:10},{pagina:1,tamanhoPagina:10}
  ]);
  assert.match(plan.targets[0].path,/\/compras\/2026\/1\/itens$/);
  assert.match(plan.targets[1].path,/\/compras\/2026\/2\/itens$/);
  assert.equal(plan.budgets.maxRequests,2);
  assert.equal(plan.budgets.retries,0);
  assert.equal(plan.nextStage.requiresCompleteItemCoverage,true);
});

test("M5-N1 candidato é hash-only e não expõe alvo privado",()=>{
  const plan=buildM5N1ItemDiscoveryPlan({records:[normalizedRecord(1),normalizedRecord(2)]});
  const c=buildM5N1ItemDiscoveryCandidate({
    plan,revision:"a".repeat(40),pncpBindingSha256:"b".repeat(64),
    screeningSha256:"c".repeat(64),m5mDiagnosisSha256:"d".repeat(64)
  });
  assert.equal(c.status,"READY_FOR_CONTROLLED_EXECUTION");
  assert.equal(c.privateTargetValuesIncluded,false);
  assert.equal(c.newPncpGetAuthorized,true);
  assert.equal(c.sourceNetworkAuthorized,true);
  assert.equal(c.humanAuthorizationRequired,false);
  assert.equal(c.getCostPolicy.autoExecutionAllowed,true);
  assert.equal(JSON.stringify(c).includes("12345678000191"),false);
  assert.equal(c.targetHashes.length,2);
});

test("M5-N1 deriva plano a partir da custódia PNCP normalizada",()=>{
  const {envelope,bindingInput}=setupPrivate();
  const out=deriveM5N1ItemDiscovery({
    envelope,passphrase,pncpBindingInput:bindingInput,
    expectedEnvelopeSha256:sha256(JSON.stringify(envelope)),
    screeningSha256:"d".repeat(64),m5mDiagnosisSha256:"e".repeat(64),
    revision:"f".repeat(40)
  });
  assert.equal(out.plan.targetCount,2);
  assert.equal(out.candidate.targetCount,2);
  assert.equal(JSON.stringify(out.candidate).includes("12345678000191"),false);
});

test("M5-N1 transporte usa exatamente dois GETs allowlisted",async()=>{
  const plan=buildM5N1ItemDiscoveryPlan({records:[normalizedRecord(1),normalizedRecord(2)]});
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({itens:[]}),{
      status:200,headers:{"content-type":"application/json"}
    });
  };
  const out=await createM5N1ItemDiscoveryTransport({fetchImpl}).executePlan(plan);
  assert.equal(out.requestCount,2);
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\?pagina=1&tamanhoPagina=10$/);
  assert.match(calls[1].url,/\?pagina=1&tamanhoPagina=10$/);
});

test("M5-N1 transporte falha fechado em query divergente antes da rede",async()=>{
  const plan=buildM5N1ItemDiscoveryPlan({records:[normalizedRecord(1),normalizedRecord(2)]});
  const bad={...plan,targets:[{...plan.targets[0],query:{pagina:1,tamanhoPagina:50}},plan.targets[1]]};
  let calls=0;
  await assert.rejects(
    ()=>createM5N1ItemDiscoveryTransport({fetchImpl:async()=>{calls+=1;return new Response("{}",{status:200})}}).executePlan(bad),
    /TARGET_INVALID/
  );
  assert.equal(calls,0);
});

test("M5-N1 observador permite próximo estágio somente com cobertura não cheia",()=>{
  const body=Buffer.from(JSON.stringify({itens:[
    {numeroItem:1,temResultado:true},
    {numeroItem:2,temResultado:false},
    {numeroItem:3,temResultado:true}
  ]}));
  const o=observeM5N1ItemsResponse({bytes:body,httpStatus:200,targetSha256:"a".repeat(64)});
  assert.equal(o.itemCount,3);
  assert.equal(o.itemsWithResultCount,2);
  assert.equal(o.pagePossiblyTruncated,false);
  assert.equal(o.nextStageReady,true);
  assert.match(o.resultItemSetSha256,/^[a-f0-9]{64}$/);
});

test("M5-N1 página cheia bloqueia M5-N2 por possível truncamento",()=>{
  const itens=Array.from({length:10},(_,i)=>({numeroItem:i+1,temResultado:i===0}));
  const body=Buffer.from(JSON.stringify({itens}));
  const o=observeM5N1ItemsResponse({bytes:body,httpStatus:200,targetSha256:"b".repeat(64)});
  assert.equal(o.itemCount,10);
  assert.equal(o.pagePossiblyTruncated,true);
  assert.equal(o.nextStageReady,false);
});


test("M5-N1 workflows preservam preflight privado e live hash-bound sem aprovação humana de GET gratuito",()=>{
  const pre=fs.readFileSync(".github/workflows/arca-m5-n1-pncp-item-discovery-preflight.yml","utf8");
  const live=fs.readFileSync(".github/workflows/arca-m5-n1-pncp-item-discovery-live.yml","utf8");
  assert.match(pre,/m5-n1-pncp-item-discovery-preflight-\*/);
  assert.match(pre,/prepare-m5-n1-pncp-item-discovery-preflight\.mjs/);
  assert.doesNotMatch(pre,/run-m5-n1-pncp-item-discovery-live\.mjs/);
  assert.match(live,/m5-n1-pncp-item-discovery-live-c\*/);
  assert.doesNotMatch(live,/PNCP_ITEM_DISCOVERY_GET_ONLY/);
  assert.match(live,/ARCA_M5_N1_CANDIDATE_SHA256/);
  assert.match(live,/Publicar somente prova sanitizada/);
  assert.match(live,/Limpar material privado/);
});


test("M5-N1 aplica política global: GET público sem custo não exige autorização humana",()=>{
  const plan=buildM5N1ItemDiscoveryPlan({records:[normalizedRecord(1),normalizedRecord(2)]});
  assert.equal(plan.getCostPolicy.costClass,"NO_MONETARY_CHARGE_OBSERVED");
  assert.equal(plan.getCostPolicy.autoExecutionAllowed,true);
  assert.equal(plan.humanAuthorizationRequired,false);
  assert.equal(plan.sourceNetworkAuthorized,true);
  assert.equal(plan.newPncpGetAuthorized,true);
});
