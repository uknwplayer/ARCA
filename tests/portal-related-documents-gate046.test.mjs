import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {derivePortalRelatedDocumentsScopeBinding} from "../scripts/arca-portal-related-documents-scope-hash.mjs";

const revision="a".repeat(40);
const documentCode="175004000012023NS000917";

test("Gate 046 deriva scope sem revelar documento bruto",()=>{
  const out=derivePortalRelatedDocumentsScopeBinding({
    env:{GITHUB_SHA:revision,ARCA_PORTAL_DOCUMENT_CODE:documentCode}
  });
  assert.match(out.scopeSha256,/^[a-f0-9]{64}$/);
  assert.match(out.documentCodeSha256,/^[a-f0-9]{64}$/);
  assert.equal(out.revision,revision);
  assert.equal(JSON.stringify(out).includes(documentCode),false);
});

test("Gate 046 preflight por push não contém transporte live",()=>{
  const workflow=fs.readFileSync(".github/workflows/arca-portal-related-documents-preflight-push.yml","utf8");
  assert.match(workflow,/portal-preflight-related-documents-\*/);
  assert.match(workflow,/arca-portal-isolated-preflight\.mjs/);
  assert.doesNotMatch(workflow,/arca-portal-related-documents-live-probe\.mjs/);
  assert.doesNotMatch(workflow,/api\.portaldatransparencia\.gov\.br/);
});

test("Gate 046 live exige hashes completos no branch e revalida antes do GET",()=>{
  const workflow=fs.readFileSync(".github/workflows/arca-portal-related-documents-live-push.yml","utf8");
  assert.match(workflow,/portal-live-related-documents-p\(\[a-f0-9\]\{64\}\)-c\(\[a-f0-9\]\{64\}\)/);
  assert.match(workflow,/ARCA_PORTAL_PREFLIGHT_SHA256/);
  assert.match(workflow,/ARCA_PORTAL_CREDENTIAL_FINGERPRINT_SHA256/);
  assert.match(workflow,/arca-portal-related-documents-scope-hash\.mjs/);
  assert.match(workflow,/arca-portal-related-documents-live-probe\.mjs --preflight-only/);
  assert.match(workflow,/Executar exatamente um GET autorizado/);
  assert.match(workflow,/retention-days: 7/);
});

test("Gate 046 helper falha fechado em revisão ou documento inválido",()=>{
  assert.throws(()=>derivePortalRelatedDocumentsScopeBinding({
    env:{GITHUB_SHA:"bad",ARCA_PORTAL_DOCUMENT_CODE:documentCode}
  }),/REVISION/);
  assert.throws(()=>derivePortalRelatedDocumentsScopeBinding({
    env:{GITHUB_SHA:revision,ARCA_PORTAL_DOCUMENT_CODE:"bad code"}
  }));
});
