import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes
} from "node:crypto";
import {
  MESH_ENCRYPTION_KEY_DOMAIN,
  signMeshStatement,
  verifyMeshSignedStatement
} from "./mesh-identity.mjs";

export const ARCA_MESH_ENCRYPTION_RECIPIENT_FORMAT="arca-mesh-encryption-recipient-v1";
export const ARCA_MESH_ENCRYPTED_ENVELOPE_FORMAT="arca-mesh-encrypted-envelope-v1";
export const ARCA_MESH_DECRYPTION_PROOF_FORMAT="arca-mesh-decryption-proof-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const MAX_PAYLOAD_BYTES=512*1024;
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
function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function cloneJson(value){
  let serialized;
  try{serialized=JSON.stringify(value)}catch{throw new TypeError("Mesh encrypted payload must be JSON serializable")}
  if(serialized===undefined)throw new TypeError("Mesh encrypted payload required");
  if(Buffer.byteLength(serialized)>MAX_PAYLOAD_BYTES)throw new RangeError("Mesh encrypted payload exceeds "+MAX_PAYLOAD_BYTES+" bytes");
  return JSON.parse(serialized);
}
function assertNoStructuredSecrets(value,path="payload"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoStructuredSecrets(item,path+"["+index+"]"));return}
  if(!plain(value))return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY.test(key))throw new Error("secret-like field not allowed in "+path+"."+key);
    assertNoStructuredSecrets(item,path+"."+key);
  }
}
function xPublicKey(value){
  const key=value?.type==="public"?value:createPublicKey(value);
  if(key.asymmetricKeyType!=="x25519")throw new Error("Mesh encryption requires X25519 public key");
  return key;
}
function xPrivateKey(value){
  const key=value?.type==="private"?value:createPrivateKey(value);
  if(key.asymmetricKeyType!=="x25519")throw new Error("Mesh encryption requires X25519 private key");
  return key;
}
function spkiDer(key){return Buffer.from(xPublicKey(key).export({type:"spki",format:"der"}))}
function keyFingerprint(key){return sha256(spkiDer(key))}
function b64(value,label,expectedBytes){
  if(typeof value!=="string"||!value)throw new Error("invalid "+label);
  let bytes;
  try{bytes=Buffer.from(value,"base64url")}catch{throw new Error("invalid "+label)}
  if(expectedBytes!==undefined&&bytes.length!==expectedBytes)throw new Error("invalid "+label+" length");
  return bytes;
}
function ttl(value){
  const number=Number(value??5*60*1000);
  if(!Number.isSafeInteger(number)||number<1000||number>MAX_TTL_MS)throw new Error("invalid Mesh encrypted envelope ttl");
  return number;
}
function dateMs(value,label){
  const ms=Date.parse(value);
  if(!Number.isFinite(ms))throw new Error("invalid "+label);
  return ms;
}
function headerOf(envelope){
  return {
    format:envelope.format,
    version:envelope.version,
    requestId:envelope.requestId,
    payloadId:envelope.payloadId,
    originNode:envelope.originNode,
    recipientNode:envelope.recipientNode,
    recipientIdentityId:envelope.recipientIdentityId,
    recipientKeyFingerprint:envelope.recipientKeyFingerprint,
    recipientStatementHash:envelope.recipientStatementHash,
    keyAgreement:envelope.keyAgreement,
    kdf:envelope.kdf,
    aead:envelope.aead,
    ephemeralPublicKeySpki:envelope.ephemeralPublicKeySpki,
    salt:envelope.salt,
    iv:envelope.iv,
    issuedAt:envelope.issuedAt,
    expiresAt:envelope.expiresAt
  };
}
function bodyForHash(envelope){
  return {
    ...headerOf(envelope),
    ciphertext:envelope.ciphertext,
    authTag:envelope.authTag,
    ciphertextHash:envelope.ciphertextHash
  };
}
function deriveKey(sharedSecret,salt,header){
  const info=Buffer.from(
    "ARCA-MESH-ENCRYPTED-ENVELOPE-V1\0"+
    header.requestId+"\0"+
    header.payloadId+"\0"+
    header.recipientNode+"\0"+
    header.recipientKeyFingerprint,
    "utf8"
  );
  return Buffer.from(hkdfSync("sha256",sharedSecret,salt,info,32));
}

