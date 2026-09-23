import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("workflow M5-H transporta apenas artefato existente e não toca no Portal",()=>{
  const wf=fs.readFileSync(".github/workflows/arca-m5-custodial-normalization.yml","utf8");
  assert.match(wf,/run-id: 35917902630/);
  assert.match(wf,/portal-related-documents-35917902630/);
  assert.match(wf,/ARCA_PORTAL_CUSTODY_PASSPHRASE/);
  assert.doesNotMatch(wf,/ARCA_PORTAL_API_KEY/);
  assert.doesNotMatch(wf,/api\.portaldatransparencia\.gov\.br/);
  assert.doesNotMatch(wf,/curl .*portaldatransparencia/);
  assert.match(wf,/Persistir envelope normalizado no cofre privado/);
  assert.match(wf,/Publicar somente prova sanitizada/);
  assert.doesNotMatch(wf,/portal-normalization\.envelope\.json\n\s+artifacts\/normalized\/private-store-receipt/);
});
