import {probeA2aRuntimeReachability} from "../packages/agent/src/a2a-runtime-reachability.ts";

const endpoint=String(process.env.ARCA_A2A_RUNTIME_ENDPOINT??"").trim();
const allowedOrigin=String(process.env.ARCA_A2A_RUNTIME_ALLOWED_ORIGIN??"").trim();
const candidateKey=String(process.env.ARCA_A2A_CANDIDATE_KEY??"").trim();
const cardSha256=String(process.env.ARCA_A2A_CARD_SHA256??"").trim();
const advertisedId=String(process.env.ARCA_A2A_ADVERTISED_ID??"").trim();

if(!endpoint)throw new Error("ARCA_A2A_RUNTIME_ENDPOINT is required");
if(!allowedOrigin)throw new Error("ARCA_A2A_RUNTIME_ALLOWED_ORIGIN is required");
if(!/^[a-f0-9]{64}$/.test(candidateKey))throw new Error("ARCA_A2A_CANDIDATE_KEY must be SHA-256");
if(!/^[a-f0-9]{64}$/.test(cardSha256))throw new Error("ARCA_A2A_CARD_SHA256 must be SHA-256");
if(!/^a2a-[a-f0-9]{32}$/.test(advertisedId))throw new Error("ARCA_A2A_ADVERTISED_ID invalid");

const result=await probeA2aRuntimeReachability({
  endpoint,
  networkEnabled:true,
  allowedOrigins:[allowedOrigin],
  timeoutMs:15000
});

if(
  result.runtimeContacted!==true||
  result.httpResponseReceived!==true||
  result.requestBodyBytes!==0||
  result.authenticationSent!==false||
  result.jsonRpcSent!==false||
  result.taskSent!==false||
  result.redirectFollowed!==false||
  result.accessGate?.authenticationAttempted!==false||
  result.accessGate?.credentialPresented!==false||
  result.protocolVerified!==false||
  result.capabilitiesVerified!==false||
  result.identityVerified!==false||
  result.trustGranted!==false||
  result.admissionGranted!==false||
  result.dispatchAuthorized!==false
){
  throw new Error("live A2A runtime reachability crossed probe boundary");
}

process.stdout.write(JSON.stringify({
  ok:true,
  provenance:{
    candidateKey,
    advertisedId,
    cardSha256
  },
  endpoint:result.endpoint,
  origin:result.origin,
  hostname:result.hostname,
  dnsAddressCount:result.dnsAddresses.length,
  dnsAddresses:result.dnsAddresses,
  pinnedAddress:result.pinnedAddress,
  pinnedAddressFamily:result.pinnedAddressFamily,
  method:result.method,
  requestBodyBytes:result.requestBodyBytes,
  authenticationSent:result.authenticationSent,
  jsonRpcSent:result.jsonRpcSent,
  taskSent:result.taskSent,
  runtimeContacted:result.runtimeContacted,
  httpResponseReceived:result.httpResponseReceived,
  httpStatus:result.httpStatus,
  redirectReceived:result.redirectReceived,
  redirectFollowed:result.redirectFollowed,
  redirectLocationPersisted:result.redirectLocationPersisted,
  redirectClassification:result.redirectClassification,
  accessGate:result.accessGate,
  tlsAuthorized:result.tlsAuthorized,
  tlsProtocol:result.tlsProtocol,
  serverHeader:result.serverHeader,
  contentType:result.contentType,
  reachabilityState:result.reachabilityState,
  protocolVerified:false,
  capabilitiesVerified:false,
  identityVerified:false,
  trustGranted:false,
  admissionGranted:false,
  dispatchAuthorized:false
})+"\n");
