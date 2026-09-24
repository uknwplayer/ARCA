import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {runM5PncpContractCoverageLive} from "../scripts/run-m5-pncp-contract-coverage-live.mjs";

test("M5-M preflight só transporta custódia privada e não autoriza PNCP GET",()=>{
  const wf=fs.readFileSync(".github/workflows/arca-m5-pncp-contract-coverage-preflight.yml","utf8");
  assert.match(wf,/m5-pncp-contract-coverage-preflight-\*/);
  assert.match(wf,/fetch-m5-private-screening-envelope\.mjs/);
  assert.match(wf,/prepare-m5-pncp-contract-coverage-preflight\.mjs/);
  assert.doesNotMatch(wf,/PNCP_CONTRACT_COVERAGE_GET_ONLY/);
  assert.doesNotMatch(wf,/run-m5-pncp-contract-coverage-live\.mjs/);
});

test("M5-M live exige candidate hash no branch e confirmação explícita",()=>{
  const wf=fs.readFileSync(".github/workflows/arca-m5-pncp-contract-coverage-live.yml","utf8");
  assert.match(wf,/m5-pncp-contract-coverage-live-c\*/);
  assert.match(wf,/\^m5-pncp-contract-coverage-live-c\(\[a-f0-9\]\{64\}\)\$/);
  assert.match(wf,/PNCP_CONTRACT_COVERAGE_GET_ONLY/);
  assert.match(wf,/ARCA_M5_M_CANDIDATE_SHA256/);
  assert.match(wf,/Publicar somente prova sanitizada/);
  assert.match(wf,/Limpar material privado/);
  assert.equal(typeof runM5PncpContractCoverageLive,"function");
});

test("M5-M live não contém autorização de correlação ou publicação",()=>{
  const wf=fs.readFileSync(".github/workflows/arca-m5-pncp-contract-coverage-live.yml","utf8");
  assert.doesNotMatch(wf,/CORRELATION_AUTHORIZED\s*:\s*true/i);
  assert.doesNotMatch(wf,/PUBLICATION_AUTHORIZED\s*:\s*true/i);
});
