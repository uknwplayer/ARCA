import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const path=".github/workflows/arca-portal-live-authorization-001.yml";
const workflow=fs.readFileSync(path,"utf8");

test("Portal authorization 001 is restricted to issue #97 and exact creator token",()=>{
  assert.match(workflow,/issue_comment:/);
  assert.match(workflow,/github\.event\.issue\.number == 97/);
  assert.match(workflow,/github\.event\.issue\.state == 'open'/);
  assert.match(workflow,/github\.event\.comment\.user\.login == 'uknwplayer'/);
  assert.match(workflow,/ARCA_PORTAL_LIVE_AUTHORIZATION_001_EXECUTE/);
});

test("Portal authorization 001 pins reviewed revision and scope",()=>{
  assert.match(workflow,/3e05951fa543f359451208cf410705a0dcfb34e1/);
  assert.match(workflow,/4a2c6b3809f6b17ae5ca5e94c965ef02e148a6fe31e429e889c71f97d183b8a3/);
  assert.match(workflow,/PORTAL_DOCUMENT_GET_ONLY/);
  assert.match(workflow,/--preflight-only/);
});

test("Portal authorization 001 does not expose raw document code and uses required secrets",()=>{
  assert.doesNotMatch(workflow,/158154264392024OB001951/);
  assert.match(workflow,/secrets\.ARCA_PORTAL_DOCUMENT_CODE/);
  assert.match(workflow,/secrets\.ARCA_PORTAL_API_KEY/);
  assert.match(workflow,/secrets\.ARCA_PORTAL_CUSTODY_PASSPHRASE/);
  assert.match(workflow,/secrets\.ARCA_CUSTODY_VAULT_REPOSITORY/);
  assert.match(workflow,/secrets\.ARCA_CUSTODY_VAULT_TOKEN/);
  assert.match(workflow,/persist-credentials:\s*false/);
});

test("Portal authorization 001 has no schedule, push or pull-request trigger",()=>{
  assert.doesNotMatch(workflow,/^\s+(schedule|push|pull_request|workflow_dispatch):/m);
  assert.match(workflow,/cancel-in-progress:\s*false/);
});
