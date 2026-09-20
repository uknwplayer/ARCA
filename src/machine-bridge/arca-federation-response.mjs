import {createHash,randomUUID} from "node:crypto";
import {
  MESH_FEDERATION_RESPONSE_DOMAIN,
  signMeshStatement,
  verifyMeshNodeIdentity,
  verifyMeshSignedStatement
} from "./mesh-identity.mjs";
import {verifyArcaFederationIntroduction} from "./arca-node-manifest.mjs";

export const ARCA_FEDERATION_RESPONSE_FORMAT="arca-federation-response-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_NODE=/^[A-Za-z0-9._-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const DECISIONS=Object.freeze([
  "accept-evaluation",
  "decline",
  "request-info",
  "offer-endpoint",
  "offer-auth-method",
  "limit-scope"
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
function sha256(value){return createHash("sha256").update(stable(value)).digest("hex")}
function iso(value){
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))throw new Error("invalid timestamp");
  return d.toISOString();
}

export function hashArcaFederationIntroduction(introduction){
  if(!verifyArcaFederationIntroduction(introduction))throw new Error("valid introduction required");
  return sha256(introduction);
}

export function createArcaFederationResponse({
  introduction,
  responderNodeId,
  responderIdentity=null,
  decision,
  responseId=randomUUID(),
  issuedAt=new Date()
}={}){
  if(!verifyArcaFederationIntroduction(introduction))throw new Error("valid introduction required");
  if(typeof responderNodeId!=="string"||!SAFE_NODE.test(responderNodeId))throw new Error("invalid responderNodeId");
  if(!DECISIONS.includes(decision))throw new Error("unsupported decision");
  if(responderIdentity!==null){
    if(!verifyMeshNodeIdentity(responderIdentity)||responderIdentity.nodeId!==responderNodeId)throw new Error("invalid responder identity");
  }
  const body={
    format:ARCA_FEDERATION_RESPONSE_FORMAT,
    version:1,
    responseId:String(responseId),
    issuedAt:iso(issuedAt),
    introductionId:introduction.introductionId,
    introductionSha256:hashArcaFederationIntroduction(introduction),
    responderNodeId,
    responderIdentity,
    decision,
    evaluationConsent:decision==="accept-evaluation"||decision==="limit-scope",
    trustGranted:false,
    admissionGranted:false,
    dispatchGranted:false,
    executionGranted:false
  };
  if(!SAFE_ID.test(body.responseId))throw new Error("invalid responseId");
  return Object.freeze({...body,responseHash:sha256(body)});
}

export function verifyArcaFederationResponse(response,{introduction}={}){
  if(!plain(response)||response.format!==ARCA_FEDERATION_RESPONSE_FORMAT||response.version!==1)return false;
  if(!SAFE_ID.test(response.responseId??"")||!SAFE_NODE.test(response.responderNodeId??""))return false;
  if(!DECISIONS.includes(response.decision))return false;
  if(response.responderIdentity!==null&&response.responderIdentity!==undefined){
    if(!verifyMeshNodeIdentity(response.responderIdentity)||response.responderIdentity.nodeId!==response.responderNodeId)return false;
  }
  const consent=response.decision==="accept-evaluation"||response.decision==="limit-scope";
  if(response.evaluationConsent!==consent)return false;
  if(response.trustGranted!==false||response.admissionGranted!==false||response.dispatchGranted!==false||response.executionGranted!==false)return false;
  if(!HASH.test(response.introductionSha256??"")||!HASH.test(response.responseHash??""))return false;
  try{iso(response.issuedAt)}catch{return false}
  const {responseHash,...body}=response;
  if(sha256(body)!==responseHash)return false;
  if(introduction!==undefined){
    if(!verifyArcaFederationIntroduction(introduction))return false;
    if(response.introductionId!==introduction.introductionId)return false;
    if(response.introductionSha256!==hashArcaFederationIntroduction(introduction))return false;
  }
  return true;
}

export function signArcaFederationResponse(response,signer,options={}){
  if(!verifyArcaFederationResponse(response))throw new Error("invalid response");
  if(response.responderIdentity===null)throw new Error("signed response requires responder identity");
  if(response.responderNodeId!==signer?.identity?.nodeId)throw new Error("response signer mismatch");
  return signMeshStatement(response,{...options,...signer,domain:MESH_FEDERATION_RESPONSE_DOMAIN});
}

export function verifySignedArcaFederationResponse(statement,{introduction,...options}={}){
  verifyMeshSignedStatement(statement,{...options,expectedDomain:MESH_FEDERATION_RESPONSE_DOMAIN});
  if(!verifyArcaFederationResponse(statement.payload,{introduction}))throw new Error("invalid signed response");
  if(statement.payload.responderNodeId!==statement.signer.nodeId)throw new Error("response signer mismatch");
  return true;
}
