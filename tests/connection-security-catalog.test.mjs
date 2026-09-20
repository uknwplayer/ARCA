import test from "node:test";
import assert from "node:assert/strict";
import {getAgentConnectionCatalog} from "../packages/agent/src/connection-catalog.ts";

test("combined connection catalog always includes security notice and tutorials",()=>{
  const catalog=getAgentConnectionCatalog();
  assert.equal(catalog.format,"arca-agent-connection-catalog-v1");
  assert.equal(catalog.securityNotice.format,"arca-credential-security-notice-v1");
  assert.ok(catalog.securityNotice.guarantees.length>=5);
  assert.ok(catalog.securityNotice.userAudit.length>=4);
  assert.ok(catalog.securityNotice.limitations.length>=2);
  assert.ok(catalog.tutorials.length>=9);
  assert.ok(catalog.modes.length>=4);
  assert.equal(JSON.stringify(catalog).includes("TOP-SECRET"),false);
});

test("connection catalog filters tutorials without dropping security notice",()=>{
  const catalog=getAgentConnectionCatalog({provider:"openai"});
  assert.equal(catalog.tutorials.length,1);
  assert.equal(catalog.tutorials[0].id,"openai-api");
  assert.equal(catalog.securityNotice.title,"Como o ARCA protege suas credenciais");
});
