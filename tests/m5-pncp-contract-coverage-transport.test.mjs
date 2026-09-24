import test from "node:test";
import assert from "node:assert/strict";
import {buildM5PncpContractCoveragePlan} from "../src/investigation/m5-pncp-contract-coverage-plan.mjs";
import {createM5PncpContractCoverageTransport} from "../src/investigation/m5-pncp-contract-coverage-transport.mjs";

function record(i){
  return {
    schema:"arca.m5-pncp-live-parser.v1",
    recordRef:`pncp:control:sha256:${String(i).repeat(64).slice(0,64)}`,
    procurementControlNumber:`1234567800019${i}-1-${i}/2026`,
    agencyIdentifier:{namespace:"CNPJ",value:`1234567800019${i}`},
    year:2026,sequence:i,supplierObserved:false,identityInferencesMade:false
  };
}

test("M5-M transport executa exatamente 2 GETs allowlisted e zero retry",async()=>{
  const plan=buildM5PncpContractCoveragePlan({records:[record(1),record(2)]});
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify([{numeroControlePNCPCompra:"X"}]),{
      status:200,headers:{"content-type":"application/json"}
    });
  };
  const out=await createM5PncpContractCoverageTransport({fetchImpl}).executePlan(plan);
  assert.equal(out.requestCount,2);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.method,"GET");
  assert.equal(calls[1].options.method,"GET");
  assert.match(calls[0].url,/^https:\/\/pncp\.gov\.br\/api\/pncp\/v1\/orgaos\/\d{14}\/contratos\/contratacao\/2026\/1\?pagina=1$/);
  assert.match(calls[1].url,/\/2026\/2\?pagina=1$/);
  assert.equal(out.results[0].status,200);
  assert.equal(out.results[1].status,200);
});

test("M5-M transport não repete request após erro de rede",async()=>{
  const plan=buildM5PncpContractCoveragePlan({records:[record(1),record(2)]});
  let calls=0;
  const fetchImpl=async()=>{calls+=1;throw new Error("boom")};
  await assert.rejects(
    ()=>createM5PncpContractCoverageTransport({fetchImpl}).executePlan(plan),
    /NETWORK_ERROR/
  );
  assert.equal(calls,1);
});

test("M5-M transport captura HTTP não-2xx sem retry",async()=>{
  const plan=buildM5PncpContractCoveragePlan({records:[record(1),record(2)]});
  let calls=0;
  const fetchImpl=async()=>{
    calls+=1;
    return new Response("[]",{status:404,headers:{"content-type":"application/json"}});
  };
  const out=await createM5PncpContractCoverageTransport({fetchImpl}).executePlan(plan);
  assert.equal(calls,2);
  assert.equal(out.results[0].status,404);
  assert.equal(out.results[0].ok,false);
  assert.equal(out.results[1].status,404);
});


test("M5-M transport falha fechado se query divergir de pagina=1",async()=>{
  const plan=buildM5PncpContractCoveragePlan({records:[record(1),record(2)]});
  const bad={...plan,targets:[
    {...plan.targets[0],query:{pagina:2}},
    plan.targets[1]
  ]};
  let calls=0;
  await assert.rejects(
    ()=>createM5PncpContractCoverageTransport({
      fetchImpl:async()=>{calls+=1;return new Response("[]",{status:200})}
    }).executePlan(bad),
    /TARGET_INVALID/
  );
  assert.equal(calls,0);
});
