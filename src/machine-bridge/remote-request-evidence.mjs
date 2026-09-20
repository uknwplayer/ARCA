import {mkdir,open,readFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {
  MESH_REQUEST_EVIDENCE_DOMAIN,
  signMeshRequestEvidence,
  verifySignedMeshRequestEvidence
} from "./mesh-identity.mjs";

export const ARCA_REMOTE_REQUEST_EVIDENCE_FORMAT="arca-remote-request-evidence-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const STAGES=new Set(["accepted","rejected","completed"]);
const REJECTION_CATEGORIES=new Set([
  "invalid-request",
  "policy",
  "capability",
  "unavailable",
  "not-accepted",
  "unknown"
]);
const MAX_BYTES=96*1024;
const DEFAULT_TTL_MS=24*60*60*1000;

function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function safeHash(value,label){
  if(typeof value!=="string"||!HASH.test(value))throw new Error("invalid "+label);
  return value;
}
function safeTime(value,label){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid "+label);
  return date;
}
function normalizeTtl(value){
  const ttl=Number(value??DEFAULT_TTL_MS);
  if(!Number.isSafeInteger(ttl)||ttl<1000||ttl>24*60*60*1000)throw new Error("invalid remote request evidence ttl");
  return ttl;
}
function normalizeCommon(input,{stage,nodeId,now}){
  return {
    format:ARCA_REMOTE_REQUEST_EVIDENCE_FORMAT,
    version:1,
    stage,
    nodeId:safeId(nodeId,"remote request evidence nodeId"),
    requestId:safeId(input.requestId,"remote request evidence requestId"),
    jobId:safeId(input.jobId,"remote request evidence jobId"),
    payloadHash:safeHash(input.payloadHash,"remote request evidence payloadHash"),
    ownerBindingHash:safeHash(input.ownerBindingHash,"remote request evidence ownerBindingHash"),
    evidenceAt:safeTime(now,"remote request evidence time").toISOString()
  };
}
function normalizeEvidence(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid remote request evidence");
  if(value.format!==ARCA_REMOTE_REQUEST_EVIDENCE_FORMAT||value.version!==1)throw new Error("unsupported remote request evidence");
  if(!STAGES.has(value.stage))throw new Error("invalid remote request evidence stage");
  const common={
    format:value.format,
    version:value.version,
    stage:value.stage,
    nodeId:safeId(value.nodeId,"remote request evidence nodeId"),
    requestId:safeId(value.requestId,"remote request evidence requestId"),
    jobId:safeId(value.jobId,"remote request evidence jobId"),
    payloadHash:safeHash(value.payloadHash,"remote request evidence payloadHash"),
    ownerBindingHash:safeHash(value.ownerBindingHash,"remote request evidence ownerBindingHash"),
    evidenceAt:safeTime(value.evidenceAt,"remote request evidence time").toISOString()
  };
  if(value.stage==="accepted"){
    if(value.rejectionCategory!==undefined||value.resultHash!==undefined||value.acceptedStatementHash!==undefined)throw new Error("invalid accepted request evidence fields");
    return Object.freeze(common);
  }
  if(value.stage==="rejected"){
    const category=String(value.rejectionCategory??"").trim().toLowerCase();
    if(!REJECTION_CATEGORIES.has(category))throw new Error("invalid remote rejection category");
    if(value.resultHash!==undefined||value.acceptedStatementHash!==undefined)throw new Error("invalid rejected request evidence fields");
    return Object.freeze({...common,rejectionCategory:category});
  }
  const resultHash=safeHash(value.resultHash,"remote request evidence resultHash");
  const acceptedStatementHash=safeHash(value.acceptedStatementHash,"remote request evidence acceptedStatementHash");
  if(value.rejectionCategory!==undefined)throw new Error("invalid completed request evidence fields");
  return Object.freeze({...common,resultHash,acceptedStatementHash});
}
function sameFingerprint(a,b){
  return a.nodeId===b.nodeId&&a.requestId===b.requestId&&a.jobId===b.jobId&&
    a.payloadHash===b.payloadHash&&a.ownerBindingHash===b.ownerBindingHash;
}
function normalizeSigner(nodeId,signer){
  if(!signer?.identity||signer.identity.nodeId!==nodeId)throw new Error("remote request evidence signer must match nodeId");
  if(typeof signer.signRequestEvidence==="function")return signer;
  if(!signer.privateKey)throw new Error("remote request evidence signer interface required");
  return Object.freeze({
    identity:signer.identity,
    signRequestEvidence:(evidence,options)=>signMeshRequestEvidence(evidence,signer,options)
  });
}
function conflict(message,code){
  const error=new Error(message);
  error.code=code;
  return error;
}
function decisionPath(nodeId,requestId){return join(nodeId,requestId,"decision.json")}
function completionPath(nodeId,requestId){return join(nodeId,requestId,"completion.json")}

export function createFileRemoteRequestEvidenceStorage({root}={}){
  if(typeof root!=="string"||!root.trim())throw new TypeError("remote request evidence storage root required");
  const base=resolve(root);
  return Object.freeze({
    async read(key){
      try{return JSON.parse(await readFile(join(base,key),"utf8"))}
      catch(error){if(error?.code==="ENOENT")return null;throw error}
    },
    async create(key,value){
      const path=join(base,key);
      await mkdir(dirname(path),{recursive:true});
      const serialized=JSON.stringify(value,null,2)+"\n";
      if(Buffer.byteLength(serialized)>MAX_BYTES)throw new Error("remote request evidence too large");
      let handle;
      try{
        handle=await open(path,"wx");
        await handle.writeFile(serialized,"utf8");
        return true;
      }catch(error){
        if(error?.code==="EEXIST")return false;
        throw error;
      }finally{await handle?.close()}
    }
  });
}

export function createGitHubRemoteRequestEvidenceStorage({mailbox}={}){
  if(!mailbox||typeof mailbox.path!=="function"||typeof mailbox.store?.getJson!=="function"||typeof mailbox.store?.putJson!=="function"){
    throw new TypeError("GitHub Mesh mailbox storage required");
  }
  return Object.freeze({
    async read(key){
      const loaded=await mailbox.store.getJson(mailbox.path("request-evidence",key));
      return loaded?.value??null;
    },
    async create(key,value){
      const path=mailbox.path("request-evidence",key);
      if(await mailbox.store.getJson(path))return false;
      return mailbox.store.putJson(path,value,{message:"mesh: request evidence "+key});
    }
  });
}

export function verifyRemoteRequestEvidenceStatement(statement,{
  trustStore,
  expectedNodeId,
  expectedRequestId,
  expectedJobId,
  expectedPayloadHash,
  expectedOwnerBindingHash,
  expectedStage,
  now=new Date(),
  clockSkewMs=60_000
}={}){
  verifySignedMeshRequestEvidence(statement,{expectedNodeId,now,clockSkewMs});
  if(!trustStore||typeof trustStore.verify!=="function")throw new TypeError("remote request evidence trustStore.verify() required");
  trustStore.verify(statement,{
    expectedDomain:MESH_REQUEST_EVIDENCE_DOMAIN,
    expectedNodeId,
    now,
    clockSkewMs
  });
  const evidence=normalizeEvidence(statement.payload);
  if(expectedNodeId!==undefined&&evidence.nodeId!==expectedNodeId)throw new Error("remote request evidence node mismatch");
  if(expectedRequestId!==undefined&&evidence.requestId!==expectedRequestId)throw new Error("remote request evidence request mismatch");
  if(expectedJobId!==undefined&&evidence.jobId!==expectedJobId)throw new Error("remote request evidence job mismatch");
  if(expectedPayloadHash!==undefined&&evidence.payloadHash!==expectedPayloadHash)throw new Error("remote request evidence payload mismatch");
  if(expectedOwnerBindingHash!==undefined&&evidence.ownerBindingHash!==expectedOwnerBindingHash)throw new Error("remote request evidence ownership mismatch");
  if(expectedStage!==undefined&&evidence.stage!==expectedStage)throw new Error("remote request evidence stage mismatch");
  return Object.freeze({evidence,statement});
}

function verifyStored(statement,{nodeId,trustStore}){
  if(!statement)return null;
  return verifyRemoteRequestEvidenceStatement(statement,{
    trustStore,
    expectedNodeId:nodeId,
    now:new Date(statement.issuedAt),
    clockSkewMs:0
  });
}

export async function readRemoteRequestEvidence({
  storage,
  nodeId,
  requestId,
  trustStore,
  now=new Date(),
  clockSkewMs=60_000
}={}){
  if(typeof storage?.read!=="function")throw new TypeError("remote request evidence storage.read() required");
  const normalizedNode=safeId(nodeId,"remote request evidence nodeId");
  const normalizedRequest=safeId(requestId,"remote request evidence requestId");
  const decisionRaw=await storage.read(decisionPath(normalizedNode,normalizedRequest));
  if(!decisionRaw)return Object.freeze({state:"unseen",nodeId:normalizedNode,requestId:normalizedRequest,decision:null,completion:null});
  const decision=verifyRemoteRequestEvidenceStatement(decisionRaw,{
    trustStore,
    expectedNodeId:normalizedNode,
    expectedRequestId:normalizedRequest,
    now,
    clockSkewMs
  });
  if(decision.evidence.stage==="rejected"){
    const impossible=await storage.read(completionPath(normalizedNode,normalizedRequest));
    if(impossible)throw new Error("rejected remote request has contradictory completion evidence");
    return Object.freeze({state:"rejected",nodeId:normalizedNode,requestId:normalizedRequest,decision:decision.statement,completion:null});
  }
  if(decision.evidence.stage!=="accepted")throw new Error("invalid remote request decision stage");
  const completionRaw=await storage.read(completionPath(normalizedNode,normalizedRequest));
  if(!completionRaw)return Object.freeze({state:"accepted",nodeId:normalizedNode,requestId:normalizedRequest,decision:decision.statement,completion:null});
  const completion=verifyRemoteRequestEvidenceStatement(completionRaw,{
    trustStore,
    expectedNodeId:normalizedNode,
    expectedRequestId:normalizedRequest,
    expectedJobId:decision.evidence.jobId,
    expectedPayloadHash:decision.evidence.payloadHash,
    expectedOwnerBindingHash:decision.evidence.ownerBindingHash,
    expectedStage:"completed",
    now,
    clockSkewMs
  });
  if(completion.evidence.acceptedStatementHash!==decision.statement.statementHash)throw new Error("remote completion acceptance binding mismatch");
  return Object.freeze({state:"completed",nodeId:normalizedNode,requestId:normalizedRequest,decision:decision.statement,completion:completion.statement});
}

export class RemoteRequestEvidenceLedger{
  constructor({
    nodeId,
    signer,
    trustStore,
    storage,
    now=()=>new Date(),
    ttlMs=DEFAULT_TTL_MS
  }={}){
    this.nodeId=safeId(nodeId,"remote request evidence nodeId");
    this.signer=normalizeSigner(this.nodeId,signer);
    if(!trustStore||typeof trustStore.verify!=="function")throw new TypeError("remote request evidence trustStore.verify() required");
    if(typeof storage?.read!=="function"||typeof storage?.create!=="function")throw new TypeError("remote request evidence storage read/create required");
    if(typeof now!=="function")throw new TypeError("remote request evidence clock required");
    this.trustStore=trustStore;
    this.storage=storage;
    this.now=now;
    this.ttlMs=normalizeTtl(ttlMs);
  }

  async #decision(requestId){
    const raw=await this.storage.read(decisionPath(this.nodeId,safeId(requestId,"remote request evidence requestId")));
    return raw?verifyStored(raw,{nodeId:this.nodeId,trustStore:this.trustStore}):null;
  }

  async #completion(requestId){
    const raw=await this.storage.read(completionPath(this.nodeId,safeId(requestId,"remote request evidence requestId")));
    return raw?verifyStored(raw,{nodeId:this.nodeId,trustStore:this.trustStore}):null;
  }

  async #sign(evidence,at){
    return this.signer.signRequestEvidence(evidence,{issuedAt:at,ttlMs:this.ttlMs});
  }

  async accept(input={}){
    const at=safeTime(input.now??this.now(),"remote acceptance time");
    const evidence=normalizeEvidence(normalizeCommon(input,{stage:"accepted",nodeId:this.nodeId,now:at}));
    const existing=await this.#decision(evidence.requestId);
    if(existing){
      if(!sameFingerprint(existing.evidence,evidence))throw conflict("remote request decision fingerprint conflict","ARCA_REMOTE_REQUEST_EVIDENCE_CONFLICT");
      if(existing.evidence.stage!=="accepted")throw conflict("remote request already rejected","ARCA_REMOTE_REQUEST_REJECTED");
      return Object.freeze({created:false,statement:existing.statement,evidence:existing.evidence});
    }
    const statement=await this.#sign(evidence,at);
    const created=await this.storage.create(decisionPath(this.nodeId,evidence.requestId),statement);
    const decided=created?{statement,evidence}:await this.#decision(evidence.requestId);
    if(!decided)throw new Error("remote request decision disappeared");
    if(!sameFingerprint(decided.evidence,evidence))throw conflict("remote request decision fingerprint conflict","ARCA_REMOTE_REQUEST_EVIDENCE_CONFLICT");
    if(decided.evidence.stage!=="accepted")throw conflict("remote request already rejected","ARCA_REMOTE_REQUEST_REJECTED");
    return Object.freeze({created,statement:decided.statement,evidence:decided.evidence});
  }

  async reject(input={}){
    const at=safeTime(input.now??this.now(),"remote rejection time");
    const category=String(input.rejectionCategory??"unknown").trim().toLowerCase();
    if(!REJECTION_CATEGORIES.has(category))throw new Error("invalid remote rejection category");
    const evidence=normalizeEvidence({...normalizeCommon(input,{stage:"rejected",nodeId:this.nodeId,now:at}),rejectionCategory:category});
    const existing=await this.#decision(evidence.requestId);
    if(existing){
      if(!sameFingerprint(existing.evidence,evidence))throw conflict("remote request decision fingerprint conflict","ARCA_REMOTE_REQUEST_EVIDENCE_CONFLICT");
      if(existing.evidence.stage!=="rejected")throw conflict("remote request already accepted","ARCA_REMOTE_REQUEST_ACCEPTED");
      return Object.freeze({created:false,statement:existing.statement,evidence:existing.evidence});
    }
    const statement=await this.#sign(evidence,at);
    const created=await this.storage.create(decisionPath(this.nodeId,evidence.requestId),statement);
    const decided=created?{statement,evidence}:await this.#decision(evidence.requestId);
    if(!decided)throw new Error("remote request decision disappeared");
    if(!sameFingerprint(decided.evidence,evidence))throw conflict("remote request decision fingerprint conflict","ARCA_REMOTE_REQUEST_EVIDENCE_CONFLICT");
    if(decided.evidence.stage!=="rejected")throw conflict("remote request already accepted","ARCA_REMOTE_REQUEST_ACCEPTED");
    return Object.freeze({created,statement:decided.statement,evidence:decided.evidence});
  }

  async complete(input={}){
    const at=safeTime(input.now??this.now(),"remote completion time");
    const requestId=safeId(input.requestId,"remote request evidence requestId");
    const decision=await this.#decision(requestId);
    if(!decision)throw conflict("remote request has no acceptance decision","ARCA_REMOTE_REQUEST_NOT_ACCEPTED");
    if(decision.evidence.stage!=="accepted")throw conflict("rejected remote request cannot complete","ARCA_REMOTE_REQUEST_REJECTED");
    const common=normalizeCommon(input,{stage:"completed",nodeId:this.nodeId,now:at});
    if(!sameFingerprint(decision.evidence,common))throw conflict("remote completion fingerprint mismatch","ARCA_REMOTE_REQUEST_EVIDENCE_CONFLICT");
    const evidence=normalizeEvidence({
      ...common,
      acceptedStatementHash:safeHash(decision.statement.statementHash,"remote accepted statementHash"),
      resultHash:safeHash(input.resultHash,"remote completion resultHash")
    });
    const existing=await this.#completion(requestId);
    if(existing){
      if(!sameFingerprint(existing.evidence,evidence)||existing.evidence.acceptedStatementHash!==evidence.acceptedStatementHash){
        throw conflict("remote completion fingerprint conflict","ARCA_REMOTE_REQUEST_EVIDENCE_CONFLICT");
      }
      if(existing.evidence.resultHash!==evidence.resultHash)throw conflict("remote completion resultHash conflict","ARCA_REMOTE_REQUEST_RESULT_CONFLICT");
      return Object.freeze({created:false,statement:existing.statement,evidence:existing.evidence});
    }
    const statement=await this.#sign(evidence,at);
    const created=await this.storage.create(completionPath(this.nodeId,requestId),statement);
    const completed=created?{statement,evidence}:await this.#completion(requestId);
    if(!completed)throw new Error("remote completion evidence disappeared");
    if(completed.evidence.resultHash!==evidence.resultHash)throw conflict("remote completion resultHash conflict","ARCA_REMOTE_REQUEST_RESULT_CONFLICT");
    return Object.freeze({created,statement:completed.statement,evidence:completed.evidence});
  }

  async status(requestId){
    const decision=await this.#decision(requestId);
    if(!decision)return Object.freeze({state:"unseen",nodeId:this.nodeId,requestId,decision:null,completion:null});
    if(decision.evidence.stage==="rejected"){
      return Object.freeze({state:"rejected",nodeId:this.nodeId,requestId,decision:decision.statement,completion:null});
    }
    const completion=await this.#completion(requestId);
    return Object.freeze({
      state:completion?"completed":"accepted",
      nodeId:this.nodeId,
      requestId,
      decision:decision.statement,
      completion:completion?.statement??null
    });
  }
}

