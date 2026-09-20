import fs from "node:fs";
import path from "node:path";
import {
  createHash,
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv
} from "node:crypto";

export const ENCRYPTED_CUSTODY_ENVELOPE_SCHEMA="arca.encrypted-custody-envelope.v0.1";
export const ENCRYPTED_CUSTODY_PAYLOAD_SCHEMA="arca.encrypted-custody-payload.v0.1";

const MAX_FILES=1000;
const MAX_TOTAL_BYTES=50*1024*1024;

function sha256(value){
  return createHash("sha256").update(value).digest("hex");
}
function stableStringify(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableStringify(value[key])).join(",")+"}";
}
function requiredText(value,field,max=512){
  const text=String(value??"").normalize("NFKC").trim();
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))
    throw new Error(`ARCA_CUSTODY_ENVELOPE_INVALID_${field}`);
  return text;
}
function safeRevision(value){
  const text=requiredText(value,"REVISION",64).toLowerCase();
  if(!/^[a-f0-9]{40,64}$/.test(text))
    throw new Error("ARCA_CUSTODY_ENVELOPE_INVALID_REVISION");
  return text;
}
function safePassphrase(value){
  const text=String(value??"");
  if(text.length<24||text.length>4096)
    throw new Error("ARCA_CUSTODY_ENVELOPE_PASSPHRASE_WEAK");
  return text;
}
function walk(root){
  const base=path.resolve(root);
  if(!fs.existsSync(base)||!fs.statSync(base).isDirectory())
    throw new Error("ARCA_CUSTODY_ENVELOPE_ROOT_INVALID");
  const files=[];
  let totalBytes=0;
  const visit=current=>{
    const entries=fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      const absolute=path.join(current,entry.name);
      const stat=fs.lstatSync(absolute);
      if(stat.isSymbolicLink())
        throw new Error("ARCA_CUSTODY_ENVELOPE_SYMLINK_FORBIDDEN");
      if(stat.isDirectory()){visit(absolute);continue}
      if(!stat.isFile())continue;
      const rel=path.relative(base,absolute).split(path.sep).join("/");
      if(!rel||rel.startsWith("../")||rel.includes("/../"))
        throw new Error("ARCA_CUSTODY_ENVELOPE_PATH_INVALID");
      const bytes=fs.readFileSync(absolute);
      totalBytes+=bytes.byteLength;
      if(files.length+1>MAX_FILES||totalBytes>MAX_TOTAL_BYTES)
        throw new Error("ARCA_CUSTODY_ENVELOPE_BUDGET_EXCEEDED");
      files.push({
        path:rel,
        size:bytes.byteLength,
        sha256:sha256(bytes),
        data:bytes.toString("base64")
      });
    }
  };
  visit(base);
  if(files.length===0)throw new Error("ARCA_CUSTODY_ENVELOPE_EMPTY");
  return {files,totalBytes};
}
function instant(value){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))throw new Error("ARCA_CUSTODY_ENVELOPE_TIME_INVALID");
  return d.toISOString();
}
function derive(passphrase,salt){
  return scryptSync(passphrase,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});
}

export function sealCustodyDirectory({
  root,
  passphrase,
  repository,
  revision,
  scopeHash,
  sealedAt=new Date()
}={}){
  const secret=safePassphrase(passphrase);
  const repo=requiredText(repository,"REPOSITORY");
  const rev=safeRevision(revision);
  const scope=requiredText(scopeHash,"SCOPE_HASH",64).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(scope))
    throw new Error("ARCA_CUSTODY_ENVELOPE_INVALID_SCOPE_HASH");
  const sealedTime=instant(sealedAt);

  const {files,totalBytes}=walk(root);
  const contentRootHash=sha256(stableStringify(files.map(file=>({
    path:file.path,size:file.size,sha256:file.sha256
  }))));

  const payload={
    schema:ENCRYPTED_CUSTODY_PAYLOAD_SCHEMA,
    repository:repo,
    revision:rev,
    scopeHash:scope,
    sealedAt:sealedTime,
    contentRootHash,
    fileCount:files.length,
    totalBytes,
    files
  };
  const plaintext=Buffer.from(stableStringify(payload),"utf8");
  const payloadHash=sha256(plaintext);
  const salt=randomBytes(16);
  const iv=randomBytes(12);
  const key=derive(secret,salt);
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(Buffer.from(ENCRYPTED_CUSTODY_ENVELOPE_SCHEMA,"utf8"));
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const authTag=cipher.getAuthTag();

  return Object.freeze({
    schema:ENCRYPTED_CUSTODY_ENVELOPE_SCHEMA,
    status:"SEALED",
    algorithm:"AES-256-GCM",
    kdf:Object.freeze({name:"scrypt",N:16384,r:8,p:1}),
    repository:repo,
    revision:rev,
    scopeHash:scope,
    sealedAt:sealedTime,
    fileCount:files.length,
    totalBytes,
    contentRootHash,
    payloadHash,
    salt:salt.toString("base64"),
    iv:iv.toString("base64"),
    authTag:authTag.toString("base64"),
    ciphertext:ciphertext.toString("base64"),
    plaintextIncluded:false
  });
}

