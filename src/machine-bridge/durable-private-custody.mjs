import {createHash} from "node:crypto";

export const DURABLE_CUSTODY_BACKEND_SCHEMA="arca.durable-custody-backend.v0.1";
export const DURABLE_CUSTODY_RECEIPT_SCHEMA="arca.durable-custody-receipt.v0.1";

const ENVELOPE_SCHEMA="arca.encrypted-custody-envelope.v0.1";
const LIVE_PROOF_SCHEMA="arca.pncp-controlled-live-probe.v0.1";
const PORTAL_LIVE_PROOF_SCHEMA="arca.portal-controlled-live-probe.v0.1";
const PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA="arca.portal-related-documents-controlled-probe.v0.2";
const PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03="arca.portal-related-documents-controlled-probe.v0.3";
const PORTAL_AUTH_VALIDATION_PROOF_SCHEMA="arca.portal-auth-validation-controlled-probe.v0.1";
const MAX_ENVELOPE_BYTES=60*1024*1024;
const SAFE_REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BRANCH=/^[A-Za-z0-9._-]{1,128}$/;
const SAFE_SHA256=/^[a-f0-9]{64}$/;
const SAFE_REVISION=/^[a-f0-9]{40,64}$/;

function sha256(value){
  return createHash("sha256").update(value).digest("hex");
}
function gitBlobSha(bytes){
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  const header=Buffer.from(`blob ${buffer.length}\0`,"utf8");
  return createHash("sha1").update(header).update(buffer).digest("hex");
}
function stableStringify(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableStringify(value[key])).join(",")+"}";
}
function requiredText(value,field,max=512){
  const text=String(value??"").normalize("NFKC").trim();
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))
    throw new Error(`ARCA_DURABLE_CUSTODY_INVALID_${field}`);
  return text;
}
function safeRepository(value){
  const text=requiredText(value,"REPOSITORY",256);
  if(!SAFE_REPOSITORY.test(text))throw new Error("ARCA_DURABLE_CUSTODY_INVALID_REPOSITORY");
  return text;
}
function safeBranch(value){
  const text=requiredText(value??"main","BRANCH",128);
  if(!SAFE_BRANCH.test(text))throw new Error("ARCA_DURABLE_CUSTODY_INVALID_BRANCH");
  return text;
}
function safeToken(value){
  const text=String(value??"");
  if(text.length<20||text.length>4096||/\s/.test(text))
    throw new Error("ARCA_DURABLE_CUSTODY_TOKEN_REQUIRED");
  return text;
}
function safeSha256(value,field){
  const text=requiredText(value,field,64).toLowerCase();
  if(!SAFE_SHA256.test(text))throw new Error(`ARCA_DURABLE_CUSTODY_INVALID_${field}`);
  return text;
}
function safeRevision(value){
  const text=requiredText(value,"REVISION",64).toLowerCase();
  if(!SAFE_REVISION.test(text))throw new Error("ARCA_DURABLE_CUSTODY_INVALID_REVISION");
  return text;
}
function encodedPath(path){
  return String(path).split("/").map(part=>encodeURIComponent(part)).join("/");
}
function jsonResponseBody(text){
  if(!text)return null;
  try{return JSON.parse(text)}catch{return null}
}
function clone(value){return JSON.parse(JSON.stringify(value))}
function proofHasForbiddenKey(value){
  if(Array.isArray(value))return value.some(proofHasForbiddenKey);
  if(!value||typeof value!=="object")return false;
  return Object.entries(value).some(([key,item])=>
    /^(?:documentCode|apiKey|token|authorization|responseBody|requestUrl|fullUrl|personName|beneficiaryName|favorecido)$/i.test(key)||
    proofHasForbiddenKey(item));
}
function portalHttpMetaValid(proof,{final=false}={}){
  const status=proof?.httpStatus;
  if(!Number.isSafeInteger(status)||status<200||status>599||(status>=300&&status<400))return false;
  if(proof.httpStatusClass!==`${Math.floor(status/100)}xx`)return false;
  const ok=status>=200&&status<300;
  if(ok)return !Object.hasOwn(proof,"httpFailureCode");
  if(!/^ARCA_PORTAL_HTTP_(?:BAD_REQUEST|UNAUTHORIZED|RATE_LIMITED|SERVER_ERROR|ERROR)$/.test(proof.httpFailureCode??""))
    return false;
  if(final&&proof.failureCode!==proof.httpFailureCode)return false;
  return true;
}

