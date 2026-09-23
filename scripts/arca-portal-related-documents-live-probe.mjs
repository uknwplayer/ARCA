import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {buildM4ControlledScopeV02} from "../src/investigation/m4-controlled-scope.mjs";
import {createPortalRelatedDocumentsTransport} from "../src/investigation/portal-related-documents-transport.mjs";
import {sealCustodyDirectory,openCustodyEnvelope} from "../src/machine-bridge/encrypted-custody-envelope.mjs";
import {createGitHubPrivateCustodyBackend} from "../src/machine-bridge/durable-private-custody.mjs";
import {observePortalJsonSchema} from "../src/investigation/m5-portal-schema-observer.mjs";

export const PORTAL_RELATED_DOCUMENTS_PROBE_SCHEMA="arca.portal-related-documents-controlled-probe.v0.3";
const DTO_FIELDS=new Set([
  "data","fase","documento","documentoResumido","especie","orgaoSuperior",
  "orgaoVinculado","unidadeGestora","elementoDespesa","favorecido","valor"
]);

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function stableStringify(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableStringify(value[key])).join(",")+"}";
}
function requiredSecret(value,errorCode,max=4096,min=1){
  if(typeof value!=="string"||value.length<min||value.length>max||
     value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))
    throw new Error(errorCode);
  return value;
}
function repositoryName(value){
  const text=requiredSecret(value,"ARCA_PORTAL_REPOSITORY_INVALID",256);
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text))
    throw new Error("ARCA_PORTAL_REPOSITORY_INVALID");
  return text;
}
function revision(value){
  const text=requiredSecret(value,"ARCA_PORTAL_REVISION_INVALID",40);
  if(!/^[a-f0-9]{40}$/.test(text))throw new Error("ARCA_PORTAL_REVISION_INVALID");
  return text;
}
function validateDtoRecords(value){
  if(!Array.isArray(value))throw new Error("ARCA_PORTAL_DTO_ARRAY_REQUIRED");
  if(value.length>25)throw new Error("ARCA_PORTAL_RECORD_BUDGET_EXCEEDED");
  for(const record of value){
    if(!record||typeof record!=="object"||Array.isArray(record))
      throw new Error("ARCA_PORTAL_DTO_SCHEMA_INVALID");
    for(const [key,item] of Object.entries(record)){
      if(!DTO_FIELDS.has(key)||typeof item!=="string")
        throw new Error("ARCA_PORTAL_DTO_SCHEMA_INVALID");
    }
  }
  return value.length;
}
function validateStoredCapture(stored,proof,envelope){
  const captureProofHash=sha256(stableStringify(proof));
  if(!["STORED","ALREADY_STORED"].includes(stored?.status)||
     !/^[a-f0-9]{64}$/.test(stored?.receiptHash??"")||
     stored.receiptHash!==stored.receipt?.receiptHash||
     stored.receipt?.envelopeHash!==sha256(JSON.stringify(envelope))||
     stored.envelopeHash!==stored.receipt?.envelopeHash||
     stored.receipt?.scopeHash!==proof.scopeHash||
     stored.receipt?.captureProofHash!==captureProofHash||
     stored.captureProofHash!==captureProofHash||
     !/^[a-f0-9]{40}$/.test(stored.vaultCommitSha??""))
    throw new Error("ARCA_PORTAL_CUSTODY_RECEIPT_INVALID");
  return Object.freeze({
    required:true,
    status:stored.status==="STORED"?"STORED_PRIVATE":"ALREADY_STORED_PRIVATE",
    receiptHash:stored.receiptHash,
    vaultCommitRefHash:sha256(stored.vaultCommitSha),
    plaintextStored:false
  });
}
function writePrivateFile(filePath,content){
  fs.mkdirSync(path.dirname(filePath),{recursive:true,mode:0o700});
  fs.writeFileSync(filePath,content,{encoding:"utf8",mode:0o600,flag:"wx"});
}