export function generateMeshEncryptionRecipient(signer,{
  issuedAt=new Date(),
  ttlMs=60*60*1000,
  nonce
}={}){
  if(!signer?.identity||!signer?.privateKey)throw new TypeError("Mesh identity signer required");
  const pair=generateKeyPairSync("x25519");
  const publicDer=spkiDer(pair.publicKey);
  const payload={
    format:ARCA_MESH_ENCRYPTION_RECIPIENT_FORMAT,
    version:1,
    nodeId:signer.identity.nodeId,
    identityId:signer.identity.identityId,
    algorithm:"X25519",
    keyFingerprint:sha256(publicDer),
    publicKeySpki:publicDer.toString("base64"),
    purpose:"mesh-payload-encryption"
  };
  const recipient=signMeshStatement(payload,{
    identity:signer.identity,
    privateKey:signer.privateKey,
    domain:MESH_ENCRYPTION_KEY_DOMAIN,
    issuedAt,
    ttlMs,
    nonce
  });
  return Object.freeze({recipient,privateKey:pair.privateKey});
}

export function verifyMeshEncryptionRecipient(recipient,{
  trustStore=null,
  now=new Date(),
  clockSkewMs=DEFAULT_CLOCK_SKEW_MS
}={}){
  verifyMeshSignedStatement(recipient,{
    expectedDomain:MESH_ENCRYPTION_KEY_DOMAIN,
    now,
    clockSkewMs
  });
  const value=recipient.payload;
  if(!plain(value)||value.format!==ARCA_MESH_ENCRYPTION_RECIPIENT_FORMAT||value.version!==1)throw new Error("invalid Mesh encryption recipient");
  safeId(value.nodeId,"Mesh encryption recipient nodeId");
  if(value.nodeId!==recipient.signer.nodeId)throw new Error("Mesh encryption recipient node mismatch");
  if(value.identityId!==recipient.signer.identityId)throw new Error("Mesh encryption recipient identity mismatch");
  if(value.algorithm!=="X25519"||value.purpose!=="mesh-payload-encryption")throw new Error("unsupported Mesh encryption recipient");
  if(typeof value.keyFingerprint!=="string"||!HASH.test(value.keyFingerprint))throw new Error("invalid Mesh encryption key fingerprint");
  const key=createPublicKey({key:Buffer.from(value.publicKeySpki,"base64"),type:"spki",format:"der"});
  if(key.asymmetricKeyType!=="x25519")throw new Error("Mesh encryption recipient key must be X25519");
  if(keyFingerprint(key)!==value.keyFingerprint)throw new Error("Mesh encryption recipient fingerprint mismatch");
  if(trustStore){
    if(typeof trustStore.verify!=="function")throw new TypeError("Mesh encryption trustStore.verify() required");
    trustStore.verify(recipient,{
      expectedDomain:MESH_ENCRYPTION_KEY_DOMAIN,
      expectedNodeId:value.nodeId,
      now,
      clockSkewMs
    });
  }
  return true;
}

export function encryptMeshPayload(payload,{
  requestId,
  payloadId,
  originNode,
  recipient,
  trustStore=null,
  now=new Date(),
  ttlMs=5*60*1000,
  clockSkewMs=DEFAULT_CLOCK_SKEW_MS
}={}){
  safeId(requestId,"Mesh encrypted requestId");
  safeId(payloadId,"Mesh encrypted payloadId");
  safeId(originNode,"Mesh encrypted originNode");
  const issued=new Date(now);
  if(!Number.isFinite(issued.getTime()))throw new Error("invalid Mesh encrypted envelope issuedAt");
  const lifetime=ttl(ttlMs);
  verifyMeshEncryptionRecipient(recipient,{trustStore,now:issued,clockSkewMs});
  if(issued.getTime()+lifetime>Date.parse(recipient.expiresAt))throw new Error("Mesh encrypted envelope cannot outlive recipient key attestation");
  const normalized=cloneJson(payload);
  assertNoStructuredSecrets(normalized);
  const plaintextHash=sha256(normalized);
  const wrapped={
    format:"arca-mesh-encrypted-payload-v1",
    version:1,
    payloadHash:plaintextHash,
    payload:normalized
  };
  const plaintext=Buffer.from(stable(wrapped),"utf8");
  const ephemeral=generateKeyPairSync("x25519");
  const recipientPublic=createPublicKey({
    key:Buffer.from(recipient.payload.publicKeySpki,"base64"),
    type:"spki",
    format:"der"
  });
  const shared=diffieHellman({privateKey:ephemeral.privateKey,publicKey:recipientPublic});
  const salt=randomBytes(32);
  const iv=randomBytes(12);
  const header={
    format:ARCA_MESH_ENCRYPTED_ENVELOPE_FORMAT,
    version:1,
    requestId,
    payloadId,
    originNode,
    recipientNode:recipient.payload.nodeId,
    recipientIdentityId:recipient.payload.identityId,
    recipientKeyFingerprint:recipient.payload.keyFingerprint,
    recipientStatementHash:recipient.statementHash,
    keyAgreement:"X25519",
    kdf:"HKDF-SHA256",
    aead:"AES-256-GCM",
    ephemeralPublicKeySpki:spkiDer(ephemeral.publicKey).toString("base64"),
    salt:salt.toString("base64url"),
    iv:iv.toString("base64url"),
    issuedAt:issued.toISOString(),
    expiresAt:new Date(issued.getTime()+lifetime).toISOString()
  };
  const key=deriveKey(shared,salt,header);
  const aad=Buffer.from(stable(header),"utf8");
  const cipher=createCipheriv("aes-256-gcm",key,iv,{authTagLength:16});
  cipher.setAAD(aad,{plaintextLength:plaintext.length});
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const authTag=cipher.getAuthTag();
  const envelope={
    ...header,
    ciphertext:ciphertext.toString("base64url"),
    authTag:authTag.toString("base64url"),
    ciphertextHash:sha256(ciphertext)
  };
  return Object.freeze({
    ...envelope,
    envelopeHash:sha256(bodyForHash(envelope))
  });
}

