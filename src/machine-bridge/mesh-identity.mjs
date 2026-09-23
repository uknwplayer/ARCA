import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify
} from "node:crypto";

export const ARCA_MESH_NODE_IDENTITY_FORMAT="arca-mesh-node-identity-v1";
export const ARCA_MESH_SIGNED_STATEMENT_FORMAT="arca-mesh-signed-statement-v1";
export const MESH_NODE_ADVERTISEMENT_DOMAIN="arca.mesh.node-advertisement.v1";
export const MESH_RECEIPT_DOMAIN="arca.mesh.receipt.v1";
export const MESH_ENCRYPTION_KEY_DOMAIN="arca.mesh.encryption-key.v1";
export const MESH_REQUEST_EVIDENCE_DOMAIN="arca.mesh.request-evidence.v1";
export const MESH_COGNITIVE_SUBSTITUTION_RECEIPT_DOMAIN="arca.mesh.cognitive-substitution-receipt.v1";
export const MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN="arca.mesh.reconciled-failover-receipt.v1";
export const MESH_VINCE_RECOVERY_RECEIPT_DOMAIN="arca.mesh.vince-recovery-receipt.v1";
export const MESH_ARCA_NODE_MANIFEST_DOMAIN="arca.mesh.arca-node-manifest.v1";
export const MESH_FEDERATION_INTRODUCTION_DOMAIN="arca.mesh.federation-introduction.v1";
export const MESH_FEDERATION_RESPONSE_DOMAIN="arca.mesh.federation-response.v1";

const SAFE_NODE=/^[A-Za-z0-9._-]{1,120}$/;
const SAFE_NONCE=/^[A-Za-z0-9_-]{16,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const DOMAINS=new Set([MESH_NODE_ADVERTISEMENT_DOMAIN,MESH_RECEIPT_DOMAIN,MESH_ENCRYPTION_KEY_DOMAIN,MESH_REQUEST_EVIDENCE_DOMAIN,MESH_COGNITIVE_SUBSTITUTION_RECEIPT_DOMAIN,MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN,MESH_VINCE_RECOVERY_RECEIPT_DOMAIN,MESH_ARCA_NODE_MANIFEST_DOMAIN,MESH_FEDERATION_INTRODUCTION_DOMAIN,MESH_FEDERATION_RESPONSE_DOMAIN]);
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const MAX_PAYLOAD_BYTES=128*1024;
const MAX_TTL_MS=24*60*60*1000;
const DEFAULT_CLOCK_SKEW_MS=60_000;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);
    return out;
  }
  return value;
}
function stable(value){return JSON.stringify(canonicalize(value))}
function sha256(value){return createHash("sha256").update(Buffer.isBuffer(value)?value:typeof value==="string"?value:stable(value)).digest("hex")}
function safeNode(value,label="nodeId"){if(typeof value!=="string"||!SAFE_NODE.test(value))throw new Error("invalid "+label);return value}
function iso(value,label="timestamp"){const time=Date.parse(value);if(!Number.isFinite(time))throw new Error("invalid "+label);return new Date(time).toISOString()}
function cloneJson(value){
  let serialized;
  try{serialized=JSON.stringify(value)}catch{throw new TypeError("mesh signed payload must be JSON serializable")}
  if(serialized===undefined)throw new TypeError("mesh signed payload required");
  if(Buffer.byteLength(serialized)>MAX_PAYLOAD_BYTES)throw new RangeError("mesh signed payload exceeds "+MAX_PAYLOAD_BYTES+" bytes");
  return JSON.parse(serialized);
}
function assertNoSecrets(value,path="payload"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecrets(item,path+"["+index+"]"));return}
  if(!plain(value))return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY.test(key))throw new Error("secret-like field not allowed in "+path+"."+key);
    assertNoSecrets(item,path+"."+key);
  }
}
function publicKeyObject(value){
  const key=value?.type==="public"?value:createPublicKey(value);
  if(key.asymmetricKeyType!=="ed25519")throw new Error("mesh identity requires Ed25519 public key");
  return key;
}
function privateKeyObject(value){
  const key=value?.type==="private"?value:createPrivateKey(value);
  if(key.asymmetricKeyType!=="ed25519")throw new Error("mesh identity requires Ed25519 private key");
  return key;
}
function spkiDer(key){return Buffer.from(publicKeyObject(key).export({type:"spki",format:"der"}))}
function fingerprintForPublicKey(key){return sha256(spkiDer(key))}
function identityBody(value){
  const {descriptorHash:_ignored,...body}=value;
  return body;
}
function unsignedStatementBody(value){
  const {signature:_signature,statementHash:_statementHash,...body}=value;
  return body;
}
function statementForHash(value){
  const {statementHash:_statementHash,...body}=value;
  return body;
}
function normalizeDomain(value){
  const domain=String(value??"").trim();
  if(!DOMAINS.has(domain))throw new Error("unsupported mesh signature domain: "+(domain||"<empty>"));
  return domain;
}
function normalizeNonce(value=randomBytes(18).toString("base64url")){
  const nonce=String(value);
  if(!SAFE_NONCE.test(nonce))throw new Error("invalid mesh signature nonce");
  return nonce;
}
function normalizeTtl(ttlMs){
  const value=Number(ttlMs??5*60*1000);
  if(!Number.isSafeInteger(value)||value<1000||value>MAX_TTL_MS)throw new Error("invalid mesh signed statement ttl");
  return value;
}
function signingBytes(body){return Buffer.from("ARCA-MESH-SIGNED-STATEMENT\0"+stable(body),"utf8")}