function validPortalStatusProof(envelope,proof){
  const v03=proof?.schema===PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03;
  const auth=proof?.schema===PORTAL_AUTH_VALIDATION_PROOF_SCHEMA;
  const modern=v03||auth;
  const statusOk=modern?portalHttpMetaValid(proof,{final:true}):proof?.httpStatusClass==="2xx";
  const non2xx=modern&&proof.httpStatusClass!=="2xx";
  const validationOk=non2xx
    ?proof.probeStatus==="FAILED"&&proof.validationStatus==="NOT_APPLICABLE"&&
      !Object.hasOwn(proof,"recordCount")
    :(["VALIDATED","FAILED"].includes(proof?.validationStatus)&&
      (proof.validationStatus==="VALIDATED"?proof.probeStatus==="SUCCEEDED":proof.probeStatus==="FAILED"));
  const minBytes=modern?0:1;
  const expectedContract=auth?"PORTAL_AUTH_SITUACAO_IMOVEL":"PORTAL_EXPENSE_RELATED_DOCUMENTS";
  const maxRecords=auth?100:25;
  if(![
       PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA,
       PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03,
       PORTAL_AUTH_VALIDATION_PROOF_SCHEMA
     ].includes(proof?.schema)||
     !["SUCCEEDED","FAILED"].includes(proof.probeStatus)||
     proof.captureStatus!=="CAPTURED_AND_SEALED"||
     !["VALIDATED","FAILED","NOT_APPLICABLE"].includes(proof.validationStatus)||
     !validationOk||
     proof.repository!==envelope?.repository||proof.revision!==envelope?.revision||
     proof.scopeHash!==envelope?.scopeHash||proof.contractId!==expectedContract||
     !statusOk||proof.responseBytesSha256!==proof.resultHash||
     !SAFE_SHA256.test(proof.resultHash??"")||
     !Number.isSafeInteger(proof.responseByteCount)||proof.responseByteCount<minBytes||proof.responseByteCount>65536||
     (proof.validationStatus==="VALIDATED"&&(!Number.isSafeInteger(proof.recordCount)||proof.recordCount<0||proof.recordCount>maxRecords))||
     ((proof.validationStatus==="FAILED"||proof.validationStatus==="NOT_APPLICABLE")&&Object.hasOwn(proof,"recordCount"))||
     proof.custody?.encrypted!==true||proof.custody?.plaintextPublished!==false||
     proof.custody?.envelopeHash!==sha256(JSON.stringify(envelope))||
     proof.durableCustody?.required!==true||
     !["STORED_PRIVATE","ALREADY_STORED_PRIVATE"].includes(proof.durableCustody?.status)||
     proof.durableCustody?.plaintextStored!==false||
     !SAFE_SHA256.test(proof.durableCustody?.receiptHash??"")||
     proof.classifierEmittedSignals!==false||proof.investigationIngressUsed!==false||
     proof.automaticAdversePublication!==false||proof.humanReviewRequired!==true||
     proof.anomalyIsNotIrregularity!==true||proofHasForbiddenKey(proof))
    throw new Error("ARCA_DURABLE_CUSTODY_PROOF_INVALID");
}

