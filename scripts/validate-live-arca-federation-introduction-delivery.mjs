import {generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";
import {
  createArcaFederationIntroduction,
  createArcaNodeManifest
} from "../src/machine-bridge/arca-node-manifest.mjs";
import {deliverArcaFederationIntroduction} from "../packages/agent/src/arca-federation-introduction-delivery.ts";

const endpoint=String(process.env.ARCA_INTRODUCTION_ENDPOINT??"").trim();
const allowedOrigin=String(process.env.ARCA_INTRODUCTION_ALLOWED_ORIGIN??"").trim();
const candidateKey=String(process.env.ARCA_A2A_CANDIDATE_KEY??"").trim();
const advertisedId=String(process.env.ARCA_A2A_ADVERTISED_ID??"").trim();
const referenceSha256=String(process.env.ARCA_A2A_REFERENCE_SHA256??"").trim();
const cardSha256=String(process.env.ARCA_A2A_CARD_SHA256??"").trim();
const confirmSend=String(process.env.ARCA_INTRODUCTION_CONFIRM_SEND??"").trim().toLowerCase();

if(confirmSend!=="true")throw new Error("ARCA introduction send requires explicit confirm_send=true");
if(!endpoint)throw new Error("ARCA_INTRODUCTION_ENDPOINT is required");
if(!allowedOrigin)throw new Error("ARCA_INTRODUCTION_ALLOWED_ORIGIN is required");
if(!/^[a-f0-9]{64}$/.test(candidateKey))throw new Error("ARCA_A2A_CANDIDATE_KEY must be SHA-256");
if(!/^a2a-[a-f0-9]{32}$/.test(advertisedId))throw new Error("ARCA_A2A_ADVERTISED_ID invalid");
if(!/^[a-f0-9]{64}$/.test(referenceSha256))throw new Error("ARCA_A2A_REFERENCE_SHA256 must be SHA-256");
if(!/^[a-f0-9]{64}$/.test(cardSha256))throw new Error("ARCA_A2A_CARD_SHA256 must be SHA-256");

const generated=generateMeshNodeIdentity("arca-introduction-pilot");
const manifest=createArcaNodeManifest({
  nodeId:generated.identity.nodeId,
  identity:generated.identity,
  version:"0.3.0",
  capabilities:["federation-introduction","consent-response"],
  repositoryUrl:"https://github.com/example/arca"
});
const now=new Date();
const introduction=createArcaFederationIntroduction({
  manifest,
  candidateKey,
  advertisedId,
  discoverySourceKind:"a2a-github-repository",
  discoveryReferenceSha256:referenceSha256,
  requestedScopes:["federation-evaluation"],
  introductionId:"intro-"+now.getTime(),
  issuedAt:now,
  ttlMs:24*60*60*1000
});

const result=await deliverArcaFederationIntroduction({
  endpoint,
  allowedOrigins:[allowedOrigin],
  manifest,
  introduction,
  networkEnabled:true,
  timeoutMs:15000
});

if(
  result.authenticationSent!==false||
  result.jsonRpcSent!==false||
  result.taskSent!==false||
  result.redirectFollowed!==false||
  result.recipientAcknowledged!==false||
  result.trustGranted!==false||
  result.admissionGranted!==false||
  result.dispatchAuthorized!==false||
  result.executionAuthorized!==false
){
  throw new Error("ARCA introduction delivery crossed the authorized boundary");
}

process.stdout.write(JSON.stringify({
  ok:true,
  liveSend:true,
  senderMode:"ephemeral-pilot-identity",
  provenance:{
    candidateKey,
    advertisedId,
    referenceSha256,
    cardSha256
  },
  introductionId:introduction.introductionId,
  manifestHash:manifest.manifestHash,
  endpoint:result.endpoint,
  origin:result.origin,
  dnsAddressCount:result.dnsAddresses.length,
  pinnedAddress:result.pinnedAddress,
  pinnedAddressFamily:result.pinnedAddressFamily,
  method:result.method,
  mediaType:result.mediaType,
  requestBodyBytes:result.requestBodyBytes,
  requestBodySha256:result.requestBodySha256,
  requestBodyPersisted:false,
  authenticationSent:false,
  jsonRpcSent:false,
  taskSent:false,
  introductionTransmitted:result.introductionTransmitted,
  httpResponseReceived:result.httpResponseReceived,
  httpStatus:result.httpStatus,
  redirectReceived:result.redirectReceived,
  redirectFollowed:false,
  redirectClassification:result.redirectClassification,
  accessGate:result.accessGate,
  deliveryState:result.deliveryState,
  recipientAcknowledged:false,
  protocolVerified:false,
  identityVerified:false,
  trustGranted:false,
  admissionGranted:false,
  dispatchAuthorized:false,
  executionAuthorized:false
})+"\n");
