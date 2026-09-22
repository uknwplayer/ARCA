import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflowPath=".github/workflows/arca-portal-related-documents-live-probe.yml";
const workflow=fs.readFileSync(new URL(`../${workflowPath}`,import.meta.url),"utf8");

test("Portal capture workflow is manual only and hides identifiers and credentials",()=>{
  assert.match(workflow,/^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^\s+(schedule|push|pull_request|repository_dispatch):/m);
  assert.match(workflow,/confirmation:/);
  assert.match(workflow,/scope_sha256:/);
  assert.doesNotMatch(workflow,/document_code:/);
  assert.match(workflow,/run-name:.*github\.run_id/);
  assert.doesNotMatch(workflow,/run-name:.*document_code/i);
  assert.match(workflow,/persist-credentials:\s*false/);
  assert.match(workflow,/secrets\.[A-Z0-9_]+/);
  assert.doesNotMatch(workflow,/--[a-z-]*(?:token|key|passphrase)/i);
  assert.match(workflow,/actions\/upload-artifact/);
  assert.match(workflow,/retention-days:\s*[1-9]\d*/);
  assert.match(workflow,/artifacts\/portal-related-documents\.envelope\.json/);
  assert.match(workflow,/artifacts\/portal-related-documents-proof\.json/);
  assert.doesNotMatch(workflow,/artifact-name:.*document_code/i);
  const artifactPaths=workflow.match(/artifacts\/[^\s]+/g)??[];
  assert.deepEqual([...new Set(artifactPaths)],[
    "artifacts/portal-related-documents.envelope.json",
    "artifacts/portal-related-documents-proof.json"
  ]);
});