export function buildDurableCustodyReceipt({
  envelope,
  proof,
  vaultRepository,
  vaultBranch="main"
}={}){
  if(envelope?.schema!==ENVELOPE_SCHEMA||
     envelope?.status!=="SEALED"||
     envelope?.algorithm!=="AES-256-GCM"||
     envelope?.plaintextIncluded!==false)
    throw new Error("ARCA_DURABLE_CUSTODY_ENVELOPE_INVALID");
  const portalV02=proof?.schema===PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA;
  const portalV03=proof?.schema===PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03;
  const portalAuth=proof?.schema===PORTAL_AUTH_VALIDATION_PROOF_SCHEMA;
  const portalRelated=portalV02||portalV03;
  const portalCapture=portalRelated||portalAuth;
  const portalModern=portalV03||portalAuth;
  if(![LIVE_PROOF_SCHEMA,PORTAL_LIVE_PROOF_SCHEMA,PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA,PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03,PORTAL_AUTH_VALIDATION_PROOF_SCHEMA].includes(proof?.schema)||
     (portalCapture
       ?(proof?.probeStatus!=="CAPTURING"||proof?.captureStatus!=="CAPTURED_AND_SEALED"||proof?.validationStatus!=="PENDING")
       :proof?.status!=="CAPTURED_AND_SEALED")||
     proof?.networkUsed!==true||
     proof?.custody?.encrypted!==true||
     proof?.custody?.plaintextPublished!==false||
     ((proof.schema===PORTAL_LIVE_PROOF_SCHEMA||portalRelated)&&(
       proof.humanReviewRequired!==true||
       proof.anomalyIsNotIrregularity!==true||
       proof.classifierEmittedSignals!==false||
       proof.investigationIngressUsed!==false||
       proof.automaticAdversePublication!==false))||
     (portalCapture&&(proof.probeStatus!=="CAPTURING"||proof.captureStatus!=="CAPTURED_AND_SEALED"||
       proof.validationStatus!=="PENDING"||proof.scopeHash!==envelope.scopeHash||
       proof.contractId!==(portalAuth?"PORTAL_AUTH_SITUACAO_IMOVEL":"PORTAL_EXPENSE_RELATED_DOCUMENTS")||
       (portalModern?!portalHttpMetaValid(proof):proof.httpStatusClass!=="2xx")||
       proof.responseBytesSha256!==proof.resultHash||
       !Number.isSafeInteger(proof.responseByteCount)||proof.responseByteCount<(portalModern?0:1)||proof.responseByteCount>65536||
       proofHasForbiddenKey(proof))))
    throw new Error("ARCA_DURABLE_CUSTODY_PROOF_INVALID");

  const sourceRepository=safeRepository(envelope.repository);
  const sourceRevision=safeRevision(envelope.revision);
  const scopeHash=safeSha256(envelope.scopeHash,"SCOPE_HASH");
  const contentRootHash=safeSha256(envelope.contentRootHash,"CONTENT_ROOT_HASH");
  const payloadHash=safeSha256(envelope.payloadHash,"PAYLOAD_HASH");
  const envelopeHash=sha256(JSON.stringify(envelope));

  if(proof.repository!==sourceRepository||
     proof.revision!==sourceRevision||
     proof.custody.envelopeHash!==envelopeHash||
     proof.custody.contentRootHash!==contentRootHash||
     proof.custody.payloadHash!==payloadHash||
     proof.custody.fileCount!==envelope.fileCount||
     proof.custody.totalBytes!==envelope.totalBytes||
     proof.resultHash==null)
    throw new Error("ARCA_DURABLE_CUSTODY_BINDING_MISMATCH");

  const resultHash=safeSha256(proof.resultHash,"RESULT_HASH");
  const repo=safeRepository(vaultRepository);
  const branch=safeBranch(vaultBranch);
  if(!Number.isSafeInteger(envelope.fileCount)||envelope.fileCount<1||envelope.fileCount>1000)
    throw new Error("ARCA_DURABLE_CUSTODY_INVALID_FILE_COUNT");
  if(!Number.isSafeInteger(envelope.totalBytes)||envelope.totalBytes<(portalV03?0:1)||envelope.totalBytes>50*1024*1024)
    throw new Error("ARCA_DURABLE_CUSTODY_INVALID_TOTAL_BYTES");

  const base={
    schema:DURABLE_CUSTODY_RECEIPT_SCHEMA,
    ...([PORTAL_LIVE_PROOF_SCHEMA,PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA,PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03,PORTAL_AUTH_VALIDATION_PROOF_SCHEMA].includes(proof.schema)?{proofSchema:proof.schema}:{}),
    ...(portalCapture?{captureProofHash:sha256(stableStringify(proof))}:{}),
    status:"STORED_PRIVATE",
    storage:"github-private-repository",
    vaultRepository:repo,
    vaultBranch:branch,
    sourceRepository,
    sourceRevision,
    scopeHash,
    resultHash,
    envelopeHash,
    contentRootHash,
    payloadHash,
    sealedAt:requiredText(envelope.sealedAt,"SEALED_AT",64),
    fileCount:envelope.fileCount,
    totalBytes:envelope.totalBytes,
    plaintextStored:false,
    classifierEmittedSignals:proof.classifierEmittedSignals===true,
    investigationIngressUsed:proof.investigationIngressUsed===true,
    automaticAdversePublication:proof.automaticAdversePublication===true,
    humanReviewRequired:proof.humanReviewRequired===true,
    anomalyIsNotIrregularity:proof.anomalyIsNotIrregularity===true
  };
  return Object.freeze({...base,receiptHash:sha256(stableStringify(base))});
}

