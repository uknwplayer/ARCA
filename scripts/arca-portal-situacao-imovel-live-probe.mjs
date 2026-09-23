import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {assessPortalCredentialReadiness,observePortalCredentialOutcome} from "../src/investigation/portal-credential-readiness.mjs";
import {createPortalSituacaoImovelTransport} from "../src/investigation/portal-situacao-imovel-transport.mjs";
import {buildPortalSituacaoImovelScope,PORTAL_SITUACAO_IMOVEL_TARGET_ID,PORTAL_SITUACAO_IMOVEL_CONTRACT_ID} from "../src/investigation/portal-situacao-imovel-scope.mjs";
import {buildPortalTargetPreflightAttestation,verifyPortalTargetPreflightBinding} from "../src/investigation/portal-preflight-attestation.mjs";
import {sealCustodyDirectory,openCustodyEnvelope} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {createGitHubPrivateCustodyBackend} from "../src/machine-bridge/durable-private-custody.mjs";

export const PORTAL_SI_PROOF_SCHEMA="arca.portal-auth-validation-controlled-probe.v0.1";
const sha=v=>createHash("sha256").update(v).digest("hex");
const stable=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(stable).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
function req(v,c,max=4096,min=1){if(typeof v!=="string"||v.length<min||v.length>max||v.trim()!==v||/[\u0000-\u001f\u007f]/.test(v))throw new Error(c);return v}
function repo(v,c){const x=req(v,c,256);if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x))throw new Error(c);return x}
function rev(v){const x=req(v,"ARCA_PORTAL_SI_REVISION_INVALID",40);if(!/^[a-f0-9]{40}$/.test(x))throw new Error("ARCA_PORTAL_SI_REVISION_INVALID");return x}
function write(p,s){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,s,{encoding:"utf8",mode:0o600,flag:"wx"})}

