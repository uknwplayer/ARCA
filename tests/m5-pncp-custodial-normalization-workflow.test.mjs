import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("PNCP normalization workflow transports historical custody without source GET",()=>{
  const wf=fs.readFileSync(".github/workflows/arca-m5-pncp-custodial-normalization.yml","utf8");
  assert.match(wf,/run-id: 35547609136/);
  assert.match(wf,/pncp-controlled-live-proof-35547609136/);
  assert.match(wf,/ARCA_PNCP_CUSTODY_PASSPHRASE/);
  assert.doesNotMatch(wf,/PNCP_PUBLIC_GET_ONLY/);
  assert.doesNotMatch(wf,/ARCA_PNCP_LIVE_UF/);
  assert.doesNotMatch(wf,/pncp\.gov\.br\/api/);
  assert.match(wf,/Persistir envelope PNCP normalizado no cofre privado/);
  assert.match(wf,/Publicar somente prova PNCP sanitizada/);
});

test("PNCP normalization authorization keeps GET, publication and correlation disabled",()=>{
  const auth=JSON.parse(fs.readFileSync("config/m5-pncp-normalization-authorization.json","utf8"));
  assert.equal(auth.authorizationBasis,"operator-general-continuation-current-chat");
  assert.equal(auth.constraints.newPncpGetAuthorized,false);
  assert.equal(auth.constraints.publicationAuthorized,false);
  assert.equal(auth.constraints.correlationAuthorized,false);
  assert.match(auth.parserContractSha256,/^[a-f0-9]{64}$/);
});