export async function runPortalRelatedDocumentsProbe({
  env=process.env,
  fetchImpl=globalThis.fetch,
  durableCustodyBackend=null,
  outputDir=null,
  temporaryParent=os.tmpdir(),
  sealDirectory=sealCustodyDirectory,
  openEnvelope=openCustodyEnvelope,
  preflightOnly=false
}={}){
  if(env.ARCA_PORTAL_CONFIRMATION!=="PORTAL_DOCUMENT_GET_ONLY")
    throw new Error("ARCA_PORTAL_EXPLICIT_CONFIRMATION_REQUIRED");
  const documentCode=requiredSecret(env.ARCA_PORTAL_DOCUMENT_CODE,"ARCA_PORTAL_DOCUMENT_CODE_REQUIRED",80);
  const apiKey=requiredSecret(env.ARCA_PORTAL_API_KEY,"ARCA_PORTAL_API_KEY_REQUIRED",4096,20);
  const passphrase=requiredSecret(env.ARCA_PORTAL_CUSTODY_PASSPHRASE,"ARCA_PORTAL_CUSTODY_PASSPHRASE_REQUIRED",4096,24);
  const sourceRepo=repositoryName(env.GITHUB_REPOSITORY);
  const codeRevision=revision(env.GITHUB_SHA);
  const scope=buildM4ControlledScopeV02({
    source:"PORTAL",
    confirmation:env.ARCA_PORTAL_CONFIRMATION,
    revision:codeRevision,
    documentCode,
    maxBytes:65536,
    timeoutMs:30000
  });
  const expectedScopeHash=requiredSecret(env.ARCA_PORTAL_SCOPE_SHA256,"ARCA_PORTAL_SCOPE_HASH_REQUIRED",64);
  if(!/^[a-f0-9]{64}$/.test(expectedScopeHash)||scope.scopeSha256!==expectedScopeHash)
    throw new Error("ARCA_PORTAL_SCOPE_HASH_MISMATCH");

  const transport=createPortalRelatedDocumentsTransport({fetchImpl,apiKey,timeoutMs:30000,maxBytes:65536,captureHttpErrors:true});
  let custody=durableCustodyBackend;
  if(!custody){
    const vaultRepository=repositoryName(env.ARCA_CUSTODY_VAULT_REPOSITORY);
    const vaultToken=requiredSecret(env.ARCA_CUSTODY_VAULT_TOKEN,"ARCA_PORTAL_CUSTODY_VAULT_TOKEN_REQUIRED",4096,20);
    custody=createGitHubPrivateCustodyBackend({
      repository:vaultRepository,
      branch:env.ARCA_CUSTODY_VAULT_BRANCH||"main",
      token:vaultToken,
      fetchImpl
    });
  }
  if(typeof custody?.preflight!=="function"||typeof custody?.persist!=="function"||
     typeof custody?.persistStatusProof!=="function")
    throw new Error("ARCA_PORTAL_CUSTODY_BACKEND_INVALID");
  const preflight=await custody.preflight();
  if(preflight?.ready!==true||preflight?.private!==true)
    throw new Error("ARCA_PORTAL_CUSTODY_PREFLIGHT_FAILED");
  if(preflightOnly)return Object.freeze({status:"PREFLIGHT_READY",scopeHash:scope.scopeSha256});

  const resolvedOutputDir=path.resolve(outputDir??env.ARCA_PORTAL_LIVE_OUTPUT_DIR??path.join(process.cwd(),"artifacts"));
  const tempBase=path.resolve(temporaryParent);
  fs.mkdirSync(tempBase,{recursive:true,mode:0o700});
  const tempRoot=fs.mkdtempSync(path.join(tempBase,"arca-portal-m4b-"));
  fs.chmodSync(tempRoot,0o700);
  const stagingRoot=path.join(tempRoot,"staging");
  fs.mkdirSync(stagingRoot,{mode:0o700});

  try{
    const captured=await transport.fetchRelatedDocuments({documentCode});
    const responseBytes=Buffer.from(captured.bodyBytes);
    const responseBytesSha256=sha256(responseBytes);
    if(responseBytesSha256!==captured.responseBytesSha256)
      throw new Error("ARCA_PORTAL_RESPONSE_HASH_MISMATCH");
    const responsePath=path.join(stagingRoot,"response.bin");
    fs.writeFileSync(responsePath,responseBytes,{mode:0o600,flag:"wx"});
    let envelope;
    try{
      envelope=sealDirectory({
        root:stagingRoot,
        passphrase,
        repository:sourceRepo,
        revision:codeRevision,
        scopeHash:scope.scopeSha256
      });
    }catch{
      throw new Error("ARCA_PORTAL_CUSTODY_SEAL_FAILED");
    }
    const envelopeHash=sha256(JSON.stringify(envelope));
    const httpStatusClass=`${Math.floor(captured.status/100)}xx`;
    const captureProof={
      schema:PORTAL_RELATED_DOCUMENTS_PROBE_SCHEMA,
      probeStatus:"CAPTURING",
      captureStatus:"CAPTURED_AND_SEALED",
      validationStatus:"PENDING",
      repository:sourceRepo,
      revision:codeRevision,
      scopeHash:scope.scopeSha256,
      scope:scope.scope,
      contractId:"PORTAL_EXPENSE_RELATED_DOCUMENTS",
      httpStatus:captured.status,
      httpStatusClass,
      ...(captured.httpErrorCode?{httpFailureCode:captured.httpErrorCode}:{}),
      resultHash:responseBytesSha256,
      responseBytesSha256,
      responseByteCount:responseBytes.byteLength,
      networkUsed:true,
      budgets:{maxRequests:1,maxRecords:25,maxBytes:65536,timeoutMs:30000,retries:0},
      custody:{
        encrypted:true,
        envelopeHash,
        contentRootHash:envelope.contentRootHash,
        payloadHash:envelope.payloadHash,
        fileCount:envelope.fileCount,
        totalBytes:envelope.totalBytes,
        plaintextPublished:false
      },
      classifierEmittedSignals:false,
      investigationIngressUsed:false,
      automaticAdversePublication:false,
      humanReviewRequired:true,
      anomalyIsNotIrregularity:true
    };
    const stored=await custody.persist({envelope,proof:captureProof});
    const durableCustody=validateStoredCapture(stored,captureProof,envelope);

    const reopened=openEnvelope({envelope,passphrase});
    if(!Array.isArray(reopened.files)||reopened.files.length!==1||reopened.files[0].path!=="response.bin")
      throw new Error("ARCA_PORTAL_CUSTODY_PAYLOAD_INVALID");
    const reopenedBytes=Buffer.from(reopened.files[0].data,"base64");
    if(!reopenedBytes.equals(responseBytes)||sha256(reopenedBytes)!==responseBytesSha256)
      throw new Error("ARCA_PORTAL_CUSTODY_ORIGINAL_BYTES_MISMATCH");

    let recordCount=null;
    let failureCode=null;
    let validationStatus="NOT_APPLICABLE";
    let schemaObservation=null;
    if(captured.ok){
      try{
        let bodyText;
        try{bodyText=new TextDecoder("utf-8",{fatal:true}).decode(reopenedBytes)}
        catch{throw new Error("ARCA_PORTAL_UTF8_INVALID")}
        let parsed;
        try{parsed=JSON.parse(bodyText)}
        catch{throw new Error("ARCA_PORTAL_JSON_INVALID")}
        schemaObservation=observePortalJsonSchema({
          bytes:reopenedBytes,
          custodyBinding:{
            source:"PORTAL",
            scopeSha256:scope.scopeSha256,
            custodyEnvelopeSha256:envelopeHash,
            custodyReceiptSha256:durableCustody.receiptHash,
            responseBytesSha256
          },
          sourceCaptureNetworkUsed:true
        });
        recordCount=validateDtoRecords(parsed);
      }catch(error){
        const code=String(error?.message??"");
        failureCode=/^ARCA_PORTAL_(?:UTF8_INVALID|JSON_INVALID|DTO_ARRAY_REQUIRED|DTO_SCHEMA_INVALID|RECORD_BUDGET_EXCEEDED)$/.test(code)
          ?code:"ARCA_PORTAL_VALIDATION_FAILED";
        recordCount=null;
      }
      validationStatus=failureCode?"FAILED":"VALIDATED";
    }else{
      failureCode=captured.httpErrorCode??"ARCA_PORTAL_HTTP_ERROR";
    }

    const finalProof={
      ...captureProof,
      probeStatus:failureCode?"FAILED":"SUCCEEDED",
      validationStatus,
      ...(schemaObservation?{schemaObservation}:{}),
      ...(failureCode?{failureCode}:{recordCount}),
      durableCustody
    };
    const validationStored=await custody.persistStatusProof({envelope,proof:finalProof});
    const expectedValidationProofHash=sha256(stableStringify(finalProof));
    if(!["STORED_PRIVATE","ALREADY_STORED_PRIVATE"].includes(validationStored?.status)||
       validationStored.proofHash!==expectedValidationProofHash||
       !/^[a-f0-9]{40}$/.test(validationStored.vaultCommitSha??""))
      throw new Error("ARCA_PORTAL_CUSTODY_STATUS_NOT_STORED");

    const proof={
      ...finalProof,
      durableCustody:{
        ...durableCustody,
        validationProofHash:validationStored.proofHash,
        validationVaultCommitRefHash:sha256(validationStored.vaultCommitSha)
      }
    };
    const proofPath=path.join(resolvedOutputDir,"portal-related-documents-proof.json");
    const envelopePath=path.join(resolvedOutputDir,"portal-related-documents.envelope.json");
    writePrivateFile(envelopePath,JSON.stringify(envelope,null,2)+"\n");
    writePrivateFile(proofPath,JSON.stringify(proof,null,2)+"\n");
    return Object.freeze({status:failureCode?"FAILED":"SUCCEEDED",proof,envelopePath,proofPath});
  }finally{
    fs.rmSync(tempRoot,{recursive:true,force:true});
  }
}

async function main(){
  try{
    const result=await runPortalRelatedDocumentsProbe({preflightOnly:process.argv.includes("--preflight-only")});
    if(result.status==="PREFLIGHT_READY"){
      process.stdout.write(JSON.stringify({status:result.status,scopeHash:result.scopeHash})+"\n");
      return;
    }
    process.stdout.write(JSON.stringify({
      schema:result.proof.schema,
      probeStatus:result.proof.probeStatus,
      validationStatus:result.proof.validationStatus,
      scopeHash:result.proof.scopeHash,
      envelopeHash:result.proof.custody.envelopeHash,
      ...(result.proof.schemaObservation?{
        schemaObservationState:result.proof.schemaObservation.observationState,
        observedSchemaSha256:result.proof.schemaObservation.observedSchemaSha256
      }:{}),
      proofPath:path.basename(result.proofPath),
      envelopePath:path.basename(result.envelopePath)
    })+"\n");
    if(result.status!=="SUCCEEDED")process.exitCode=1;
  }catch(error){
    const code=/^ARCA_[A-Z0-9_]+$/.test(String(error?.message??""))?error.message:"ARCA_PORTAL_PROBE_FAILED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  main();