export async function runPortalSituacaoImovelProbe({env=process.env,fetchImpl=globalThis.fetch,durableCustodyBackend=null,outputDir=null,temporaryParent=os.tmpdir()}={}){
  if(env.ARCA_PORTAL_CONFIRMATION!=="PORTAL_SITUACAO_IMOVEL_GET_ONLY")throw new Error("ARCA_PORTAL_EXPLICIT_CONFIRMATION_REQUIRED");
  const apiKey=req(env.ARCA_PORTAL_API_KEY,"ARCA_PORTAL_API_KEY_REQUIRED",4096,20);
  const passphrase=req(env.ARCA_PORTAL_CUSTODY_PASSPHRASE,"ARCA_PORTAL_CUSTODY_PASSPHRASE_REQUIRED",4096,24);
  const revision=rev(env.GITHUB_SHA), sourceRepo=repo(env.GITHUB_REPOSITORY,"ARCA_PORTAL_REPOSITORY_INVALID");
  const readiness=assessPortalCredentialReadiness({apiKey,provenance:env.ARCA_PORTAL_TOKEN_PROVENANCE,receivedAt:env.ARCA_PORTAL_TOKEN_RECEIVED_AT});
  const scope=buildPortalSituacaoImovelScope({revision});
  let custody=durableCustodyBackend;
  if(!custody)custody=createGitHubPrivateCustodyBackend({
    repository:repo(env.ARCA_CUSTODY_VAULT_REPOSITORY,"ARCA_PORTAL_PREFLIGHT_VAULT_REPOSITORY_INVALID"),
    branch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
    token:req(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_PORTAL_PREFLIGHT_VAULT_TOKEN_REQUIRED",4096,20),
    fetchImpl
  });
  const cs=await custody.preflight(); if(cs?.ready!==true||cs?.private!==true)throw new Error("ARCA_PORTAL_PREFLIGHT_CUSTODY_NOT_READY");
  const att=buildPortalTargetPreflightAttestation({
    revision,scopeHash:scope.scopeSha256,targetId:PORTAL_SITUACAO_IMOVEL_TARGET_ID,targetBindingSha256:scope.targetBindingSha256,
    credentialFingerprintSha256:readiness.credentialFingerprintSha256,credentialProvenance:readiness.provenance,credentialReceivedAt:readiness.receivedAt,
    custodyRepositoryHash:cs.repositoryHash,custodyBranch:cs.branch
  });
  verifyPortalTargetPreflightBinding({
    attestation:att,expectedPreflightSha256:env.ARCA_PORTAL_PREFLIGHT_SHA256,
    expectedCredentialFingerprintSha256:env.ARCA_PORTAL_CREDENTIAL_FINGERPRINT_SHA256,
    expectedTargetId:PORTAL_SITUACAO_IMOVEL_TARGET_ID
  });
  const captured=await createPortalSituacaoImovelTransport({fetchImpl,apiKey}).fetchOnce();
  const observation=observePortalCredentialOutcome({readiness,httpStatus:captured.status});
  const bytes=Buffer.from(captured.bodyBytes), resultHash=sha(bytes);
  const temp=fs.mkdtempSync(path.join(path.resolve(temporaryParent),"arca-portal-si-")); fs.mkdirSync(path.join(temp,"staging"),{mode:0o700});
  try{
    fs.writeFileSync(path.join(temp,"staging","response.bin"),bytes,{mode:0o600,flag:"wx"});
    const envelope=sealCustodyDirectory({root:path.join(temp,"staging"),passphrase,repository:sourceRepo,revision,scopeHash:scope.scopeSha256});
    const envelopeHash=sha(JSON.stringify(envelope));
    const captureProof={
      schema:PORTAL_SI_PROOF_SCHEMA,probeStatus:"CAPTURING",captureStatus:"CAPTURED_AND_SEALED",validationStatus:"PENDING",
      repository:sourceRepo,revision,scopeHash:scope.scopeSha256,scope:scope.scope,contractId:PORTAL_SITUACAO_IMOVEL_CONTRACT_ID,
      authorizationBinding:{preflightSha256:att.preflightSha256,credentialFingerprintSha256:att.credentialFingerprintSha256,scopeHash:att.scopeHash,revision:att.revision,targetId:att.targetId},
      credentialReadiness:readiness,credentialObservation:observation,httpStatus:captured.status,httpStatusClass:`${Math.floor(captured.status/100)}xx`,
      ...(captured.httpErrorCode?{httpFailureCode:captured.httpErrorCode}:{}),resultHash,responseBytesSha256:resultHash,responseByteCount:bytes.byteLength,
      networkUsed:true,budgets:{maxRequests:1,maxRecords:100,maxBytes:32768,timeoutMs:30000,retries:0},
      custody:{encrypted:true,envelopeHash,contentRootHash:envelope.contentRootHash,payloadHash:envelope.payloadHash,fileCount:envelope.fileCount,totalBytes:envelope.totalBytes,plaintextPublished:false},
      classifierEmittedSignals:false,investigationIngressUsed:false,automaticAdversePublication:false,humanReviewRequired:true,anomalyIsNotIrregularity:true
    };
    const stored=await custody.persist({envelope,proof:captureProof});
    const durable={required:true,status:stored.status==="STORED"?"STORED_PRIVATE":"ALREADY_STORED_PRIVATE",receiptHash:stored.receiptHash,vaultCommitRefHash:sha(stored.vaultCommitSha),plaintextStored:false};
    let failureCode=null, recordCount=null, validationStatus="NOT_APPLICABLE";
    if(captured.ok){
      try{
        const reopened=openCustodyEnvelope({envelope,passphrase}); const reopenedBytes=Buffer.from(reopened.files[0].data,"base64");
        const parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(reopenedBytes));
        if(!Array.isArray(parsed)||parsed.length>100||parsed.some(x=>typeof x!=="string"))throw new Error("ARCA_PORTAL_SI_SCHEMA_INVALID");
        recordCount=parsed.length; validationStatus="VALIDATED";
      }catch{failureCode="ARCA_PORTAL_SI_VALIDATION_FAILED";validationStatus="FAILED"}
    }else failureCode=captured.httpErrorCode??"ARCA_PORTAL_HTTP_ERROR";
    const finalProof={...captureProof,probeStatus:failureCode?"FAILED":"SUCCEEDED",validationStatus,...(failureCode?{failureCode}:{recordCount}),durableCustody:durable};
    const validationStored=await custody.persistStatusProof({envelope,proof:finalProof});
    const proof={...finalProof,durableCustody:{...durable,validationProofHash:validationStored.proofHash,validationVaultCommitRefHash:sha(validationStored.vaultCommitSha)}};
    const dir=path.resolve(outputDir??path.join(process.cwd(),"artifacts")); write(path.join(dir,"portal-situacao-imovel.envelope.json"),JSON.stringify(envelope,null,2)+"\n");write(path.join(dir,"portal-situacao-imovel-proof.json"),JSON.stringify(proof,null,2)+"\n");
    return {status:failureCode?"FAILED":"SUCCEEDED",proof};
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
async function main(){try{const r=await runPortalSituacaoImovelProbe();process.stdout.write(JSON.stringify({schema:r.proof.schema,probeStatus:r.proof.probeStatus,httpStatus:r.proof.httpStatus,credentialState:r.proof.credentialObservation.observationState,activeVerified:r.proof.credentialObservation.activeVerified,preflightSha256:r.proof.authorizationBinding.preflightSha256,credentialFingerprintSha256:r.proof.authorizationBinding.credentialFingerprintSha256,scopeHash:r.proof.scopeHash,validationStatus:r.proof.validationStatus,envelopeHash:r.proof.custody.envelopeHash})+"\n");if(r.status!=="SUCCEEDED")process.exitCode=1}catch(e){process.stderr.write((/^ARCA_/.test(String(e?.message))?e.message:"ARCA_PORTAL_SI_PROBE_FAILED")+"\n");process.exitCode=1}}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