export function createMeshNodeIdentity({nodeId,publicKey}={}){
  safeNode(nodeId,"mesh identity nodeId");
  const key=publicKeyObject(publicKey);
  const der=spkiDer(key);
  const keyFingerprint=sha256(der);
  const body={
    format:ARCA_MESH_NODE_IDENTITY_FORMAT,
    version:1,
    algorithm:"Ed25519",
    nodeId,
    identityId:"ed25519:"+keyFingerprint,
    keyFingerprint,
    publicKeySpki:der.toString("base64")
  };
  return Object.freeze({...body,descriptorHash:sha256(body)});
}

export function verifyMeshNodeIdentity(identity){
  if(!plain(identity)||identity.format!==ARCA_MESH_NODE_IDENTITY_FORMAT||identity.version!==1)return false;
  if(identity.algorithm!=="Ed25519"||!SAFE_NODE.test(identity.nodeId||""))return false;
  if(typeof identity.keyFingerprint!=="string"||!HASH.test(identity.keyFingerprint))return false;
  if(identity.identityId!=="ed25519:"+identity.keyFingerprint)return false;
  if(typeof identity.publicKeySpki!=="string"||!identity.publicKeySpki)return false;
  if(typeof identity.descriptorHash!=="string"||!HASH.test(identity.descriptorHash))return false;
  try{
    const key=createPublicKey({key:Buffer.from(identity.publicKeySpki,"base64"),type:"spki",format:"der"});
    if(key.asymmetricKeyType!=="ed25519")return false;
    if(fingerprintForPublicKey(key)!==identity.keyFingerprint)return false;
    return sha256(identityBody(identity))===identity.descriptorHash;
  }catch{return false}
}

export function generateMeshNodeIdentity(nodeId){
  safeNode(nodeId,"mesh identity nodeId");
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  return Object.freeze({identity:createMeshNodeIdentity({nodeId,publicKey}),privateKey});
}

export function signMeshStatement(payload,{
  identity,
  privateKey,
  domain,
  nonce,
  issuedAt=new Date(),
  ttlMs=5*60*1000
}={}){
  if(!verifyMeshNodeIdentity(identity))throw new Error("invalid mesh signer identity");
  const key=privateKeyObject(privateKey);
  const derived=createPublicKey(key);
  if(fingerprintForPublicKey(derived)!==identity.keyFingerprint)throw new Error("mesh private key does not match identity");
  const normalizedDomain=normalizeDomain(domain);
  const normalizedPayload=cloneJson(payload);
  assertNoSecrets(normalizedPayload);
  const issued=new Date(issuedAt);
  if(!Number.isFinite(issued.getTime()))throw new Error("invalid mesh statement issuedAt");
  const ttl=normalizeTtl(ttlMs);
  const body={
    format:ARCA_MESH_SIGNED_STATEMENT_FORMAT,
    version:1,
    domain:normalizedDomain,
    signer:identity,
    nonce:normalizeNonce(nonce),
    issuedAt:issued.toISOString(),
    expiresAt:new Date(issued.getTime()+ttl).toISOString(),
    payloadHash:sha256(normalizedPayload),
    payload:normalizedPayload
  };
  const signature=cryptoSign(null,signingBytes(body),key).toString("base64url");
  const statement={...body,signature};
  return Object.freeze({...statement,statementHash:sha256(statement)});
}