export async function observeRemoteRequestEvidence(statement,{
  trustStore,
  ownershipStore,
  now=new Date(),
  clockSkewMs=60_000
}={}){
  if(!ownershipStore||typeof ownershipStore.status!=="function")throw new TypeError("remote request evidence ownershipStore.status() required");
  const payload=normalizeEvidence(statement?.payload);
  const ownership=await ownershipStore.status(payload.requestId);
  if(ownership.state==="unbound")throw conflict("remote evidence has no local ownership binding","ARCA_REMOTE_REQUEST_EVIDENCE_UNBOUND");
  const verified=verifyRemoteRequestEvidenceStatement(statement,{
    trustStore,
    expectedNodeId:ownership.selectedNodeId,
    expectedRequestId:ownership.requestId,
    expectedJobId:ownership.jobId,
    expectedPayloadHash:ownership.payloadHash,
    expectedOwnerBindingHash:ownership.bindingHash,
    now,
    clockSkewMs
  });
  if(verified.evidence.stage==="completed"){
    if(typeof ownershipStore.markCompleted!=="function")throw new TypeError("remote request evidence ownershipStore.markCompleted() required");
    await ownershipStore.markCompleted(ownership.requestId,{resultHash:verified.evidence.resultHash,now});
  }
  return Object.freeze({
    stage:verified.evidence.stage,
    requestId:verified.evidence.requestId,
    nodeId:verified.evidence.nodeId,
    statementHash:statement.statementHash,
    resultHash:verified.evidence.resultHash??null,
    rejectionCategory:verified.evidence.rejectionCategory??null,
    automaticFailoverAllowed:false
  });
}
