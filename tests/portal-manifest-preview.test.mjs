import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {buildPortalManifestPreview} from "../scripts/arca-portal-manifest-preview.mjs";

const revision="a".repeat(40);
const documentCode="175004000012023NS000917";
const env=()=>({
  ARCA_PORTAL_MANIFEST_CONFIRMATION:"PORTAL_MANIFEST_PREVIEW_ONLY",
  ARCA_PORTAL_DOCUMENT_CODE:documentCode,
  GITHUB_SHA:revision
});

test("offline Portal manifest preview exposes only hashed document scope",()=>{
  const preview=buildPortalManifestPreview({env:env()});
  assert.equal(preview.schema,"arca.portal-manifest-preview.v0.1");
  assert.equal(preview.status,"READY_FOR_REVIEW");
  assert.equal(preview.revision,revision);
  assert.equal(preview.scope.endpointId,"PORTAL_EXPENSE_RELATED_DOCUMENTS");
  assert.equal(preview.scope.phaseCode,3);
  assert.match(preview.scope.documentCodeSha256,/^[a-f0-9]{64}$/);
  assert.match(preview.scopeHash,/^[a-f0-9]{64}$/);
  assert.deepEqual(preview.budgets,{maxRequests:1,maxRecords:25,maxBytes:65536,timeoutMs:30000,retries:0});
  assert.equal(preview.networkAuthorized,false);
  assert.equal(preview.publicationAttempted,false);
  assert.equal(preview.rawDocumentCodeExposed,false);
  assert.equal(JSON.stringify(preview).includes(documentCode),false);
  assert.equal(buildPortalManifestPreview({env:env()}).scopeHash,preview.scopeHash);
});

test("preview refuses missing confirmation, invalid revision and ambiguous document code",()=>{
  assert.throws(()=>buildPortalManifestPreview({env:{...env(),ARCA_PORTAL_MANIFEST_CONFIRMATION:""}}),/CONFIRMATION/);
  assert.throws(()=>buildPortalManifestPreview({env:{...env(),GITHUB_SHA:"bad"}}),/REVISION/);
  assert.throws(()=>buildPortalManifestPreview({env:{...env(),ARCA_PORTAL_DOCUMENT_CODE:"bad\ncode"}}),/DOCUMENT_CODE/);
});

test("manifest preview workflow is manual-only and receives no API or custody credentials",()=>{
  const workflow=fs.readFileSync(new URL("../.github/workflows/arca-portal-manifest-preview.yml",import.meta.url),"utf8");
  assert.match(workflow,/^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^\s+(schedule|push|pull_request|repository_dispatch):/m);
  assert.match(workflow,/ARCA_PORTAL_DOCUMENT_CODE:\s*\$\{\{ secrets\.ARCA_PORTAL_DOCUMENT_CODE \}\}/);
  assert.doesNotMatch(workflow,/ARCA_PORTAL_API_KEY/);
  assert.doesNotMatch(workflow,/CUSTODY_PASSPHRASE|CUSTODY_VAULT_TOKEN|CUSTODY_VAULT_REPOSITORY/);
  assert.doesNotMatch(workflow,/curl|wget|fetch\(/);
  assert.match(workflow,/persist-credentials:\s*false/);
  assert.match(workflow,/portal-manifest-preview\.json/);
});