export function verifyMeshSignedStatement(statement,{
  expectedDomain,
  expectedNodeId,
  now=new Date(),
  clockSkewMs=DEFAULT_CLOCK_SKEW_MS
}={}){
  if(!plain(statement)||statement.format!==ARCA_MESH_SIGNED_STATEMENT_FORMAT||statement.version!==1)throw new Error("invalid mesh signed statement");
  const domain=normalizeDomain(statement.domain);
  if(expectedDomain!==undefined&&domain!==expectedDomain)throw new Error("mesh signed statement domain mismatch");
  if(!verifyMeshNodeIdentity(statement.signer))throw new Error("invalid mesh signed statement identity");
  if(expectedNodeId!==undefined&&statement.signer.nodeId!==expectedNodeId)throw new Error("mesh signed statement node mismatch");
  if(!SAFE_NONCE.test(statement.nonce||""))throw new Error("invalid mesh signed statement nonce");
  const issuedMs=Date.parse(iso(statement.issuedAt,"statement issuedAt"));
  const expiresMs=Date.parse(iso(statement.expiresAt,"statement expiresAt"));
  if(expiresMs<=issuedMs||expiresMs-issuedMs>MAX_TTL_MS)throw new Error("invalid mesh signed statement validity window");
  const current=new Date(now).getTime();
  if(!Number.isSafeInteger(clockSkewMs)||clockSkewMs<0||clockSkewMs>5*60*1000)throw new Error("invalid mesh signature clock skew");
  if(current<issuedMs-clockSkewMs)throw new Error("mesh signed statement not yet valid");
  if(current>=expiresMs+clockSkewMs)throw new Error("mesh signed statement expired");
  const payload=cloneJson(statement.payload);
  assertNoSecrets(payload);
  if(statement.payloadHash!==sha256(payload))throw new Error("mesh signed statement payload hash mismatch");
  if(typeof statement.signature!=="string"||!statement.signature)throw new Error("mesh signed statement signature missing");
  if(typeof statement.statementHash!=="string"||!HASH.test(statement.statementHash)||statement.statementHash!==sha256(statementForHash(statement)))throw new Error("mesh signed statement hash mismatch");
  const publicKey=createPublicKey({key:Buffer.from(statement.signer.publicKeySpki,"base64"),type:"spki",format:"der"});
  if(!cryptoVerify(null,signingBytes(unsignedStatementBody(statement)),publicKey,Buffer.from(statement.signature,"base64url")))throw new Error("mesh signed statement signature invalid");
  return true;
}

export function signMeshNodeAdvertisement(advertisement,signer,options={}){
  if(!plain(advertisement))throw new TypeError("mesh node advertisement required");
  if(advertisement.nodeId!==signer?.identity?.nodeId)throw new Error("mesh advertisement nodeId must match signer identity");
  return signMeshStatement(advertisement,{...options,...signer,domain:MESH_NODE_ADVERTISEMENT_DOMAIN});
}

export function verifySignedMeshNodeAdvertisement(statement,options={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_NODE_ADVERTISEMENT_DOMAIN});
  if(!plain(statement.payload)||statement.payload.nodeId!==statement.signer.nodeId)throw new Error("mesh advertisement signer mismatch");
  safeNode(statement.payload.nodeId,"advertisement nodeId");
  return true;
}

export function signMeshReceipt(receipt,signer,options={}){
  if(!plain(receipt))throw new TypeError("mesh receipt required");
  if(receipt.nodeId!==signer?.identity?.nodeId)throw new Error("mesh receipt nodeId must match signer identity");
  return signMeshStatement(receipt,{...options,...signer,domain:MESH_RECEIPT_DOMAIN});
}

export function verifySignedMeshReceipt(statement,options={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_RECEIPT_DOMAIN});
  if(!plain(statement.payload)||statement.payload.nodeId!==statement.signer.nodeId)throw new Error("mesh receipt signer mismatch");
  safeNode(statement.payload.nodeId,"receipt nodeId");
  return true;
}

export function signMeshRequestEvidence(evidence,signer,options={}){
  if(!plain(evidence))throw new TypeError("mesh request evidence required");
  if(evidence.nodeId!==signer?.identity?.nodeId)throw new Error("mesh request evidence nodeId must match signer identity");
  return signMeshStatement(evidence,{...options,...signer,domain:MESH_REQUEST_EVIDENCE_DOMAIN});
}

export function verifySignedMeshRequestEvidence(statement,options={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_REQUEST_EVIDENCE_DOMAIN});
  if(!plain(statement.payload)||statement.payload.nodeId!==statement.signer.nodeId)throw new Error("mesh request evidence signer mismatch");
  safeNode(statement.payload.nodeId,"request evidence nodeId");
  return true;
}

