import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPortalCredentialReadiness,
  observePortalCredentialOutcome,
  PORTAL_CREDENTIAL_PROVENANCE
} from "../src/investigation/portal-credential-readiness.mjs";

const apiKey="synthetic-portal-api-key-0123456789";

test("M5-D cria prontidão sanitizada sem revelar token",()=>{
  const readiness=assessPortalCredentialReadiness({
    apiKey,
    provenance:PORTAL_CREDENTIAL_PROVENANCE,
    receivedAt:"2026-09-23T11:00:00.000Z"
  });
  assert.equal(readiness.activeState,"ACTIVE_UNKNOWN");
  assert.equal(readiness.activeVerified,false);
  assert.equal(readiness.networkUsed,false);
  assert.equal(readiness.networkAuthorized,false);
  assert.equal(readiness.readyForExplicitAuthorization,true);
  assert.equal(readiness.tokenIncluded,false);
  assert.match(readiness.credentialFingerprintSha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(readiness).includes(apiKey),false);
});

test("M5-D fingerprint distingue credenciais sem armazená-las",()=>{
  const a=assessPortalCredentialReadiness({
    apiKey,
    provenance:PORTAL_CREDENTIAL_PROVENANCE,
    receivedAt:"2026-09-23T11:00:00.000Z"
  });
  const b=assessPortalCredentialReadiness({
    apiKey:"another-synthetic-portal-api-key-987654321",
    provenance:PORTAL_CREDENTIAL_PROVENANCE,
    receivedAt:"2026-09-23T11:00:00.000Z"
  });
  assert.notEqual(a.credentialFingerprintSha256,b.credentialFingerprintSha256);
});

test("M5-D recusa proveniência ou metadado incompleto antes de rede",()=>{
  assert.throws(()=>assessPortalCredentialReadiness({
    apiKey,provenance:"GOVBR_LOGIN",receivedAt:"2026-09-23T11:00:00.000Z"
  }),/PROVENANCE_INVALID/);
  assert.throws(()=>assessPortalCredentialReadiness({
    apiKey,provenance:PORTAL_CREDENTIAL_PROVENANCE,receivedAt:""
  }),/RECEIVED_AT_INVALID/);
  assert.throws(()=>assessPortalCredentialReadiness({
    apiKey:"short",provenance:PORTAL_CREDENTIAL_PROVENANCE,receivedAt:"2026-09-23T11:00:00.000Z"
  }),/API_KEY_INVALID/);
});

test("M5-D 401 não prova token inválido nem autoriza retry",()=>{
  const readiness=assessPortalCredentialReadiness({
    apiKey,provenance:PORTAL_CREDENTIAL_PROVENANCE,receivedAt:"2026-09-23T11:00:00.000Z"
  });
  const observed=observePortalCredentialOutcome({readiness,httpStatus:401});
  assert.equal(observed.observationState,"AUTHORIZATION_NOT_ESTABLISHED");
  assert.equal(observed.activeVerified,false);
  assert.equal(observed.credentialInvalidProven,false);
  assert.equal(observed.retryAuthorized,false);
});

test("M5-D somente 2xx observado confirma aceitação naquela requisição",()=>{
  const readiness=assessPortalCredentialReadiness({
    apiKey,provenance:PORTAL_CREDENTIAL_PROVENANCE,receivedAt:"2026-09-23T11:00:00.000Z"
  });
  const ok=observePortalCredentialOutcome({readiness,httpStatus:200});
  assert.equal(ok.observationState,"ACCEPTED_ON_OBSERVED_REQUEST");
  assert.equal(ok.activeVerified,true);
  assert.equal(ok.credentialInvalidProven,false);

  const rate=observePortalCredentialOutcome({readiness,httpStatus:429});
  assert.equal(rate.observationState,"RATE_LIMITED_ACTIVE_UNKNOWN");
  assert.equal(rate.activeVerified,false);
});
