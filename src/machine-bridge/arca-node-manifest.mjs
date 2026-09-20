import {createHash,randomUUID} from "node:crypto";
import {
  MESH_ARCA_NODE_MANIFEST_DOMAIN,
  MESH_FEDERATION_INTRODUCTION_DOMAIN,
  signMeshStatement,
  verifyMeshNodeIdentity,
  verifyMeshSignedStatement
} from "./mesh-identity.mjs";

export const ARCA_NODE_MANIFEST_FORMAT="arca-node-manifest-v1";
export const ARCA_FEDERATION_INTRODUCTION_FORMAT="arca-federation-introduction-v1";

const SAFE_NODE=/^[A-Za-z0-9._-]{1,120}$/;
const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_TTL_MS=7*24*60*60*1000;
const MAX_URL=2048;
const RESPONSE_OPTIONS=Object.freeze([
  "accept-evaluation",
  "decline",
  "request-info",
  "offer-endpoint",
  "offer-auth-method",
  "limit-scope"
]);
const PRINCIPLES=Object.freeze([
  "discovery-is-not-trust",
  "capability-is-not-authorization",
  "admission-before-dispatch",
  "no-arbitrary-remote-execution",
  "consent-based-federation"
]);

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonical(value[key]);
    return out;
  }
  return value;
}
function stable(value){return JSON.stringify(canonical(value))}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function safeString(value,label,max=512){
  const text=String(value??"").trim();
  if(!text)throw new Error(label+" required");
  if(text.length>max)throw new Error(label+" too long");
  return text;
}
function safeNode(value,label="nodeId"){
  const text=safeString(value,label,120);
  if(!SAFE_NODE.test(text))throw new Error("invalid "+label);
  return text;
}
function safeId(value,label){
  const text=safeString(value,label,160);
  if(!SAFE_ID.test(text))throw new Error("invalid "+label);
  return text;
}
function cleanHttpsUrl(value,label){
  const text=safeString(value,label,MAX_URL);
  const url=new URL(text);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error(label+" must be clean HTTPS");
  return url.toString();
}
function iso(value,label){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid "+label);
  return date.toISOString();
}
function normalizeCapabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("capabilities must be array");
  return Object.freeze([...new Set(values.map(value=>safeString(value,"capability",120)))].sort());
}
function bodyWithoutHash(value){
  const {manifestHash:_manifestHash,...body}=value;
  return body;
}
function manifestAbout(){
  return Object.freeze({
    name:"ARCA",
    description:"Open architecture for discovery, auditable cooperation and consent-based federation among distributed agents, AI systems and workers.",
    principles:PRINCIPLES
  });
}

export function createArcaNodeManifest({
  nodeId,
  identity,
  version="0.3.0",
  capabilities=[],
  manifestUrl,
  repositoryUrl,
  specificationUrl,
  securityModelUrl
}={}){
  const normalizedNodeId=safeNode(nodeId);
  if(!verifyMeshNodeIdentity(identity)||identity.nodeId!==normalizedNodeId)throw new Error("valid Mesh identity matching nodeId required");
  const docs={
    repository:cleanHttpsUrl(repositoryUrl,"repositoryUrl")
  };
  if(specificationUrl)docs.specification=cleanHttpsUrl(specificationUrl,"specificationUrl");
  if(securityModelUrl)docs.securityModel=cleanHttpsUrl(securityModelUrl,"securityModelUrl");
  const body={
    format:ARCA_NODE_MANIFEST_FORMAT,
    version:1,
    arcaVersion:safeString(version,"ARCA version",80),
    nodeId:normalizedNodeId,
    identity,
    about:manifestAbout(),
    trustModel:Object.freeze({
      discoveryCreatesTrust:false,
      capabilityGrantsPermission:false,
      admissionRequiredBeforeDispatch:true,
      arbitraryRemoteExecution:false,
      consentRequiredForFederation:true
    }),
    protocols:Object.freeze({
      introduction:ARCA_FEDERATION_INTRODUCTION_FORMAT,
      supported:Object.freeze(["a2a","mcp","machine-bridge"])
    }),
    capabilities:normalizeCapabilities(capabilities),
    responseOptions:RESPONSE_OPTIONS,
    documentation:Object.freeze(docs),
    manifestUrl:manifestUrl?cleanHttpsUrl(manifestUrl,"manifestUrl"):null
  };
  return Object.freeze({...body,manifestHash:sha256(body)});
}