export function openCustodyEnvelope({envelope,passphrase}={}){
  const secret=safePassphrase(passphrase);
  if(envelope?.schema!==ENCRYPTED_CUSTODY_ENVELOPE_SCHEMA||
     envelope?.status!=="SEALED"||
     envelope?.algorithm!=="AES-256-GCM"||
     envelope?.kdf?.name!=="scrypt"||
     envelope?.plaintextIncluded!==false)
    throw new Error("ARCA_CUSTODY_ENVELOPE_FORMAT_INVALID");

  const salt=Buffer.from(requiredText(envelope.salt,"SALT",256),"base64");
  const iv=Buffer.from(requiredText(envelope.iv,"IV",256),"base64");
  const authTag=Buffer.from(requiredText(envelope.authTag,"AUTH_TAG",256),"base64");
  const ciphertext=Buffer.from(requiredText(envelope.ciphertext,"CIPHERTEXT",100_000_000),"base64");
  if(salt.byteLength!==16||iv.byteLength!==12||authTag.byteLength!==16)
    throw new Error("ARCA_CUSTODY_ENVELOPE_CRYPTO_PARAMS_INVALID");

  const key=derive(secret,salt);
  const decipher=createDecipheriv("aes-256-gcm",key,iv);
  decipher.setAAD(Buffer.from(ENCRYPTED_CUSTODY_ENVELOPE_SCHEMA,"utf8"));
  decipher.setAuthTag(authTag);
  let plaintext;
  try{
    plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  }catch{
    throw new Error("ARCA_CUSTODY_ENVELOPE_AUTH_FAILED");
  }

  if(sha256(plaintext)!==envelope.payloadHash)
    throw new Error("ARCA_CUSTODY_ENVELOPE_PAYLOAD_HASH_MISMATCH");

  const payload=JSON.parse(plaintext.toString("utf8"));
  if(payload?.schema!==ENCRYPTED_CUSTODY_PAYLOAD_SCHEMA||
     payload.repository!==envelope.repository||
     payload.revision!==envelope.revision||
     payload.scopeHash!==envelope.scopeHash||
     payload.sealedAt!==envelope.sealedAt||
     payload.contentRootHash!==envelope.contentRootHash||
     payload.fileCount!==envelope.fileCount||
     payload.totalBytes!==envelope.totalBytes)
    throw new Error("ARCA_CUSTODY_ENVELOPE_BINDING_MISMATCH");

  let total=0;
  for(const file of payload.files??[]){
    if(typeof file.path!=="string"||file.path.startsWith("../")||file.path.includes("/../"))
      throw new Error("ARCA_CUSTODY_ENVELOPE_FILE_PATH_INVALID");
    const bytes=Buffer.from(file.data,"base64");
    total+=bytes.byteLength;
    if(bytes.byteLength!==file.size||sha256(bytes)!==file.sha256)
      throw new Error("ARCA_CUSTODY_ENVELOPE_FILE_HASH_MISMATCH");
  }
  if(total!==payload.totalBytes||payload.files.length!==payload.fileCount)
    throw new Error("ARCA_CUSTODY_ENVELOPE_FILE_COUNT_MISMATCH");

  return Object.freeze(payload);
}