export function verifyMeshEncryptedEnvelope(envelope,{
  recipient,
  trustStore=null,
  now=new Date(),
  clockSkewMs=DEFAULT_CLOCK_SKEW_MS,
  allowExpired=false
}={}){
  if(!plain(envelope)||envelope.format!==ARCA_MESH_ENCRYPTED_ENVELOPE_FORMAT||envelope.version!==1)throw new Error("invalid Mesh encrypted envelope");
  safeId(envelope.requestId,"Mesh encrypted requestId");
  safeId(envelope.payloadId,"Mesh encrypted payloadId");
  safeId(envelope.originNode,"Mesh encrypted originNode");
  safeId(envelope.recipientNode,"Mesh encrypted recipientNode");
  if(envelope.keyAgreement!=="X25519"||envelope.kdf!=="HKDF-SHA256"||envelope.aead!=="AES-256-GCM")throw new Error("unsupported Mesh encrypted envelope algorithms");
  if(!recipient)throw new Error("Mesh encrypted envelope recipient statement required");
  verifyMeshEncryptionRecipient(recipient,{trustStore,now,clockSkewMs});
  if(envelope.recipientNode!==recipient.payload.nodeId)throw new Error("Mesh encrypted envelope recipient node mismatch");
  if(envelope.recipientIdentityId!==recipient.payload.identityId)throw new Error("Mesh encrypted envelope recipient identity mismatch");
  if(envelope.recipientKeyFingerprint!==recipient.payload.keyFingerprint)throw new Error("Mesh encrypted envelope recipient key mismatch");
  if(envelope.recipientStatementHash!==recipient.statementHash)throw new Error("Mesh encrypted envelope recipient statement mismatch");
  const issuedMs=dateMs(envelope.issuedAt,"Mesh encrypted envelope issuedAt");
  const expiresMs=dateMs(envelope.expiresAt,"Mesh encrypted envelope expiresAt");
  if(expiresMs<=issuedMs||expiresMs-issuedMs>MAX_TTL_MS)throw new Error("invalid Mesh encrypted envelope validity window");
  if(expiresMs>Date.parse(recipient.expiresAt))throw new Error("Mesh encrypted envelope outlives recipient key attestation");
  const current=new Date(now).getTime();
  if(!Number.isSafeInteger(clockSkewMs)||clockSkewMs<0||clockSkewMs>5*60*1000)throw new Error("invalid Mesh encrypted envelope clock skew");
  if(current<issuedMs-clockSkewMs)throw new Error("Mesh encrypted envelope not yet valid");
  if(!allowExpired&&current>=expiresMs+clockSkewMs)throw new Error("Mesh encrypted envelope expired");
  const ephemeral=createPublicKey({key:Buffer.from(envelope.ephemeralPublicKeySpki,"base64"),type:"spki",format:"der"});
  if(ephemeral.asymmetricKeyType!=="x25519")throw new Error("Mesh encrypted envelope ephemeral key must be X25519");
  b64(envelope.salt,"Mesh encrypted envelope salt",32);
  b64(envelope.iv,"Mesh encrypted envelope iv",12);
  const ciphertext=b64(envelope.ciphertext,"Mesh encrypted envelope ciphertext");
  b64(envelope.authTag,"Mesh encrypted envelope authTag",16);
  if(!ciphertext.length)throw new Error("Mesh encrypted envelope ciphertext empty");
  if(typeof envelope.ciphertextHash!=="string"||!HASH.test(envelope.ciphertextHash)||envelope.ciphertextHash!==sha256(ciphertext))throw new Error("Mesh encrypted envelope ciphertext hash mismatch");
  if(typeof envelope.envelopeHash!=="string"||!HASH.test(envelope.envelopeHash)||envelope.envelopeHash!==sha256(bodyForHash(envelope)))throw new Error("Mesh encrypted envelope hash mismatch");
  return true;
}

