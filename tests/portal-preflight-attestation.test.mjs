import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPortalIsolatedPreflightAttestation,
  verifyPortalPreflightBinding
} from "../src/investigation/portal-preflight-attestation.mjs";

const base=()=>({
  revision:"a".repeat(40),
  scopeHash:"b".repeat(64),
  documentCodeSha256:"c".repeat(64),
  credentialFingerprintSha256:"d".repeat(64),
  credentialProvenance:"OFFICIAL_EMAIL_REGISTRATION",
  credentialReceivedAt:"2026-01-15T12:34:56.000Z",
  custodyRepositoryHash:"e".repeat(64),
  custodyBranch:"main"
});

test("M5-E gera atestação determinística e sanitizada",()=>{
  const one=buildPortalIsolatedPreflightAttestation(base());
  const two=buildPortalIsolatedPreflightAttestation(base());
  assert.equal(one.preflightSha256,two.preflightSha256);
  assert.equal(one.status,"READY_FOR_EXPLICIT_AUTHORIZATION");
  assert.equal(one.portalNetworkUsed,false);
  assert.equal(one.portalNetworkAuthorized,false);
  assert.equal(one.portalRequestCapabilityPresent,false);
  assert.equal(one.automaticRetryAuthorized,false);
  assert.equal(one.humanAuthorizationRequired,true);
  assert.equal(one.tokenIncluded,false);
  assert.equal(one.rawDocumentCodeIncluded,false);
});

test("M5-E vincula preflight e fingerprint exatos",()=>{
  const attestation=buildPortalIsolatedPreflightAttestation(base());
  const verified=verifyPortalPreflightBinding({
    attestation,
    expectedPreflightSha256:attestation.preflightSha256,
    expectedCredentialFingerprintSha256:attestation.credentialFingerprintSha256
  });
  assert.equal(verified.preflightSha256,attestation.preflightSha256);
});

test("M5-E invalida autorização se revision, scope, documento, token ou cofre mudarem",()=>{
  const original=buildPortalIsolatedPreflightAttestation(base());
  const mutations=[
    {revision:"f".repeat(40)},
    {scopeHash:"1".repeat(64)},
    {documentCodeSha256:"2".repeat(64)},
    {credentialFingerprintSha256:"3".repeat(64)},
    {custodyRepositoryHash:"4".repeat(64)},
    {custodyBranch:"rotated"}
  ];
  for(const mutation of mutations){
    const changed=buildPortalIsolatedPreflightAttestation({...base(),...mutation});
    assert.notEqual(changed.preflightSha256,original.preflightSha256);
  }
});

test("M5-E falha fechado em hashes esperados divergentes",()=>{
  const attestation=buildPortalIsolatedPreflightAttestation(base());
  assert.throws(()=>verifyPortalPreflightBinding({
    attestation,
    expectedPreflightSha256:"0".repeat(64),
    expectedCredentialFingerprintSha256:attestation.credentialFingerprintSha256
  }),/BINDING_HASH_MISMATCH/);
  assert.throws(()=>verifyPortalPreflightBinding({
    attestation,
    expectedPreflightSha256:attestation.preflightSha256,
    expectedCredentialFingerprintSha256:"0".repeat(64)
  }),/BINDING_CREDENTIAL_MISMATCH/);
});

test("M5-E não aceita proveniência não oficial",()=>{
  assert.throws(()=>buildPortalIsolatedPreflightAttestation({
    ...base(),
    credentialProvenance:"GOVBR_LOGIN"
  }),/PROVENANCE_INVALID/);
});
