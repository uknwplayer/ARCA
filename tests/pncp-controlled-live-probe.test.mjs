import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runPncpControlledLiveProbe
} from "../scripts/arca-pncp-national-live-probe.mjs";
import {
  openCustodyEnvelope
} from "../src/machine-bridge/encrypted-custody-envelope.mjs";

const secret="pncp live custody secret for controlled proof 2026";
const revision="a6e955b6282f319171654e881ae0d736ce5ed65a";

function env(outputDir,overrides={}){
  return {
    ARCA_PNCP_CONFIRMATION:"PNCP_PUBLIC_GET_ONLY",
    ARCA_PNCP_CUSTODY_PASSPHRASE:secret,
    ARCA_PNCP_LIVE_UF:"SP",
    ARCA_PNCP_LIVE_DATE:"20260920",
    ARCA_PNCP_LIVE_MODALITY_ID:"6",
    ARCA_PNCP_LIVE_OUTPUT_DIR:outputDir,
    GITHUB_REPOSITORY:"uknwplayer/ARCA",
    GITHUB_SHA:revision,
    ...overrides
  };
}

function fakeFetch(counter){
  return async url=>{
    counter.calls+=1;
    const parsed=new URL(url);
    assert.equal(parsed.origin,"https://pncp.gov.br");
    assert.equal(parsed.pathname,"/api/consulta/v1/contratacoes/publicacao");
    assert.equal(parsed.searchParams.get("uf"),"SP");
    assert.equal(parsed.searchParams.get("pagina"),"1");
    assert.equal(parsed.searchParams.get("tamanhoPagina"),"10");
    const body=JSON.stringify({
      data:[{
        numeroControlePNCP:"12345678000195-1-000001/2026",
        orgaoEntidade:{cnpj:"12345678000195"},
        anoCompra:2026,
        sequencialCompra:1,
        objetoCompra:"raw fixture must remain encrypted",
        modalidadeId:6
      }],
      totalPaginas:1
    });
    return new Response(body,{status:200,headers:{"content-type":"application/json"}});
  };
}

test("controlled live probe uses one selected shard and seals custody",async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-live-output-"));
  const counter={calls:0};
  const result=await runPncpControlledLiveProbe({
    env:env(output),
    fetchImpl:fakeFetch(counter)
  });
  assert.equal(counter.calls,1);
  assert.equal(result.proof.status,"CAPTURED_AND_SEALED");
  assert.equal(result.proof.shardId,"BR-UF-SP");
  assert.equal(result.proof.scope.uf,"SP");
  assert.deepEqual(result.proof.budgets,{maxShards:1,maxPages:1,maxRecords:10,pageSize:10});
  assert.equal(result.proof.networkUsed,true);
  assert.equal(result.proof.classifierEmittedSignals,false);
  assert.equal(result.proof.investigationIngressUsed,false);
  assert.equal(result.proof.custody.encrypted,true);
  assert.equal(result.proof.custody.plaintextPublished,false);
  assert.ok(!JSON.stringify(result.proof).includes("raw fixture must remain encrypted"));

  const envelope=JSON.parse(fs.readFileSync(result.envelopePath,"utf8"));
  assert.ok(!JSON.stringify(envelope).includes("raw fixture must remain encrypted"));
  const payload=openCustodyEnvelope({envelope,passphrase:secret});
  const recovered=payload.files.map(file=>Buffer.from(file.data,"base64").toString("utf8")).join("\\n");
  assert.ok(recovered.includes("raw fixture must remain encrypted"));
});

test("missing exact confirmation fails before network",async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-live-output-"));
  const counter={calls:0};
  await assert.rejects(()=>runPncpControlledLiveProbe({
    env:env(output,{ARCA_PNCP_CONFIRMATION:"WRONG"}),
    fetchImpl:fakeFetch(counter)
  }),/NETWORK_NOT_AUTHORIZED/);
  assert.equal(counter.calls,0);
});

test("missing custody secret fails before network",async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-live-output-"));
  const counter={calls:0};
  await assert.rejects(()=>runPncpControlledLiveProbe({
    env:env(output,{ARCA_PNCP_CUSTODY_PASSPHRASE:""}),
    fetchImpl:fakeFetch(counter)
  }),/CUSTODY_SECRET/);
  assert.equal(counter.calls,0);
});

test("invalid UF fails before network",async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-live-output-"));
  const counter={calls:0};
  await assert.rejects(()=>runPncpControlledLiveProbe({
    env:env(output,{ARCA_PNCP_LIVE_UF:"ZZ"}),
    fetchImpl:fakeFetch(counter)
  }),/INVALID_UF/);
  assert.equal(counter.calls,0);
});


test("durable custody preflight happens before PNCP network and receipt is recorded",async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-live-output-"));
  const counter={calls:0};
  const durable={preflightCalls:0,persistCalls:0};
  const backend={
    async preflight(){
      durable.preflightCalls+=1;
      return {ready:true,private:true};
    },
    async persist({envelope,proof}){
      durable.persistCalls+=1;
      assert.equal(counter.calls,1);
      assert.equal(envelope.plaintextIncluded,false);
      assert.equal(proof.custody.plaintextPublished,false);
      return {
        status:"STORED",
        receiptHash:"5".repeat(64),
        vaultCommitSha:"6".repeat(40)
      };
    }
  };
  const result=await runPncpControlledLiveProbe({
    env:env(output,{ARCA_CUSTODY_DURABLE_REQUIRED:"true"}),
    fetchImpl:fakeFetch(counter),
    durableCustodyBackend:backend
  });
  assert.equal(durable.preflightCalls,1);
  assert.equal(durable.persistCalls,1);
  assert.equal(counter.calls,1);
  assert.equal(result.proof.durableCustody.required,true);
  assert.equal(result.proof.durableCustody.status,"STORED_PRIVATE");
  assert.equal(result.proof.durableCustody.receiptHash,"5".repeat(64));
  assert.match(result.proof.durableCustody.vaultCommitRefHash,/^[a-f0-9]{64}$/);
  assert.equal(result.proof.durableCustody.plaintextStored,false);
});

test("durable custody preflight failure blocks PNCP network",async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"arca-pncp-live-output-"));
  const counter={calls:0};
  const backend={
    async preflight(){return {ready:false,private:false}},
    async persist(){throw new Error("must not persist")}
  };
  await assert.rejects(()=>runPncpControlledLiveProbe({
    env:env(output,{ARCA_CUSTODY_DURABLE_REQUIRED:"true"}),
    fetchImpl:fakeFetch(counter),
    durableCustodyBackend:backend
  }),/DURABLE_PREFLIGHT_FAILED/);
  assert.equal(counter.calls,0);
});
