import path from "node:path";
import {pathToFileURL} from "node:url";
import {assessPortalCredentialReadiness} from "../src/investigation/portal-credential-readiness.mjs";
import {createGitHubPrivateCustodyBackend} from "../src/machine-bridge/durable-private-custody.mjs";
import {buildPortalSituacaoImovelScope,PORTAL_SITUACAO_IMOVEL_TARGET_ID} from "../src/investigation/portal-situacao-imovel-scope.mjs";
import {buildPortalTargetPreflightAttestation} from "../src/investigation/portal-preflight-attestation.mjs";

function req(v,c,max=4096,min=1){if(typeof v!=="string"||v.length<min||v.length>max||v.trim()!==v||/[\u0000-\u001f\u007f]/.test(v))throw new Error(c);return v}
function repo(v,c){const x=req(v,c,256);if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x))throw new Error(c);return x}
function rev(v){const x=req(v,"ARCA_PORTAL_SI_REVISION_INVALID",40);if(!/^[a-f0-9]{40}$/.test(x))throw new Error("ARCA_PORTAL_SI_REVISION_INVALID");return x}

export async function runPortalSituacaoImovelPreflight({env=process.env,fetchImpl=globalThis.fetch,durableCustodyBackend=null}={}){
  if(env.ARCA_PORTAL_PREFLIGHT_CONFIRMATION!=="PORTAL_PREFLIGHT_ONLY")throw new Error("ARCA_PORTAL_PREFLIGHT_CONFIRMATION_REQUIRED");
  const apiKey=req(env.ARCA_PORTAL_API_KEY,"ARCA_PORTAL_API_KEY_REQUIRED",4096,20);
  const revision=rev(env.GITHUB_SHA);
  repo(env.GITHUB_REPOSITORY,"ARCA_PORTAL_PREFLIGHT_REPOSITORY_INVALID");
  const readiness=assessPortalCredentialReadiness({apiKey,provenance:env.ARCA_PORTAL_TOKEN_PROVENANCE,receivedAt:env.ARCA_PORTAL_TOKEN_RECEIVED_AT});
  const scope=buildPortalSituacaoImovelScope({revision});
  let custody=durableCustodyBackend;
  if(!custody){
    custody=createGitHubPrivateCustodyBackend({
      repository:repo(env.ARCA_CUSTODY_VAULT_REPOSITORY,"ARCA_PORTAL_PREFLIGHT_VAULT_REPOSITORY_INVALID"),
      branch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
      token:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_PORTAL_PREFLIGHT_VAULT_TOKEN_REQUIRED",4096,20),
      fetchImpl
    });
  }
  const state=await custody.preflight();
  if(state?.ready!==true||state?.private!==true)throw new Error("ARCA_PORTAL_PREFLIGHT_CUSTODY_NOT_READY");
  return buildPortalTargetPreflightAttestation({
    revision,scopeHash:scope.scopeSha256,targetId:PORTAL_SITUACAO_IMOVEL_TARGET_ID,targetBindingSha256:scope.targetBindingSha256,
    credentialFingerprintSha256:readiness.credentialFingerprintSha256,
    credentialProvenance:readiness.provenance,credentialReceivedAt:readiness.receivedAt,
    custodyRepositoryHash:state.repositoryHash,custodyBranch:state.branch
  });
}
async function main(){try{process.stdout.write(JSON.stringify(await runPortalSituacaoImovelPreflight())+"\n")}catch(e){process.stderr.write((/^ARCA_/.test(String(e?.message))?e.message:"ARCA_PORTAL_SI_PREFLIGHT_FAILED")+"\n");process.exitCode=1}}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
