import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow=fs.readFileSync(".github/workflows/arca-portal-related-documents-live-probe.yml","utf8");

test("workflow Portal exige metadados explícitos da credencial",()=>{
  assert.match(workflow,/token_provenance:/);
  assert.match(workflow,/token_received_at:/);
  assert.match(workflow,/ARCA_PORTAL_TOKEN_PROVENANCE:\s*\$\{\{ inputs\.token_provenance \}\}/);
  assert.match(workflow,/ARCA_PORTAL_TOKEN_RECEIVED_AT:\s*\$\{\{ inputs\.token_received_at \}\}/);
});

test("workflow Portal mantém token somente em secret",()=>{
  assert.match(workflow,/ARCA_PORTAL_API_KEY:\s*\$\{\{ secrets\.ARCA_PORTAL_API_KEY \}\}/);
  assert.doesNotMatch(workflow,/ARCA_PORTAL_API_KEY:\s*\$\{\{ inputs\./);
});

test("workflow Portal executa preflight antes da captura",()=>{
  const preflight=workflow.indexOf("--preflight-only");
  const capture=workflow.indexOf("Capturar uma única resposta limitada do Portal");
  assert.ok(preflight>=0);
  assert.ok(capture>preflight);
});

test("workflow Portal não adiciona schedule, push ou pull_request",()=>{
  assert.doesNotMatch(workflow,/^\s+(schedule|push|pull_request):/m);
  assert.match(workflow,/workflow_dispatch:/);
});