export function verifyArcaNodeManifest(manifest){
  if(!plain(manifest)||manifest.format!==ARCA_NODE_MANIFEST_FORMAT||manifest.version!==1)return false;
  if(!SAFE_NODE.test(manifest.nodeId??""))return false;
  if(!verifyMeshNodeIdentity(manifest.identity)||manifest.identity.nodeId!==manifest.nodeId)return false;
  if(!plain(manifest.about)||manifest.about.name!=="ARCA")return false;
  if(!Array.isArray(manifest.about.principles)||manifest.about.principles.some(value=>!PRINCIPLES.includes(value)))return false;
  if(!plain(manifest.trustModel))return false;
  if(manifest.trustModel.discoveryCreatesTrust!==false)return false;
  if(manifest.trustModel.capabilityGrantsPermission!==false)return false;
  if(manifest.trustModel.admissionRequiredBeforeDispatch!==true)return false;
  if(manifest.trustModel.arbitraryRemoteExecution!==false)return false;
  if(manifest.trustModel.consentRequiredForFederation!==true)return false;
  if(manifest.protocols?.introduction!==ARCA_FEDERATION_INTRODUCTION_FORMAT)return false;
  if(!Array.isArray(manifest.protocols?.supported))return false;
  if(!Array.isArray(manifest.responseOptions)||RESPONSE_OPTIONS.some(value=>!manifest.responseOptions.includes(value)))return false;
  if(typeof manifest.manifestHash!=="string"||!HASH.test(manifest.manifestHash))return false;
  try{
    if(manifest.manifestUrl!==null&&manifest.manifestUrl!==undefined)cleanHttpsUrl(manifest.manifestUrl,"manifestUrl");
    cleanHttpsUrl(manifest.documentation?.repository,"repositoryUrl");
  }catch{return false}
  return sha256(bodyWithoutHash(manifest))===manifest.manifestHash;
}

export function signArcaNodeManifest(manifest,signer,options={}){
  if(!verifyArcaNodeManifest(manifest))throw new Error("invalid ARCA node manifest");
  if(manifest.nodeId!==signer?.identity?.nodeId)throw new Error("manifest nodeId must match signer");
  return signMeshStatement(manifest,{...options,...signer,domain:MESH_ARCA_NODE_MANIFEST_DOMAIN});
}

export function verifySignedArcaNodeManifest(statement,options={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_ARCA_NODE_MANIFEST_DOMAIN});
  if(!verifyArcaNodeManifest(statement.payload))throw new Error("signed ARCA node manifest invalid");
  if(statement.payload.nodeId!==statement.signer.nodeId)throw new Error("signed ARCA node manifest signer mismatch");
  return true;
}

export function createArcaFederationIntroduction({
  manifest,
  candidateKey,
  advertisedId,
  discoverySourceKind,
  discoveryReferenceSha256,
  requestedScopes=["federation-evaluation"],
  introductionId=randomUUID(),
  issuedAt=new Date(),
  ttlMs=24*60*60*1000
}={}){
  if(!verifyArcaNodeManifest(manifest))throw new Error("valid ARCA node manifest required");
  const ttl=Number(ttlMs);
  if(!Number.isSafeInteger(ttl)||ttl<60_000||ttl>MAX_TTL_MS)throw new Error("invalid introduction ttl");
  const issued=new Date(issuedAt);
  if(!Number.isFinite(issued.getTime()))throw new Error("invalid introduction issuedAt");
  const source=safeString(discoverySourceKind,"discovery source kind",120);
  const refHash=safeString(discoveryReferenceSha256,"discovery reference hash",64);
  if(!HASH.test(refHash))throw new Error("invalid discovery reference hash");
  const scopes=normalizeCapabilities(requestedScopes);
  if(scopes.length<1)throw new Error("at least one requested scope required");
  return Object.freeze({
    format:ARCA_FEDERATION_INTRODUCTION_FORMAT,
    version:1,
    introductionId:safeId(introductionId,"introductionId"),
    issuedAt:issued.toISOString(),
    expiresAt:new Date(issued.getTime()+ttl).toISOString(),
    sender:Object.freeze({
      nodeId:manifest.nodeId,
      identityId:manifest.identity.identityId,
      keyFingerprint:manifest.identity.keyFingerprint
    }),
    about:Object.freeze({
      name:"ARCA",
      description:manifest.about.description,
      trustSummary:"Discovery is not trust. Capabilities are declarations, not authorization. Federation requires explicit consent and admission."
    }),
    manifest:Object.freeze({
      format:manifest.format,
      hash:manifest.manifestHash,
      url:manifest.manifestUrl,
      repository:manifest.documentation.repository
    }),
    discovery:Object.freeze({
      candidateKey:safeString(candidateKey,"candidateKey",128),
      advertisedId:safeString(advertisedId,"advertisedId",160),
      sourceKind:source,
      referenceSha256:refHash
    }),
    proposal:Object.freeze({
      kind:"federation-enrollment-evaluation",
      requestedScopes:scopes,
      taskIncluded:false,
      executionRequested:false,
      trustGrantRequested:false,
      admissionRequested:false,
      authMaterialRequested:false
    }),
    responseOptions:RESPONSE_OPTIONS
  });
}

