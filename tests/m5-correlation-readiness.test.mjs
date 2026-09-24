import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildM5CorrelationReadinessFromInputs,
  evaluateM5CorrelationReadiness
} from "../src/investigation/m5-correlation-readiness.mjs";
import {buildM5PortalLiveNormalizedBinding} from "../src/investigation/m5-portal-live-normalized-binding.mjs";
import {buildM5PncpLiveNormalizedBinding} from "../src/investigation/m5-pncp-live-normalized-binding.mjs";

function load(name){
  return JSON.parse(fs.readFileSync(path.join(process.cwd(),"config",name),"utf8"));
}
const portalInput=()=>load("m5-portal-live-normalized-binding-gate046.json");
const pncpInput=()=>load("m5-pncp-live-normalized-binding.json");

test("M5-K classifica readiness sem abrir valores privados",()=>{
  const gate=buildM5CorrelationReadinessFromInputs({
    portalInput:portalInput(),
    pncpInput:pncpInput()
  });
  assert.equal(gate.status,"LIMITED_CANDIDATE_SCREENING_ONLY");
  assert.equal(gate.readyForStrongCorrelation,false);
  assert.equal(gate.readyForPrivateCandidateScreening,true);
  assert.equal(gate.candidateScreeningRequiresPrivateValues,true);
  assert.equal(gate.supplierBridgeAvailable,false);
  assert.equal(gate.supplierInferenceAllowed,false);
  assert.equal(gate.networkUsed,false);
  assert.equal(gate.correlationAttempted,false);
  assert.equal(gate.correlationAuthorized,false);
  assert.match(gate.readinessSha256,/^[a-f0-9]{64}$/);
});

test("M5-K preserva fornecedor indisponivel por cobertura",()=>{
  const gate=buildM5CorrelationReadinessFromInputs({
    portalInput:portalInput(),
    pncpInput:pncpInput()
  });
  const supplier=gate.bridges.find(x=>x.id==="SUPPLIER_IDENTIFIER");
  assert.equal(supplier.classification,"UNAVAILABLE_BY_PNCP_COVERAGE");
  assert.equal(supplier.usable,false);
  assert.ok(gate.unavailableStrongBridges.includes("SUPPLIER_IDENTIFIER"));
});

test("M5-K separa dimensoes candidatas de contexto fraco",()=>{
  const gate=buildM5CorrelationReadinessFromInputs({
    portalInput:portalInput(),
    pncpInput:pncpInput()
  });
  assert.deepEqual(gate.candidateDimensions,["DOCUMENT_REFERENCE","AGENCY_TEXT"]);
  assert.deepEqual(gate.weakDimensions,["DATE","AMOUNT"]);
});

test("M5-K falha fechado se binding PNCP for adulterado",()=>{
  const p=portalInput(); delete p.schema;
  const n=pncpInput(); delete n.schema;
  const portal=buildM5PortalLiveNormalizedBinding(p);
  const pncp=buildM5PncpLiveNormalizedBinding(n);
  assert.throws(()=>evaluateM5CorrelationReadiness({
    portalBinding:portal,
    pncpBinding:{...pncp,correlationAuthorized:true}
  }),/INTEGRITY|STATE/);
});