function validatePublicSafety(receipt){
  if(receipt.plaintextStored!==false||
     receipt.automaticAdversePublication!==false||
     receipt.humanReviewRequired!==true||
     receipt.anomalyIsNotIrregularity!==true)
    throw new Error("ARCA_DURABLE_CUSTODY_RECEIPT_SAFETY_INVALID");
}

export function createGitHubPrivateCustodyBackend({
  repository,
  branch="main",
  token,
  fetchImpl=globalThis.fetch,
  apiBase="https://api.github.com"
}={}){
  const repo=safeRepository(repository);
  const targetBranch=safeBranch(branch);
  const credential=safeToken(token);
  if(typeof fetchImpl!=="function")throw new Error("ARCA_DURABLE_CUSTODY_FETCH_UNAVAILABLE");
  const base=requiredText(apiBase,"API_BASE",512).replace(/\/+$/,"");
  if(base!=="https://api.github.com")throw new Error("ARCA_DURABLE_CUSTODY_API_BASE_FORBIDDEN");

  const headers={
    "accept":"application/vnd.github+json",
    "authorization":`Bearer ${credential}`,
    "x-github-api-version":"2022-11-28",
    "user-agent":"ARCA-durable-custody-v0.1"
  };

  async function request(method,pathname,{body=null,allow404=false}={}){
    const response=await fetchImpl(base+pathname,{
      method,
      headers:body===null?headers:{...headers,"content-type":"application/json"},
      body:body===null?undefined:JSON.stringify(body),
      redirect:"error"
    });
    const text=await response.text();
    if(allow404&&response.status===404)return null;
    if(!response.ok){
      const suffix=response.status===409||response.status===422?"_CONFLICT":"_HTTP_"+response.status;
      throw new Error("ARCA_DURABLE_CUSTODY_GITHUB"+suffix);
    }
    return jsonResponseBody(text);
  }

  async function repositoryState(){
    const [owner,name]=repo.split("/");
    const metadata=await request("GET",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
    if(metadata?.private!==true)throw new Error("ARCA_DURABLE_CUSTODY_TARGET_NOT_PRIVATE");
    if(metadata?.archived===true)throw new Error("ARCA_DURABLE_CUSTODY_TARGET_ARCHIVED");
    const ref=await request("GET",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${encodeURIComponent(targetBranch)}`);
    const headSha=requiredText(ref?.object?.sha,"HEAD_SHA",64).toLowerCase();
    if(!SAFE_REVISION.test(headSha))throw new Error("ARCA_DURABLE_CUSTODY_HEAD_INVALID");
    return {owner,name,headSha};
  }

  async function contentMeta(owner,name,path){
    return request(
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodedPath(path)}?ref=${encodeURIComponent(targetBranch)}`,
      {allow404:true}
    );
  }

  return Object.freeze({
    schema:DURABLE_CUSTODY_BACKEND_SCHEMA,

    async preflight(){
      const state=await repositoryState();
      return Object.freeze({
        ready:true,
        private:true,
        repositoryHash:sha256(repo),
        branch:targetBranch,
        headSha:state.headSha
      });
    },

    async persist({envelope,proof}={}){
      const receipt=buildDurableCustodyReceipt({
        envelope,
        proof,
        vaultRepository:repo,
        vaultBranch:targetBranch
      });
      validatePublicSafety(receipt);

      const envelopeBytes=Buffer.from(JSON.stringify(envelope)+"\n","utf8");
      if(envelopeBytes.byteLength>MAX_ENVELOPE_BYTES)
        throw new Error("ARCA_DURABLE_CUSTODY_ENVELOPE_TOO_LARGE");
      const receiptBytes=Buffer.from(stableStringify(receipt)+"\n","utf8");
      const captureProofBytes=[PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA,PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03,PORTAL_AUTH_VALIDATION_PROOF_SCHEMA].includes(receipt.proofSchema)
        ?Buffer.from(stableStringify(proof)+"\n","utf8"):null;
      const prefix=receipt.envelopeHash.slice(0,2);
      const envelopePath=`custody/${prefix}/${receipt.envelopeHash}.envelope.json`;
      const receiptPath=`receipts/${prefix}/${receipt.envelopeHash}.receipt.json`;
      const captureProofPath=`proofs/${prefix}/${receipt.envelopeHash}.capture-proof.json`;
      const envelopeBlobSha=gitBlobSha(envelopeBytes);
      const receiptBlobSha=gitBlobSha(receiptBytes);
      const captureProofBlobSha=captureProofBytes?gitBlobSha(captureProofBytes):null;

      const state=await repositoryState();
      const [existingEnvelope,existingReceipt,existingCaptureProof]=await Promise.all([
        contentMeta(state.owner,state.name,envelopePath),
        contentMeta(state.owner,state.name,receiptPath),
        captureProofBytes?contentMeta(state.owner,state.name,captureProofPath):Promise.resolve(null)
      ]);
      if(Boolean(existingEnvelope)!==Boolean(existingReceipt)||
         (captureProofBytes&&Boolean(existingEnvelope)!==Boolean(existingCaptureProof)))
        throw new Error("ARCA_DURABLE_CUSTODY_PARTIAL_STATE");
      if(existingEnvelope&&existingReceipt){
        if(existingEnvelope.sha!==envelopeBlobSha||existingReceipt.sha!==receiptBlobSha||
           (captureProofBytes&&existingCaptureProof.sha!==captureProofBlobSha))
          throw new Error("ARCA_DURABLE_CUSTODY_CONTENT_ADDRESS_CONFLICT");
        return Object.freeze({
          status:"ALREADY_STORED",
          receipt:clone(receipt),
          receiptHash:receipt.receiptHash,
          envelopeHash:receipt.envelopeHash,
          vaultCommitSha:state.headSha,
          envelopePath,
          receiptPath,
          ...(captureProofBytes?{captureProofPath,captureProofHash:receipt.captureProofHash}:{})
        });
      }

      const commit=await request("GET",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/commits/${state.headSha}`);
      const baseTreeSha=requiredText(commit?.tree?.sha,"BASE_TREE_SHA",64).toLowerCase();
      if(!/^[a-f0-9]{40}$/.test(baseTreeSha))throw new Error("ARCA_DURABLE_CUSTODY_TREE_INVALID");

      const blobs=[
        {path:envelopePath,bytes:envelopeBytes,sha:envelopeBlobSha},
        {path:receiptPath,bytes:receiptBytes,sha:receiptBlobSha},
        ...(captureProofBytes?[{path:captureProofPath,bytes:captureProofBytes,sha:captureProofBlobSha}]:[])
      ];
      for(const blob of blobs){
        const uploaded=await request("POST",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/blobs`,{
          body:{content:blob.bytes.toString("base64"),encoding:"base64"}
        });
        if(uploaded?.sha!==blob.sha)throw new Error("ARCA_DURABLE_CUSTODY_BLOB_HASH_MISMATCH");
      }

      const tree=await request("POST",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/trees`,{
        body:{
          base_tree:baseTreeSha,
          tree:blobs.map(blob=>({path:blob.path,mode:"100644",type:"blob",sha:blob.sha}))
        }
      });
      const treeSha=requiredText(tree?.sha,"NEW_TREE_SHA",64).toLowerCase();
      if(!/^[a-f0-9]{40}$/.test(treeSha))throw new Error("ARCA_DURABLE_CUSTODY_NEW_TREE_INVALID");

      const createdCommit=await request("POST",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/commits`,{
        body:{
          message:`custody: store ${receipt.envelopeHash.slice(0,12)}`,
          tree:treeSha,
          parents:[state.headSha]
        }
      });
      const newCommitSha=requiredText(createdCommit?.sha,"NEW_COMMIT_SHA",64).toLowerCase();
      if(!/^[a-f0-9]{40}$/.test(newCommitSha))throw new Error("ARCA_DURABLE_CUSTODY_NEW_COMMIT_INVALID");

      await request("PATCH",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/refs/heads/${encodeURIComponent(targetBranch)}`,{
        body:{sha:newCommitSha,force:false}
      });

      const [storedEnvelope,storedReceipt,storedCaptureProof]=await Promise.all([
        contentMeta(state.owner,state.name,envelopePath),
        contentMeta(state.owner,state.name,receiptPath),
        captureProofBytes?contentMeta(state.owner,state.name,captureProofPath):Promise.resolve(null)
      ]);
      if(storedEnvelope?.sha!==envelopeBlobSha||storedReceipt?.sha!==receiptBlobSha||
         (captureProofBytes&&storedCaptureProof?.sha!==captureProofBlobSha))
        throw new Error("ARCA_DURABLE_CUSTODY_POST_WRITE_VERIFY_FAILED");

      return Object.freeze({
        status:"STORED",
        receipt:clone(receipt),
        receiptHash:receipt.receiptHash,
        envelopeHash:receipt.envelopeHash,
        vaultCommitSha:newCommitSha,
        envelopePath,
        receiptPath,
        ...(captureProofBytes?{captureProofPath,captureProofHash:receipt.captureProofHash}:{})
      });
    },

    async persistStatusProof({envelope,proof}={}){
      validPortalStatusProof(envelope,proof);
      const envelopeHash=sha256(JSON.stringify(envelope));
      const proofHash=sha256(stableStringify(proof));
      const proofBytes=Buffer.from(stableStringify(proof)+"\n","utf8");
      const proofBlobSha=gitBlobSha(proofBytes);
      const prefix=envelopeHash.slice(0,2);
      const proofPath=`proofs/${prefix}/${envelopeHash}.${proofHash}.validation-proof.json`;
      const envelopePath=`custody/${prefix}/${envelopeHash}.envelope.json`;
      const receiptPath=`receipts/${prefix}/${envelopeHash}.receipt.json`;
      const captureProofPath=`proofs/${prefix}/${envelopeHash}.capture-proof.json`;
      const state=await repositoryState();
      const [storedEnvelope,storedReceipt,storedCaptureProof,existingProof]=await Promise.all([
        contentMeta(state.owner,state.name,envelopePath),
        contentMeta(state.owner,state.name,receiptPath),
        contentMeta(state.owner,state.name,captureProofPath),
        contentMeta(state.owner,state.name,proofPath)
      ]);
      const envelopeBytes=Buffer.from(JSON.stringify(envelope)+"\n","utf8");
      if(storedEnvelope?.sha!==gitBlobSha(envelopeBytes)||!storedReceipt?.sha||!storedCaptureProof?.sha)
        throw new Error("ARCA_DURABLE_CUSTODY_CAPTURE_NOT_STORED");
      if(typeof storedReceipt.content!=="string"||storedReceipt.encoding!=="base64"||
         typeof storedCaptureProof?.content!=="string"||storedCaptureProof.encoding!=="base64")
        throw new Error("ARCA_DURABLE_CUSTODY_RECEIPT_CONTENT_UNAVAILABLE");
      let receipt;
      try{receipt=JSON.parse(Buffer.from(storedReceipt.content,"base64").toString("utf8"))}
      catch{throw new Error("ARCA_DURABLE_CUSTODY_RECEIPT_CONTENT_INVALID")}
      let captureProof;
      try{captureProof=JSON.parse(Buffer.from(storedCaptureProof.content,"base64").toString("utf8"))}
      catch{throw new Error("ARCA_DURABLE_CUSTODY_CAPTURE_PROOF_INVALID")}
      const {receiptHash:storedReceiptHash,...receiptBody}=receipt??{};
      validatePublicSafety(receipt);
      if(receipt?.envelopeHash!==envelopeHash||
         receipt?.vaultRepository!==repo||receipt?.vaultBranch!==targetBranch||
         ![PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA,PORTAL_RELATED_DOCUMENTS_PROOF_SCHEMA_V03,PORTAL_AUTH_VALIDATION_PROOF_SCHEMA].includes(receipt?.proofSchema)||
         receipt?.captureProofHash!==sha256(stableStringify(captureProof))||
         storedCaptureProof.sha!==gitBlobSha(Buffer.from(stableStringify(captureProof)+"\n","utf8"))||
         storedReceiptHash!==proof.durableCustody.receiptHash||
         storedReceiptHash!==sha256(stableStringify(receiptBody)))
        throw new Error("ARCA_DURABLE_CUSTODY_RECEIPT_BINDING_INVALID");
      if(captureProof?.probeStatus!=="CAPTURING"||captureProof?.captureStatus!=="CAPTURED_AND_SEALED"||
         captureProof?.validationStatus!=="PENDING"||
         proof.scopeHash!==captureProof.scopeHash||proof.resultHash!==captureProof.resultHash||
         proof.responseBytesSha256!==captureProof.responseBytesSha256||
         proof.responseByteCount!==captureProof.responseByteCount||
         proof.contractId!==captureProof.contractId||proof.httpStatusClass!==captureProof.httpStatusClass||
         proof.httpStatus!==captureProof.httpStatus||proof.httpFailureCode!==captureProof.httpFailureCode)
        throw new Error("ARCA_DURABLE_CUSTODY_STATUS_PROOF_CAPTURE_BINDING_INVALID");

      if(existingProof){
        if(existingProof.sha!==proofBlobSha)throw new Error("ARCA_DURABLE_CUSTODY_CONTENT_ADDRESS_CONFLICT");
        return Object.freeze({status:"ALREADY_STORED_PRIVATE",proofHash,proofPath,vaultCommitSha:state.headSha});
      }

      const commit=await request("GET",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/commits/${state.headSha}`);
      const baseTreeSha=requiredText(commit?.tree?.sha,"BASE_TREE_SHA",64).toLowerCase();
      if(!/^[a-f0-9]{40}$/.test(baseTreeSha))throw new Error("ARCA_DURABLE_CUSTODY_TREE_INVALID");
      const blob=await request("POST",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/blobs`,{
        body:{content:proofBytes.toString("base64"),encoding:"base64"}
      });
      if(blob?.sha!==proofBlobSha)throw new Error("ARCA_DURABLE_CUSTODY_BLOB_HASH_MISMATCH");
      const tree=await request("POST",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/trees`,{
        body:{base_tree:baseTreeSha,tree:[{path:proofPath,mode:"100644",type:"blob",sha:proofBlobSha}]}
      });
      const treeSha=requiredText(tree?.sha,"NEW_TREE_SHA",64).toLowerCase();
      if(!/^[a-f0-9]{40}$/.test(treeSha))throw new Error("ARCA_DURABLE_CUSTODY_NEW_TREE_INVALID");
      const createdCommit=await request("POST",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/commits`,{
        body:{message:`custody: validate ${proofHash.slice(0,12)}`,tree:treeSha,parents:[state.headSha]}
      });
      const newCommitSha=requiredText(createdCommit?.sha,"NEW_COMMIT_SHA",64).toLowerCase();
      if(!/^[a-f0-9]{40}$/.test(newCommitSha))throw new Error("ARCA_DURABLE_CUSTODY_NEW_COMMIT_INVALID");
      await request("PATCH",`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.name)}/git/refs/heads/${encodeURIComponent(targetBranch)}`,{
        body:{sha:newCommitSha,force:false}
      });
      const stored=await contentMeta(state.owner,state.name,proofPath);
      if(stored?.sha!==proofBlobSha)throw new Error("ARCA_DURABLE_CUSTODY_POST_WRITE_VERIFY_FAILED");
      return Object.freeze({status:"STORED_PRIVATE",proofHash,proofPath,vaultCommitSha:newCommitSha});
    }
  });
}