export class MeshEncryptedEnvelopeReplayGuard{
  #seen=new Map();
  constructor({maxEntries=10000}={}){
    if(!Number.isSafeInteger(maxEntries)||maxEntries<100||maxEntries>1_000_000)throw new Error("invalid Mesh encrypted replay guard maxEntries");
    this.maxEntries=maxEntries;
  }
  #prune(nowMs){
    for(const [hash,expiresAt] of this.#seen)if(expiresAt<=nowMs)this.#seen.delete(hash);
    while(this.#seen.size>=this.maxEntries)this.#seen.delete(this.#seen.keys().next().value);
  }
  accept(envelope,{now=new Date(),clockSkewMs=DEFAULT_CLOCK_SKEW_MS}={}){
    const current=new Date(now).getTime();
    this.#prune(current);
    if(this.#seen.has(envelope.envelopeHash))throw new Error("Mesh encrypted envelope replay detected");
    this.#seen.set(envelope.envelopeHash,Date.parse(envelope.expiresAt)+Math.max(0,Number(clockSkewMs)||0));
    return true;
  }
  get size(){return this.#seen.size}
}

export function decryptMeshPayload(envelope,{
  recipient,
  recipientPrivateKey,
  trustStore=null,
  replayGuard=null,
  now=new Date(),
  clockSkewMs=DEFAULT_CLOCK_SKEW_MS
}={}){
  verifyMeshEncryptedEnvelope(envelope,{recipient,trustStore,now,clockSkewMs});
  const privateKey=xPrivateKey(recipientPrivateKey);
  const derivedPublic=createPublicKey(privateKey);
  if(keyFingerprint(derivedPublic)!==recipient.payload.keyFingerprint)throw new Error("Mesh decryption private key does not match recipient");
  const ephemeral=createPublicKey({
    key:Buffer.from(envelope.ephemeralPublicKeySpki,"base64"),
    type:"spki",
    format:"der"
  });
  const shared=diffieHellman({privateKey,publicKey:ephemeral});
  const salt=b64(envelope.salt,"Mesh encrypted envelope salt",32);
  const iv=b64(envelope.iv,"Mesh encrypted envelope iv",12);
  const header=headerOf(envelope);
  const key=deriveKey(shared,salt,header);
  const ciphertext=b64(envelope.ciphertext,"Mesh encrypted envelope ciphertext");
  const tag=b64(envelope.authTag,"Mesh encrypted envelope authTag",16);
  const decipher=createDecipheriv("aes-256-gcm",key,iv,{authTagLength:16});
  decipher.setAAD(Buffer.from(stable(header),"utf8"));
  decipher.setAuthTag(tag);
  let plaintext;
  try{plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()])}
  catch{throw new Error("Mesh encrypted envelope authentication failed")}
  let wrapped;
  try{wrapped=JSON.parse(plaintext.toString("utf8"))}
  catch{throw new Error("Mesh encrypted envelope plaintext is not valid JSON")}
  if(!plain(wrapped)||wrapped.format!=="arca-mesh-encrypted-payload-v1"||wrapped.version!==1)throw new Error("invalid Mesh encrypted payload wrapper");
  const normalized=cloneJson(wrapped.payload);
  assertNoStructuredSecrets(normalized);
  const payloadHash=sha256(normalized);
  if(typeof wrapped.payloadHash!=="string"||wrapped.payloadHash!==payloadHash)throw new Error("Mesh encrypted payload hash mismatch");
  if(replayGuard){
    if(typeof replayGuard.accept!=="function")throw new TypeError("Mesh encrypted replayGuard.accept() required");
    replayGuard.accept(envelope,{now,clockSkewMs});
  }
  const proof=Object.freeze({
    format:ARCA_MESH_DECRYPTION_PROOF_FORMAT,
    version:1,
    requestId:envelope.requestId,
    payloadId:envelope.payloadId,
    originNode:envelope.originNode,
    recipientNode:envelope.recipientNode,
    recipientIdentityId:envelope.recipientIdentityId,
    recipientKeyFingerprint:envelope.recipientKeyFingerprint,
    recipientStatementHash:envelope.recipientStatementHash,
    ciphertextHash:envelope.ciphertextHash,
    envelopeHash:envelope.envelopeHash,
    payloadHash,
    decryptedAt:new Date(now).toISOString()
  });
  return Object.freeze({payload:normalized,proof});
}
