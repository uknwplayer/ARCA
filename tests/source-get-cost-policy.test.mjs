import test from "node:test";
import assert from "node:assert/strict";
import {evaluateGetCostPolicy,GET_COST_CLASSES} from "../src/investigation/source-get-cost-policy.mjs";

test("GET sem custo monetário observado pode executar sem autorização humana",()=>{
  const p=evaluateGetCostPolicy({
    method:"GET",
    costClass:GET_COST_CLASSES.NO_MONETARY_CHARGE_OBSERVED,
    evidenceRef:"pncp-manual-v2.6-public-consultation"
  });
  assert.equal(p.executionState,"AUTO_EXECUTION_ALLOWED");
  assert.equal(p.humanAuthorizationRequired,false);
  assert.equal(p.autoExecutionAllowed,true);
});

test("GET com custo monetário exige autorização humana",()=>{
  const p=evaluateGetCostPolicy({
    method:"GET",
    costClass:GET_COST_CLASSES.MONETARY_COST
  });
  assert.equal(p.executionState,"AWAITING_HUMAN_COST_AUTHORIZATION");
  assert.equal(p.humanAuthorizationRequired,true);
  assert.equal(p.autoExecutionAllowed,false);
});

test("GET com custo desconhecido fica bloqueado até classificar cobrança, sem pedir autorização prematura",()=>{
  const p=evaluateGetCostPolicy({
    method:"GET",
    costClass:GET_COST_CLASSES.UNKNOWN
  });
  assert.equal(p.executionState,"HOLD_FOR_COST_CLASSIFICATION");
  assert.equal(p.humanAuthorizationRequired,false);
  assert.equal(p.autoExecutionAllowed,false);
  assert.equal(p.blockedPendingCostClassification,true);
});

test("política de custo não governa métodos mutáveis",()=>{
  assert.throws(
    ()=>evaluateGetCostPolicy({method:"POST",costClass:GET_COST_CLASSES.NO_MONETARY_CHARGE_OBSERVED}),
    /METHOD_NOT_GET/
  );
});
