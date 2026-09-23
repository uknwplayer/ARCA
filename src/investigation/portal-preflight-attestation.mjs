import {sha256} from "./public-source-contract.mjs";

export const PORTAL_ISOLATED_PREFLIGHT_SCHEMA="arca.portal-isolated-preflight.v1";

function text(value,code,max=256){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/.test(out))throw new Error(code);
  return out;
}
function hex(value,length,code){
  const out=String(value??"").trim().toLowerCase();
  if(!new RegExp(`^[a-f0-9]{${length}}$`).test(out))throw new Error(code);
  return out;
}
function instant(value){
  const out=text(value,"ARCA_PORTAL_PREFLIGHT_RECEIVED_AT_INVALID",64);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(out))
    throw new Error("ARCA_PORTAL_PREFLIGHT_RECEIVED_AT_INVALID");
  return out;
}

export function buildPortalIsolatedPreflightAttestation({
  revision,
  scopeHash,
  documentCodeSha256,
  credentialFingerprintSha256,
  credentialProvenance,
  credentialReceivedAt,
  custodyRepositoryHash,
  custodyBranch
}={}){
  const provenance=text(credentialProvenance,"ARCA_PORTAL_PREFLIGHT_PROVENANCE_INVALID",80);
  if(provenance!=="OFFICIAL_EMAIL_REGISTRATION")
    throw new Error("ARCA_PORTAL_PREFLIGHT_PROVENANCE_INVALID");
  const base={
    schema:PORTAL_ISOLATED_PREFLIGHT_SCHEMA,
    version:1,
    status:"READY_FOR_EXPLICIT_AUTHORIZATION",
    revision:hex(revision,40,"ARCA_PORTAL_PREFLIGHT_REVISION_INVALID"),
    scopeHash:hex(scopeHash,64,"ARCA_PORTAL_PREFLIGHT_SCOPE_HASH_INVALID"),
    documentCodeSha256:hex(documentCodeSha256,64,"ARCA_PORTAL_PREFLIGHT_DOCUMENT_HASH_INVALID"),
    credentialFingerprintSha256:hex(
      credentialFingerprintSha256,64,"ARCA_PORTAL_PREFLIGHT_CREDENTIAL_FINGERPRINT_INVALID"
    ),
    credentialProvenance:provenance,
    credentialReceivedAt:instant(credentialReceivedAt),
    credentialActiveState:"ACTIVE_UNKNOWN",
    credentialActiveVerified:false,
    custodyReady:true,
    custodyPrivate:true,
    custodyRepositoryHash:hex(
      custodyRepositoryHash,64,"ARCA_PORTAL_PREFLIGHT_CUSTODY_REPOSITORY_HASH_INVALID"
    ),
    custodyBranch:text(custodyBranch,"ARCA_PORTAL_PREFLIGHT_CUSTODY_BRANCH_INVALID",160),
    portalNetworkUsed:false,
    portalNetworkAuthorized:false,
    portalRequestCapabilityPresent:false,
    automaticRetryAuthorized:false,
    humanAuthorizationRequired:true,
    tokenIncluded:false,
    rawDocumentCodeIncluded:false
  };
  return Object.freeze({...base,preflightSha256:sha256(base)});
}

export function verifyPortalPreflightBinding({
  attestation,
  expectedPreflightSha256,
  expectedCredentialFingerprintSha256
}={}){
  if(!attestation||attestation.schema!==PORTAL_ISOLATED_PREFLIGHT_SCHEMA)
    throw new Error("ARCA_PORTAL_PREFLIGHT_ATTESTATION_INVALID");
  const rebuilt=buildPortalIsolatedPreflightAttestation(attestation);
  if(rebuilt.preflightSha256!==attestation.preflightSha256)
    throw new Error("ARCA_PORTAL_PREFLIGHT_ATTESTATION_INTEGRITY_INVALID");
  const expectedPreflight=hex(
    expectedPreflightSha256,64,"ARCA_PORTAL_PREFLIGHT_BINDING_HASH_REQUIRED"
  );
  const expectedCredential=hex(
    expectedCredentialFingerprintSha256,64,"ARCA_PORTAL_PREFLIGHT_BINDING_CREDENTIAL_REQUIRED"
  );
  if(rebuilt.preflightSha256!==expectedPreflight)
    throw new Error("ARCA_PORTAL_PREFLIGHT_BINDING_HASH_MISMATCH");
  if(rebuilt.credentialFingerprintSha256!==expectedCredential)
    throw new Error("ARCA_PORTAL_PREFLIGHT_BINDING_CREDENTIAL_MISMATCH");
  return rebuilt;
}
