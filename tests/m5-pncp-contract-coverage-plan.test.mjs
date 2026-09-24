import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  M5_PNCP_CONTRACT_COVERAGE_ENDPOINT_ID,
  buildM5PncpContractCoveragePlan,
  buildM5PncpContractCoverageCandidate
} from "../src/investigation/m5-pncp-contract-coverage-plan.mjs";

function record(i){
  return {
    schema:"arca.m5-pncp-live-parser.v1",
    version:1,
    recordRef:`pncp:control:sha256:${String(i).repeat(64).slice(0,64)}`,
    procurementControlNumber:`1234567800019${i}-1-${i}/2026`,
    agencyIdentifier:{namespace:"CNPJ",value:`1234567800019${i}`},
    year:2026,
    sequence:i,
    supplierObserved:false,
    identityInferencesMade:false
  };
}

test("M5-M constrói exatamente um GET de contratos/empenhos por contratação",()=>{
  const plan=buildM5PncpContractCoveragePlan({records:[record(1),record(2)]});
  assert.equal(plan.targetCount,2);
  assert.equal(plan.endpointId,M5_PNCP_CONTRACT_COVERAGE_ENDPOINT_ID);
  assert.equal(plan.budgets.maxRequests,2);
  assert.equal(plan.budgets.retries,0);
  assert.deepEqual(plan.targets.map(x=>x.method),["GET","GET"]);
  assert.equal(plan.targets[0].path,"/api/pncp/v1/orgaos/12345678000191/contratos/contratacao/2026/1");
  assert.equal(plan.targets[1].path,"/api/pncp/v1/orgaos/12345678000192/contratos/contratacao/2026/2");
  assert.deepEqual(plan.targets[0].query,{pagina:1});
  assert.deepEqual(plan.targets[1].query,{pagina:1});
  assert.equal(plan.runtimeCompatibility.observedRequiredParameter,"pagina");
  assert.equal(plan.runtimeCompatibility.selectedValue,1);
  assert.equal(plan.expectedCoverage.supplierIdentifier,true);
  assert.equal(plan.expectedCoverage.procurementControlReference,true);
  assert.equal(plan.sourceNetworkAuthorized,false);
});

test("M5-M candidato público contém só hashes de alvos",()=>{
  const plan=buildM5PncpContractCoveragePlan({records:[record(1),record(2)]});
  const c=buildM5PncpContractCoverageCandidate({
    plan,
    revision:"a".repeat(40),
    pncpBindingSha256:"b".repeat(64),
    screeningSha256:"c".repeat(64)
  });
  assert.equal(c.status,"READY_FOR_EXPLICIT_SOURCE_AUTHORIZATION");
  assert.equal(c.targetCount,2);
  assert.equal(c.targetHashes.length,2);
  assert.equal(c.privateTargetValuesIncluded,false);
  assert.equal(c.sourceNetworkAuthorized,false);
  assert.equal(c.newPncpGetAuthorized,false);
  assert.equal(c.publicationAuthorized,false);
  assert.equal(c.correlationAuthorized,false);
  assert.match(c.candidateSha256,/^[a-f0-9]{64}$/);
  const serialized=JSON.stringify(c);
  assert.equal(serialized.includes("12345678000191"),false);
  assert.equal(serialized.includes("/contratos/contratacao/"),false);
});

test("M5-M vincula correção pagina=1 à evidência runtime observada",()=>{
  const plan=buildM5PncpContractCoveragePlan({records:[record(1),record(2)]});
  const message="Required request parameter 'pagina' for method parameter type Integer is not present";
  const observedHash=createHash("sha256").update(message).digest("hex");
  assert.equal(
    observedHash,
    "c1d6bb85779fbebfd285b2e31d103f4c4b97ccf8128403e5a1db6092833f6fc2"
  );
  assert.equal(plan.runtimeCompatibility.messageSha256,observedHash);
  assert.equal(plan.runtimeCompatibility.observedRequiredParameter,"pagina");
  assert.equal(plan.runtimeCompatibility.selectedValue,1);
  assert.deepEqual(plan.targets.map(x=>x.query),[{pagina:1},{pagina:1}]);
});

test("M5-M falha fechado em mais de 2 alvos, duplicata e cobertura incompatível",()=>{
  assert.throws(()=>buildM5PncpContractCoveragePlan({
    records:[record(1),record(2),record(3)]
  }),/RECORD_BUDGET_INVALID/);
  assert.throws(()=>buildM5PncpContractCoveragePlan({
    records:[record(1),record(1)]
  }),/DUPLICATE_TARGET/);
  assert.throws(()=>buildM5PncpContractCoveragePlan({
    records:[{...record(1),supplierObserved:true}]
  }),/PNCP_RECORD_INVALID/);
});
