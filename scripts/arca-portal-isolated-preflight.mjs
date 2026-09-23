import {pathToFileURL} from "node:url";
import path from "node:path";
import {buildM4ControlledScopeV02} from "../src/investigation/m4-controlled-scope.mjs";
import {assessPortalCredentialReadiness} from "../src/investigation/portal-credential-readiness.mjs";
import {createGitHubPrivateCustodyBackend} from "../src/machine-bridge/durable-private-custody.mjs";

export const PORTAL_ISOLATED_PREFLIGHT_SCHEMA="arca.portal-isolated-preflight.v1";

function required(value,code,max=4096,min=1){
  if(typeof value!=="string"||value.length<min||value.length>max||
     value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))
    throw new Error(code);
  return value;
}
function repositoryName(value,code){
  const out=required(value,code,256);
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(out))throw new Error(code);
  return out;
}
function revision(value){
  const out=required(value,"ARCA_PORTAL_PREFLIGHT_REVISION_INVALID",40);
  if(!/^[a-f0-9]{40}$/.test(out))throw new Error("ARCA_PORTAL_PREFLIGHT_REVISION_INVALID");
  return out;
}

export async function runPortalIsolatedPreflight({
  env=process.env,
  fetchImpl=globalThis.fetch,
  durableCustodyBackend=null
}={}){
  if(env.ARCA_PORTAL_PREFLIGHT_CONFIRMATION!=="PORTAL_PREFLIGHT_ONLY")
    throw new Error("ARCA_PORTAL_PREFLIGHT_CONFIRMATION_REQUIRED");

  const documentCode=required(env.ARCA_PORTAL_DOCUMENT_CODE,"ARCA_PORTAL_DOCUMENT_CODE_REQUIRED",80);
  const apiKey=required(env.ARCA_PORTAL_API_KEY,"ARCA_PORTAL_API_KEY_REQUIRED",4096,20);
  const codeRevision=revision(env.GITHUB_SHA);
  repositoryName(env.GITHUB_REPOSITORY,"ARCA_PORTAL_PREFLIGHT_REPOSITORY_INVALID");

  const credentialReadiness=assessPortalCredentialReadiness({
    apiKey,
    provenance:env.ARCA_PORTAL_TOKEN_PROVENANCE,
    receivedAt:env.ARCA_PORTAL_TOKEN_RECEIVED_AT
  });

  const scope=buildM4ControlledScopeV02({
    source:"PORTAL",
    confirmation:"PORTAL_DOCUMENT_GET_ONLY",
    revision:codeRevision,
    documentCode,
    maxBytes:65536,
    timeoutMs:30000
  });

  let custody=durableCustodyBackend;
  if(!custody){
    const vaultRepository=repositoryName(
      env.ARCA_CUSTODY_VAULT_REPOSITORY,
      "ARCA_PORTAL_PREFLIGHT_VAULT_REPOSITORY_INVALID"
    );
    const vaultToken=required(
      env.ARCA_CUSTODY_VAULT_TOKEN,
      "ARCA_PORTAL_PREFLIGHT_VAULT_TOKEN_REQUIRED",
      4096,
      20
    );
    custody=createGitHubPrivateCustodyBackend({
      repository:vaultRepository,
      branch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
      token:vaultToken,
      fetchImpl
    });
  }
  if(typeof custody?.preflight!=="function")
    throw new Error("ARCA_PORTAL_PREFLIGHT_CUSTODY_BACKEND_INVALID");

  const custodyState=await custody.preflight();
  if(custodyState?.ready!==true||custodyState?.private!==true)
    throw new Error("ARCA_PORTAL_PREFLIGHT_CUSTODY_NOT_READY");

  return Object.freeze({
    schema:PORTAL_ISOLATED_PREFLIGHT_SCHEMA,
    version:1,
    status:"READY_FOR_EXPLICIT_AUTHORIZATION",
    revision:codeRevision,
    scopeHash:scope.scopeSha256,
    documentCodeSha256:scope.scope.documentCodeSha256,
    credentialFingerprintSha256:credentialReadiness.credentialFingerprintSha256,
    credentialProvenance:credentialReadiness.provenance,
    credentialReceivedAt:credentialReadiness.receivedAt,
    credentialActiveState:credentialReadiness.activeState,
    credentialActiveVerified:false,
    custodyReady:true,
    custodyPrivate:true,
    custodyRepositoryHash:custodyState.repositoryHash,
    custodyBranch:custodyState.branch,
    portalNetworkUsed:false,
    portalNetworkAuthorized:false,
    portalRequestCapabilityPresent:false,
    automaticRetryAuthorized:false,
    humanAuthorizationRequired:true,
    tokenIncluded:false,
    rawDocumentCodeIncluded:false
  });
}

async function main(){
  try{
    const result=await runPortalIsolatedPreflight();
    process.stdout.write(JSON.stringify(result)+"\n");
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))
      ?error.message:"ARCA_PORTAL_ISOLATED_PREFLIGHT_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
