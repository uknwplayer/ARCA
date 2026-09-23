import {createHash} from "node:crypto";
import {canonicalJson} from "./public-source-contract.mjs";

export const PORTAL_CREDENTIAL_READINESS_SCHEMA="arca.portal-credential-readiness.v1";
export const PORTAL_CREDENTIAL_OBSERVATION_SCHEMA="arca.portal-credential-observation.v1";
export const PORTAL_OFFICIAL_REGISTRATION_URL="https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email";
export const PORTAL_OFFICIAL_API_DOCS_URL="https://portaldatransparencia.gov.br/api-de-dados";
export const PORTAL_CREDENTIAL_PROVENANCE="OFFICIAL_EMAIL_REGISTRATION";

function sha256(value){
  return createHash("sha256").update(value).digest("hex");
}
function boundedText(value,code,max=512){
  const out=String(value??"").normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/.test(out))throw new Error(code);
  return out;
}
function validateApiKey(value){
  if(typeof value!=="string"||value.length<20||value.length>4096||
     value.trim()!==value||/[\s\u0000-\u001f\u007f]/u.test(value))
    throw new Error("ARCA_PORTAL_CREDENTIAL_API_KEY_INVALID");
  return value;
}
function isoInstant(value){
  const out=boundedText(value,"ARCA_PORTAL_CREDENTIAL_RECEIVED_AT_INVALID",64);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(out))
    throw new Error("ARCA_PORTAL_CREDENTIAL_RECEIVED_AT_INVALID");
  const parsed=new Date(out);
  if(Number.isNaN(parsed.getTime())||parsed.toISOString()!==
     (out.includes(".")?out:out.replace("Z",".000Z")))
    throw new Error("ARCA_PORTAL_CREDENTIAL_RECEIVED_AT_INVALID");
  return out;
}
function fingerprint(apiKey){
  return sha256(Buffer.concat([
    Buffer.from("arca.portal-api-key.v1\0","utf8"),
    Buffer.from(apiKey,"utf8")
  ]));
}

export function assessPortalCredentialReadiness({
  apiKey,
  provenance,
  receivedAt
}={}){
  const key=validateApiKey(apiKey);
  const source=boundedText(provenance,"ARCA_PORTAL_CREDENTIAL_PROVENANCE_REQUIRED",80);
  if(source!==PORTAL_CREDENTIAL_PROVENANCE)
    throw new Error("ARCA_PORTAL_CREDENTIAL_PROVENANCE_INVALID");
  const received=isoInstant(receivedAt);
  const base={
    schema:PORTAL_CREDENTIAL_READINESS_SCHEMA,
    version:1,
    provider:"PORTAL_DA_TRANSPARENCIA_GOVERNO_FEDERAL",
    registrationMechanism:"EMAIL_REGISTRATION",
    officialRegistrationUrl:PORTAL_OFFICIAL_REGISTRATION_URL,
    officialApiDocsUrl:PORTAL_OFFICIAL_API_DOCS_URL,
    provenance:source,
    receivedAt:received,
    credentialFingerprintSha256:fingerprint(key),
    credentialPresent:true,
    credentialFormatAccepted:true,
    activeState:"ACTIVE_UNKNOWN",
    activeVerified:false,
    networkUsed:false,
    networkAuthorized:false,
    readyForExplicitAuthorization:true,
    tokenIncluded:false,
    humanAuthorizationRequired:true
  };
  return Object.freeze({...base,readinessSha256:sha256(canonicalJson(base))});
}

export function observePortalCredentialOutcome({
  readiness,
  httpStatus
}={}){
  if(!readiness||readiness.schema!==PORTAL_CREDENTIAL_READINESS_SCHEMA||
     readiness.networkUsed!==false||readiness.networkAuthorized!==false||
     readiness.tokenIncluded!==false)
    throw new Error("ARCA_PORTAL_CREDENTIAL_READINESS_INVALID");
  if(!Number.isSafeInteger(httpStatus)||httpStatus<100||httpStatus>599)
    throw new Error("ARCA_PORTAL_CREDENTIAL_HTTP_STATUS_INVALID");

  let observationState="ACTIVE_NOT_VERIFIED";
  let activeVerified=false;
  if(httpStatus>=200&&httpStatus<=299){
    observationState="ACCEPTED_ON_OBSERVED_REQUEST";
    activeVerified=true;
  }else if(httpStatus===401){
    observationState="AUTHORIZATION_NOT_ESTABLISHED";
  }else if(httpStatus===403){
    observationState="ACCESS_NOT_ESTABLISHED";
  }else if(httpStatus===429){
    observationState="RATE_LIMITED_ACTIVE_UNKNOWN";
  }else if(httpStatus>=500){
    observationState="SOURCE_ERROR_ACTIVE_UNKNOWN";
  }else{
    observationState="REQUEST_OUTCOME_ACTIVE_UNKNOWN";
  }

  const base={
    schema:PORTAL_CREDENTIAL_OBSERVATION_SCHEMA,
    version:1,
    readinessSha256:readiness.readinessSha256,
    credentialFingerprintSha256:readiness.credentialFingerprintSha256,
    httpStatus,
    observationState,
    activeVerified,
    credentialInvalidProven:false,
    networkAuthorizationInferred:false,
    retryAuthorized:false,
    humanReviewRequired:true
  };
  return Object.freeze({...base,observationSha256:sha256(canonicalJson(base))});
}