export function verifyArcaFederationIntroduction(introduction,{manifest}={}){
  if(!plain(introduction)||introduction.format!==ARCA_FEDERATION_INTRODUCTION_FORMAT||introduction.version!==1)return false;
  if(!SAFE_ID.test(introduction.introductionId??""))return false;
  if(!SAFE_NODE.test(introduction.sender?.nodeId??""))return false;
  if(!HASH.test(introduction.sender?.keyFingerprint??""))return false;
  if(!plain(introduction.proposal))return false;
  if(introduction.proposal.taskIncluded!==false||introduction.proposal.executionRequested!==false)return false;
  if(introduction.proposal.trustGrantRequested!==false||introduction.proposal.admissionRequested!==false)return false;
  if(introduction.proposal.authMaterialRequested!==false)return false;
  if(!Array.isArray(introduction.proposal.requestedScopes)||introduction.proposal.requestedScopes.length<1)return false;
  if(!Array.isArray(introduction.responseOptions)||RESPONSE_OPTIONS.some(value=>!introduction.responseOptions.includes(value)))return false;
  const issued=Date.parse(iso(introduction.issuedAt,"introduction issuedAt"));
  const expires=Date.parse(iso(introduction.expiresAt,"introduction expiresAt"));
  if(expires<=issued||expires-issued>MAX_TTL_MS)return false;
  if(!HASH.test(introduction.discovery?.referenceSha256??""))return false;
  if(manifest!==undefined){
    if(!verifyArcaNodeManifest(manifest))return false;
    if(introduction.sender.nodeId!==manifest.nodeId)return false;
    if(introduction.sender.identityId!==manifest.identity.identityId)return false;
    if(introduction.sender.keyFingerprint!==manifest.identity.keyFingerprint)return false;
    if(introduction.manifest?.hash!==manifest.manifestHash)return false;
  }
  return true;
}

export function signArcaFederationIntroduction(introduction,signer,options={}){
  if(!verifyArcaFederationIntroduction(introduction))throw new Error("invalid ARCA federation introduction");
  if(introduction.sender.nodeId!==signer?.identity?.nodeId)throw new Error("introduction sender must match signer");
  return signMeshStatement(introduction,{...options,...signer,domain:MESH_FEDERATION_INTRODUCTION_DOMAIN});
}

export function verifySignedArcaFederationIntroduction(statement,{manifest,...options}={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_FEDERATION_INTRODUCTION_DOMAIN});
  if(!verifyArcaFederationIntroduction(statement.payload,{manifest}))throw new Error("signed ARCA federation introduction invalid");
  if(statement.payload.sender.nodeId!==statement.signer.nodeId)throw new Error("signed ARCA federation introduction signer mismatch");
  return true;
}

export function renderArcaFederationIntroductionText(introduction){
  if(!verifyArcaFederationIntroduction(introduction))throw new Error("valid ARCA federation introduction required");
  const manifestPointer=introduction.manifest.url??introduction.manifest.repository;
  return [
    "ARCA Federation Introduction",
    "",
    introduction.about.description,
    "",
    "Why you received this: an agent endpoint associated with this recipient was discovered through "+introduction.discovery.sourceKind+".",
    "This message does not contain a task and does not request credentials, trust, admission, or execution.",
    "Federation is consent-based and may be declined or scope-limited.",
    "",
    "Sender node: "+introduction.sender.nodeId,
    "Public key fingerprint: "+introduction.sender.keyFingerprint,
    "Manifest SHA-256: "+introduction.manifest.hash,
    "Manifest / project reference: "+manifestPointer,
    "",
    "Requested scope: "+introduction.proposal.requestedScopes.join(", "),
    "Accepted responses: "+introduction.responseOptions.join(" | ")
  ].join("\n");
}
