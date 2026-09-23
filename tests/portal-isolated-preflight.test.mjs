import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {runPortalIsolatedPreflight} from "../scripts/arca-portal-isolated-preflight.mjs";

const apiKey="synthetic-portal-api-key-0123456789";
const documentCode="175004000012023NS000917";
const revision="a".repeat(40);

function env(overrides={}){
  return {
    ARCA_PORTAL_PREFLIGHT_CONFIRMATION:"PORTAL_PREFLIGHT_ONLY",
    ARCA_PORTAL_DOCUMENT_CODE:documentCode,
    ARCA_PORTAL_API_KEY:apiKey,
    ARCA_PORTAL_TOKEN_PROVENANCE:"OFFICIAL_EMAIL_REGISTRATION",
    ARCA_PORTAL_TOKEN_RECEIVED_AT:"2026-01-15T12:34:56.000Z",
    ARCA_CUSTODY_VAULT_REPOSITORY:"uknwplayer/arca-private-vault",
    ARCA_CUSTODY_VAULT_TOKEN:"synthetic-vault-token-0123456789",
    ARCA_CUSTODY_VAULT_BRANCH:"main",
    GITHUB_REPOSITORY:"uknwplayer/ARCA",
    GITHUB_SHA:revision,
    ...overrides
  };
}

function custody(){
  return {
    async preflight(){
      return {
        ready:true,
        private:true,
        repositoryHash:"b".repeat(64),
        branch:"main",
        headSha:"c".repeat(40)
      };
    }
  };
}

test("preflight isolado valida prontidão sem capability de request Portal",async()=>{
  const result=await runPortalIsolatedPreflight({
    env:env(),
    durableCustodyBackend:custody()
  });
  assert.equal(result.status,"READY_FOR_EXPLICIT_AUTHORIZATION");
  assert.equal(result.credentialActiveState,"ACTIVE_UNKNOWN");
  assert.equal(result.credentialActiveVerified,false);
  assert.equal(result.portalNetworkUsed,false);
  assert.equal(result.portalNetworkAuthorized,false);
  assert.equal(result.portalRequestCapabilityPresent,false);
  assert.equal(result.automaticRetryAuthorized,false);
  assert.equal(result.humanAuthorizationRequired,true);
  assert.equal(result.tokenIncluded,false);
  assert.equal(result.rawDocumentCodeIncluded,false);
  assert.match(result.scopeHash,/^[a-f0-9]{64}$/);
  assert.match(result.credentialFingerprintSha256,/^[a-f0-9]{64}$/);
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes(apiKey),false);
  assert.equal(serialized.includes(documentCode),false);
});

test("preflight isolado falha fechado antes de custódia quando metadados são inválidos",async()=>{
  let calls=0;
  const backend={async preflight(){calls+=1;return {ready:true,private:true}}};
  for(const overrides of [
    {ARCA_PORTAL_PREFLIGHT_CONFIRMATION:""},
    {ARCA_PORTAL_API_KEY:"short"},
    {ARCA_PORTAL_TOKEN_PROVENANCE:"GOVBR_LOGIN"},
    {ARCA_PORTAL_TOKEN_RECEIVED_AT:""},
    {GITHUB_SHA:"bad"}
  ]){
    await assert.rejects(()=>runPortalIsolatedPreflight({
      env:env(overrides),
      durableCustodyBackend:backend
    }));
  }
  assert.equal(calls,0);
});

test("preflight isolado recusa cofre não privado ou indisponível",async()=>{
  await assert.rejects(()=>runPortalIsolatedPreflight({
    env:env(),
    durableCustodyBackend:{async preflight(){return {ready:false,private:false}}}
  }),/CUSTODY_NOT_READY/);
});

test("script isolado não importa transporte nem contém endpoint Portal",()=>{
  const script=fs.readFileSync("scripts/arca-portal-isolated-preflight.mjs","utf8");
  assert.doesNotMatch(script,/portal-related-documents-transport/);
  assert.doesNotMatch(script,/fetchRelatedDocuments/);
  assert.doesNotMatch(script,/api\.portaldatransparencia\.gov\.br/);
});

test("workflow isolado não contém etapa de captura nem endpoint Portal",()=>{
  const workflow=fs.readFileSync(".github/workflows/arca-portal-isolated-preflight.yml","utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/arca-portal-isolated-preflight\.mjs/);
  assert.doesNotMatch(workflow,/arca-portal-related-documents-live-probe\.mjs/);
  assert.doesNotMatch(workflow,/api\.portaldatransparencia\.gov\.br/);
  assert.doesNotMatch(workflow,/PORTAL_DOCUMENT_GET_ONLY/);
  assert.doesNotMatch(workflow,/Capture|Capturar uma única resposta|fetchRelatedDocuments/);
  assert.match(workflow,/secrets\.ARCA_PORTAL_API_KEY/);
  assert.match(workflow,/inputs\.token_received_at/);
});