export function signMeshCognitiveSubstitutionReceipt(receipt,signer,options={}){
  if(!plain(receipt))throw new TypeError("cognitive substitution receipt required");
  if(receipt.issuerNodeId!==signer?.identity?.nodeId)throw new Error("cognitive substitution receipt issuerNodeId must match signer identity");
  return signMeshStatement(receipt,{...options,...signer,domain:MESH_COGNITIVE_SUBSTITUTION_RECEIPT_DOMAIN});
}

export function verifySignedMeshCognitiveSubstitutionReceipt(statement,options={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_COGNITIVE_SUBSTITUTION_RECEIPT_DOMAIN});
  if(!plain(statement.payload)||statement.payload.issuerNodeId!==statement.signer.nodeId)throw new Error("cognitive substitution receipt signer mismatch");
  safeNode(statement.payload.issuerNodeId,"cognitive substitution receipt issuerNodeId");
  return true;
}

export function signMeshReconciledFailoverReceipt(receipt,signer,options={}){
  if(!plain(receipt))throw new TypeError("reconciled failover receipt required");
  if(receipt.issuerNodeId!==signer?.identity?.nodeId)throw new Error("reconciled failover receipt issuerNodeId must match signer identity");
  return signMeshStatement(receipt,{...options,...signer,domain:MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN});
}

export function verifySignedMeshReconciledFailoverReceipt(statement,options={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_RECONCILED_FAILOVER_RECEIPT_DOMAIN});
  if(!plain(statement.payload)||statement.payload.issuerNodeId!==statement.signer.nodeId)throw new Error("reconciled failover receipt signer mismatch");
  safeNode(statement.payload.issuerNodeId,"reconciled failover receipt issuerNodeId");
  return true;
}

export class MeshReplayGuard{
  #seen=new Map();
  constructor({maxEntries=10000}={}){
    if(!Number.isSafeInteger(maxEntries)||maxEntries<100||maxEntries>1_000_000)throw new Error("invalid mesh replay guard maxEntries");
    this.maxEntries=maxEntries;
  }
  #key(statement){return statement.signer.identityId+":"+statement.domain+":"+statement.nonce}
  #prune(nowMs){
    for(const [key,expiresAt] of this.#seen)if(expiresAt<=nowMs)this.#seen.delete(key);
    while(this.#seen.size>=this.maxEntries)this.#seen.delete(this.#seen.keys().next().value);
  }
  accept(statement,options={}){
    verifyMeshSignedStatement(statement,options);
    const nowMs=new Date(options.now??new Date()).getTime();
    this.#prune(nowMs);
    const key=this.#key(statement);
    if(this.#seen.has(key))throw new Error("mesh signed statement replay detected");
    const replaySkew=options.clockSkewMs===undefined?DEFAULT_CLOCK_SKEW_MS:Number(options.clockSkewMs);
    this.#seen.set(key,Date.parse(statement.expiresAt)+Math.max(0,replaySkew));
    return true;
  }
  get size(){return this.#seen.size}
}

export class MeshIdentityTrustStore{
  #trusted=new Map();
  trust(identity,{replace=false}={}){
    if(!verifyMeshNodeIdentity(identity))throw new Error("invalid mesh identity");
    const current=this.#trusted.get(identity.nodeId);
    if(current&&current.keyFingerprint!==identity.keyFingerprint&&!replace)throw new Error("mesh identity rotation requires explicit replace for "+identity.nodeId);
    this.#trusted.set(identity.nodeId,identity);
    return identity;
  }
  rotate(nodeId,nextIdentity,{expectedCurrentFingerprint}={}){
    safeNode(nodeId,"mesh trust nodeId");
    if(!verifyMeshNodeIdentity(nextIdentity)||nextIdentity.nodeId!==nodeId)throw new Error("invalid mesh rotated identity");
    const current=this.#trusted.get(nodeId);
    if(!current)throw new Error("mesh identity not trusted: "+nodeId);
    if(expectedCurrentFingerprint&&current.keyFingerprint!==expectedCurrentFingerprint)throw new Error("mesh identity rotation fingerprint mismatch");
    this.#trusted.set(nodeId,nextIdentity);
    return nextIdentity;
  }
  get(nodeId){return this.#trusted.get(String(nodeId))??null}
  verify(statement,options={}){
    verifyMeshSignedStatement(statement,options);
    const trusted=this.#trusted.get(statement.signer.nodeId);
    if(!trusted)throw new Error("untrusted mesh signer: "+statement.signer.nodeId);
    if(trusted.keyFingerprint!==statement.signer.keyFingerprint)throw new Error("mesh signer key is not current for "+statement.signer.nodeId);
    return true;
  }
}
