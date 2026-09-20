import {createHash} from "node:crypto";
import {mkdir,open,readFile,readdir,rename,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {GitHubMeshFederationPeerResolver} from "./github-mesh-federation.mjs";
import {federationPeerBindingHash,federationResolutionFailureCategory} from "./federation-peer-health.mjs";

export const ARCA_FEDERATION_PEER_RECORD_FORMAT="arca-federation-peer-record-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HASH=/^[a-f0-9]{64}$/;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const MAX_RECORD_BYTES=64*1024;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:JSON.stringify(stableValue(value))).digest("hex")}
function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function assertNoSecrets(value,path="record"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecrets(item,`${path}[${index}]`));return}
  if(!plain(value))return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY.test(key))throw new Error("secret-like field not allowed in "+path+"."+key);
    assertNoSecrets(item,path+"."+key);
  }
}
function normalizeTransport(value){
  if(!plain(value)||value.kind!=="github-mailbox")throw new Error("invalid federation peer transport");
  if(!REPOSITORY.test(value.repository||""))throw new Error("invalid federation peer repository");
  if(typeof value.ref!=="string"||!value.ref||value.ref.length>160)throw new Error("invalid federation peer ref");
  if(typeof value.root!=="string"||!value.root||value.root.length>240)throw new Error("invalid federation peer root");
  return {kind:"github-mailbox",repository:value.repository,ref:value.ref,root:value.root};
}
function normalizeIdentity(value,nodeId){
  if(!plain(value))throw new Error("invalid federation peer identity");
  if(value.nodeId!==nodeId)throw new Error("federation peer identity node mismatch");
  if(typeof value.keyFingerprint!=="string"||!HASH.test(value.keyFingerprint))throw new Error("invalid federation peer key fingerprint");
  if(typeof value.identityId!=="string"||value.identityId!==`ed25519:${value.keyFingerprint}`)throw new Error("invalid federation peer identity id");
  return {nodeId,identityId:value.identityId,keyFingerprint:value.keyFingerprint};
}
function bodyForHash(record){
  const {recordHash:_ignored,...body}=record;
  return body;
}
function seal(record){
  const clean=JSON.parse(JSON.stringify(record));
  assertNoSecrets(clean);
  return {...clean,recordHash:sha256(clean)};
}
function validate(record){
  if(!plain(record)||record.format!==ARCA_FEDERATION_PEER_RECORD_FORMAT||record.version!==1)throw new Error("invalid federation peer record");
  safeId(record.peerId,"federation peerId");
  safeId(record.nodeId,"federation nodeId");
  if(!["active","disabled"].includes(record.status))throw new Error("invalid federation peer status");
  if(!Number.isSafeInteger(record.revision)||record.revision<1)throw new Error("invalid federation peer revision");
  normalizeTransport(record.transport);
  normalizeIdentity(record.identity,record.nodeId);
  if(!Number.isFinite(Date.parse(record.createdAt))||!Number.isFinite(Date.parse(record.updatedAt)))throw new Error("invalid federation peer timestamp");
  if(typeof record.recordHash!=="string"||!HASH.test(record.recordHash)||sha256(bodyForHash(record))!==record.recordHash)throw new Error("federation peer record hash mismatch");
  assertNoSecrets(record);
  return record;
}
async function atomicWrite(path,value){
  const serialized=JSON.stringify(value,null,2)+"\n";
  if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error("federation peer record too large");
  const tmp=`${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp,serialized,{encoding:"utf8",flag:"wx"});
  await rename(tmp,path);
}
function sameTransport(a,b){
  return a.kind===b.kind&&a.repository===b.repository&&a.ref===b.ref&&a.root===b.root;
}

export class FederationPeerCatalog{
  constructor({root}={}){
    if(typeof root!=="string"||!root.trim())throw new TypeError("federation peer catalog root required");
    this.root=resolve(root);
  }

  async init(){await mkdir(this.root,{recursive:true});return this}
  path(peerId){return join(this.root,safeId(peerId,"federation peerId")+".json")}

  async get(peerId){
    const path=this.path(peerId);
    try{return validate(JSON.parse(await readFile(path,"utf8")))}
    catch(error){if(error?.code==="ENOENT")return null;throw error}
  }

  async list({includeDisabled=false}={}){
    await this.init();
    const records=[];
    for(const name of (await readdir(this.root)).filter(value=>value.endsWith(".json")).sort()){
      try{
        const record=validate(JSON.parse(await readFile(join(this.root,name),"utf8")));
        if(includeDisabled||record.status==="active")records.push(record);
      }catch{}
    }
    return records;
  }

  async enroll({peerId,nodeId,transport,identity,now=new Date()}={}){
    await this.init();
    safeId(peerId,"federation peerId");safeId(nodeId,"federation nodeId");
    const when=new Date(now);if(!Number.isFinite(when.getTime()))throw new Error("invalid federation enrollment time");
    const normalizedTransport=normalizeTransport(transport);
    const normalizedIdentity=normalizeIdentity(identity,nodeId);
    const record=seal({
      format:ARCA_FEDERATION_PEER_RECORD_FORMAT,
      version:1,
      peerId,
      nodeId,
      status:"active",
      revision:1,
      transport:normalizedTransport,
      identity:normalizedIdentity,
      createdAt:when.toISOString(),
      updatedAt:when.toISOString()
    });
    const handle=await open(this.path(peerId),"wx");
    try{
      const serialized=JSON.stringify(record,null,2)+"\n";
      if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)throw new Error("federation peer record too large");
      await handle.writeFile(serialized,"utf8");
    }finally{await handle.close()}
    return record;
  }

  async disable(peerId,{now=new Date()}={}){
    const current=await this.get(peerId);
    if(!current)throw new Error("federation peer not found: "+peerId);
    if(current.status==="disabled")return current;
    const record=seal({
      ...bodyForHash(current),
      status:"disabled",
      revision:current.revision+1,
      updatedAt:new Date(now).toISOString()
    });
    await atomicWrite(this.path(peerId),record);
    return record;
  }

  async enable(peerId,{now=new Date()}={}){
    const current=await this.get(peerId);
    if(!current)throw new Error("federation peer not found: "+peerId);
    if(current.status==="active")return current;
    const record=seal({
      ...bodyForHash(current),
      status:"active",
      revision:current.revision+1,
      updatedAt:new Date(now).toISOString()
    });
    await atomicWrite(this.path(peerId),record);
    return record;
  }

  async rotateIdentity(peerId,nextIdentity,{expectedCurrentFingerprint,now=new Date()}={}){
    const current=await this.get(peerId);
    if(!current)throw new Error("federation peer not found: "+peerId);
    if(typeof expectedCurrentFingerprint!=="string"||current.identity.keyFingerprint!==expectedCurrentFingerprint)throw new Error("federation identity rotation fingerprint mismatch");
    const identity=normalizeIdentity(nextIdentity,current.nodeId);
    const record=seal({
      ...bodyForHash(current),
      identity,
      revision:current.revision+1,
      updatedAt:new Date(now).toISOString()
    });
    await atomicWrite(this.path(peerId),record);
    return record;
  }

  async resolve(peerId,{mailbox,trustStore,resolverOptions={},peerOptions={},healthStore=null,healthNow=()=>new Date()}={}){
    const record=await this.get(peerId);
    if(!record)throw new Error("federation peer not found: "+peerId);
    if(record.status!=="active")throw new Error("federation peer disabled: "+peerId);
    const mailboxTransport={
      kind:"github-mailbox",
      repository:mailbox?.repository,
      ref:mailbox?.ref,
      root:mailbox?.root
    };
    if(!sameTransport(record.transport,mailboxTransport))throw new Error("federation catalog transport mismatch");
    if(healthStore&&(
      typeof healthStore.assertAttemptAllowed!=="function"||
      typeof healthStore.recordFailure!=="function"||
      typeof healthStore.wrapPeer!=="function"
    ))throw new TypeError("federation healthStore contract required");
    if(typeof healthNow!=="function")throw new TypeError("federation health clock required");
    const bindingHash=federationPeerBindingHash(record);
    if(healthStore)await healthStore.assertAttemptAllowed(peerId,{bindingHash,now:new Date(healthNow())});
    const resolver=new GitHubMeshFederationPeerResolver({...resolverOptions,mailbox,trustStore});
    let peer;
    try{
      peer=await resolver.resolve(record.nodeId,{
        ...peerOptions,
        expectedKeyFingerprint:record.identity.keyFingerprint
      });
    }catch(error){
      const category=federationResolutionFailureCategory(error);
      if(healthStore&&category)await healthStore.recordFailure(peerId,{bindingHash,category,now:new Date(healthNow())});
      throw error;
    }
    if(peer.federation.identity.identityId!==record.identity.identityId)throw new Error("federation catalog identity mismatch");
    if(!healthStore)return peer;
    return healthStore.wrapPeer(peerId,{bindingHash,peer,now:healthNow});
  }
}
