import {createHash} from "node:crypto";
import {request as httpsRequest} from "node:https";
import {
  classifyA2aAccessGate,
  classifyA2aRuntimeRedirect,
  createPinnedLookup,
  prepareA2aRuntimeNetworkTarget
} from "./a2a-runtime-reachability.ts";
import {
  verifyArcaFederationIntroduction,
  verifyArcaNodeManifest
} from "../../../src/machine-bridge/arca-node-manifest.mjs";

export const ARCA_FEDERATION_INTRODUCTION_DELIVERY_FORMAT="arca-federation-introduction-delivery-v1";
export const ARCA_FEDERATION_INTRODUCTION_MEDIA_TYPE="application/vnd.arca.federation-introduction+json";
const MAX_BODY_BYTES=64*1024;

function stable(value){
  if(Array.isArray(value))return "["+value.map(item=>stable(item)).join(",")+"]";
  if(value&&typeof value==="object"){
    return "{"+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+":"+stable(value[key])).join(",")+"}";
  }
  return JSON.stringify(value);
}
function sha256(value){
  return createHash("sha256").update(value).digest("hex");
}
function makeEnvelope({manifest,introduction}){
  if(!verifyArcaNodeManifest(manifest))throw new Error("valid ARCA node manifest required");
  if(!verifyArcaFederationIntroduction(introduction,{manifest}))throw new Error("valid ARCA federation introduction required");
  const envelope={
    format:ARCA_FEDERATION_INTRODUCTION_DELIVERY_FORMAT,
    version:1,
    purpose:"federation-introduction-only",
    notice:"This message is an introduction only. It contains no task and grants no trust, admission, dispatch, or execution authority.",
    manifest,
    introduction
  };
  const body=Buffer.from(stable(envelope),"utf8");
  if(body.byteLength>MAX_BODY_BYTES)throw new RangeError("ARCA federation introduction delivery body exceeds 64 KiB");
  return {body,envelopeHash:sha256(body)};
}
function postOnce({url,pinnedAddress,addressFamily,timeoutMs,body}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const req=httpsRequest(url,{
      method:"POST",
      headers:{
        Accept:"application/json",
        "Content-Type":ARCA_FEDERATION_INTRODUCTION_MEDIA_TYPE+"; charset=utf-8",
        "Content-Length":String(body.byteLength),
        "User-Agent":"ARCA-Federation-Introduction/0.1",
        Connection:"close"
      },
      timeout:timeoutMs,
      lookup:createPinnedLookup(pinnedAddress,addressFamily),
      agent:false
    },res=>{
      if(settled)return;
      settled=true;
      const socket=res.socket;
      const result={
        statusCode:Number(res.statusCode??0),
        location:typeof res.headers.location==="string"?res.headers.location:null,
        server:typeof res.headers.server==="string"?res.headers.server:null,
        contentType:typeof res.headers["content-type"]==="string"?res.headers["content-type"]:null,
        tlsAuthorized:socket?.authorized===true,
        tlsProtocol:typeof socket?.getProtocol==="function"?socket.getProtocol():null,
        remoteAddress:socket?.remoteAddress??null
      };
      res.destroy();
      resolve(result);
    });
    req.once("timeout",()=>{
      req.destroy(Object.assign(new Error("ARCA federation introduction delivery timeout"),{code:"ARCA_FEDERATION_INTRODUCTION_TIMEOUT"}));
    });
    req.once("error",error=>{
      if(settled)return;
      settled=true;
      reject(error);
    });
    req.end(body);
  });
}
function stateFor(statusCode,redirectClassification,accessGate){
  if(statusCode>=200&&statusCode<300)return "http-accepted-unverified";
  if(statusCode>=300&&statusCode<400){
    if(accessGate?.detected===true)return "access-gated-before-recipient";
    return "redirected-not-followed";
  }
  if(statusCode===401||statusCode===403)return "access-required";
  if(statusCode===404||statusCode===405||statusCode===415)return "receiver-not-compatible";
  if(statusCode>=500)return "receiver-error";
  if(redirectClassification)return "redirected-not-followed";
  return "http-rejected";
}

export async function deliverArcaFederationIntroduction({
  endpoint,
  allowedOrigins=[],
  manifest,
  introduction,
  networkEnabled=false,
  lookupImpl,
  postImpl=postOnce,
  timeoutMs=10000
}={}){
  if(networkEnabled!==true)throw Object.assign(new Error("ARCA federation introduction delivery network disabled"),{code:"ARCA_FEDERATION_INTRODUCTION_NETWORK_DISABLED"});
  const timeout=Number(timeoutMs);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("delivery timeoutMs must be between 1000 and 30000");
  if(typeof postImpl!=="function")throw new TypeError("ARCA federation introduction POST implementation unavailable");

  const {body,envelopeHash}=makeEnvelope({manifest,introduction});
  const target=await prepareA2aRuntimeNetworkTarget({
    endpoint,
    allowedOrigins,
    networkEnabled:true,
    ...(lookupImpl?{lookupImpl}:{})
  });
  const response=await postImpl({
    url:target.endpoint,
    pinnedAddress:target.pinnedAddress,
    addressFamily:target.pinnedAddressFamily,
    timeoutMs:timeout,
    body
  });

  const statusCode=Number(response?.statusCode??0);
  if(!Number.isInteger(statusCode)||statusCode<100||statusCode>599)throw new Error("ARCA federation introduction received invalid HTTP status");
  if(response?.remoteAddress&&String(response.remoteAddress)!==target.pinnedAddress)throw new Error("ARCA federation introduction remote address did not match pinned DNS address");
  if(response?.tlsAuthorized===false)throw new Error("ARCA federation introduction TLS connection was not authorized");

  const redirectLocation=statusCode>=300&&statusCode<400&&typeof response?.location==="string"?response.location:null;
  const redirectClassification=classifyA2aRuntimeRedirect(target.endpoint,redirectLocation);
  const accessGate=classifyA2aAccessGate(redirectClassification);

  return Object.freeze({
    format:ARCA_FEDERATION_INTRODUCTION_DELIVERY_FORMAT,
    version:1,
    endpoint:target.endpoint,
    origin:target.origin,
    hostname:target.hostname,
    dnsAddresses:target.dnsAddresses,
    pinnedAddress:target.pinnedAddress,
    pinnedAddressFamily:target.pinnedAddressFamily,
    method:"POST",
    mediaType:ARCA_FEDERATION_INTRODUCTION_MEDIA_TYPE,
    requestBodyBytes:body.byteLength,
    requestBodySha256:envelopeHash,
    requestBodyPersisted:false,
    responseBodyRead:false,
    authenticationSent:false,
    jsonRpcSent:false,
    taskSent:false,
    runtimeContacted:true,
    introductionTransmitted:true,
    httpResponseReceived:true,
    httpStatus:statusCode,
    redirectReceived:redirectLocation!==null,
    redirectFollowed:false,
    redirectLocationPersisted:false,
    redirectClassification,
    accessGate,
    deliveryState:stateFor(statusCode,redirectClassification,accessGate),
    recipientAcknowledged:false,
    protocolVerified:false,
    identityVerified:false,
    trustGranted:false,
    admissionGranted:false,
    dispatchAuthorized:false,
    executionAuthorized:false,
    tlsAuthorized:response?.tlsAuthorized!==false,
    tlsProtocol:response?.tlsProtocol??null,
    serverHeader:response?.server??null,
    responseContentType:response?.contentType??null
  });
}
