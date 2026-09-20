import {createHash} from "node:crypto";
import {lookup as dnsLookup} from "node:dns/promises";
import {request as httpsRequest} from "node:https";
import {isIP} from "node:net";

export const ARCA_A2A_RUNTIME_REACHABILITY_FORMAT="arca-a2a-runtime-reachability-v1";

const SAFE_HOST_SUFFIXES=[".localhost",".local",".internal",".home",".lan"];
const MAX_DNS_ADDRESSES=8;
const MAX_REDIRECT_LOCATION_BYTES=4096;

function bounded(value,label,max){
  const text=String(value??"").trim();
  if(!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function normalizeEndpoint(value){
  const url=new URL(bounded(value,"A2A runtime endpoint",2048));
  if(url.protocol!=="https:")throw new Error("A2A runtime endpoint requires HTTPS");
  if(url.username||url.password)throw new Error("A2A runtime endpoint cannot contain credentials");
  if(url.search||url.hash)throw new Error("A2A runtime endpoint cannot contain query or fragment");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||SAFE_HOST_SUFFIXES.some(suffix=>host.endsWith(suffix)))throw new Error("A2A runtime endpoint refuses local hostname");
  url.pathname=url.pathname.replace(/\/+$/,"")||"/";
  return url;
}
function normalizeAllowedOrigins(values=[]){
  if(!Array.isArray(values))throw new TypeError("allowedOrigins must be array");
  const out=new Set();
  for(const value of values){
    const url=new URL(bounded(value,"allowed A2A runtime origin",2048));
    if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"){
      throw new Error("allowed A2A runtime origin must be a clean HTTPS origin");
    }
    const host=url.hostname.toLowerCase();
    if(host==="localhost"||SAFE_HOST_SUFFIXES.some(suffix=>host.endsWith(suffix)))throw new Error("allowed A2A runtime origin refuses local hostname");
    out.add(url.origin);
  }
  return out;
}

function sha256Text(value){
  return createHash("sha256").update(value).digest("hex");
}
export function classifyA2aRuntimeRedirect(sourceEndpoint,location){
  const source=normalizeEndpoint(sourceEndpoint);
  if(location===null||location===undefined||String(location).trim()==="")return null;
  const raw=bounded(location,"A2A runtime redirect Location",MAX_REDIRECT_LOCATION_BYTES);
  let target;
  try{
    target=new URL(raw,source);
  }catch{
    return Object.freeze({
      validUrl:false,
      https:false,
      sameOrigin:false,
      targetOrigin:null,
      targetPath:null,
      queryPresent:false,
      querySha256:null,
      fragmentPresent:false,
      credentialsPresent:false,
      requiresExplicitOriginAuthorization:true,
      safeForFutureProbe:false,
      rawLocationSha256:sha256Text(raw)
    });
  }
  const https=target.protocol==="https:";
  const credentialsPresent=!!(target.username||target.password);
  const queryPresent=target.search.length>0;
  const fragmentPresent=target.hash.length>0;
  const sameOrigin=target.origin===source.origin;
  const host=target.hostname.toLowerCase();
  const localHostname=host==="localhost"||SAFE_HOST_SUFFIXES.some(suffix=>host.endsWith(suffix));
  return Object.freeze({
    validUrl:true,
    https,
    sameOrigin,
    targetOrigin:target.origin,
    targetPath:target.pathname||"/",
    queryPresent,
    querySha256:queryPresent?sha256Text(target.search):null,
    fragmentPresent,
    credentialsPresent,
    localHostname,
    requiresExplicitOriginAuthorization:!sameOrigin,
    safeForFutureProbe:https&&!credentialsPresent&&!fragmentPresent&&!localHostname,
    rawLocationSha256:sha256Text(raw)
  });
}


export function classifyA2aAccessGate(redirectClassification){
  if(!redirectClassification||redirectClassification.validUrl!==true){
    return Object.freeze({
      detected:false,
      kind:null,
      provider:null,
      state:"not-detected",
      enrollmentRequired:false,
      authenticationAttempted:false,
      credentialPresented:false,
      redirectFollowed:false
    });
  }
  let hostname=null;
  try{
    hostname=new URL(redirectClassification.targetOrigin).hostname.toLowerCase();
  }catch{
    hostname=null;
  }
  const path=String(redirectClassification.targetPath??"");
  const cloudflareAccess=Boolean(
    hostname&&
    hostname.endsWith(".cloudflareaccess.com")&&
    path.startsWith("/cdn-cgi/access/login/")
  );
  const genericCrossOriginAuthGate=Boolean(
    redirectClassification.https===true&&
    redirectClassification.sameOrigin===false&&
    redirectClassification.requiresExplicitOriginAuthorization===true
  );

  if(cloudflareAccess){
    return Object.freeze({
      detected:true,
      kind:"access-gate",
      provider:"cloudflare-access",
      state:"reachable-but-access-gated",
      targetOrigin:redirectClassification.targetOrigin,
      targetPath:path,
      enrollmentRequired:true,
      publicCredentialDiscovered:false,
      authenticationAttempted:false,
      credentialPresented:false,
      redirectFollowed:false,
      permittedCredentialSources:Object.freeze([
        "owner-issued-service-token",
        "owner-approved-oauth-or-idp",
        "owner-approved-mtls-certificate",
        "owner-published-public-a2a-endpoint"
      ])
    });
  }

  if(genericCrossOriginAuthGate){
    return Object.freeze({
      detected:true,
      kind:"external-access-gate",
      provider:"unknown",
      state:"reachable-but-external-gate",
      targetOrigin:redirectClassification.targetOrigin,
      targetPath:path,
      enrollmentRequired:true,
      publicCredentialDiscovered:false,
      authenticationAttempted:false,
      credentialPresented:false,
      redirectFollowed:false,
      permittedCredentialSources:Object.freeze([
        "owner-issued-credential",
        "owner-approved-authentication-flow",
        "owner-published-public-a2a-endpoint"
      ])
    });
  }

  return Object.freeze({
    detected:false,
    kind:null,
    provider:null,
    state:"not-detected",
    enrollmentRequired:false,
    authenticationAttempted:false,
    credentialPresented:false,
    redirectFollowed:false
  });
}

function parseIpv4(value){
  const parts=value.split(".");
  if(parts.length!==4)return null;
  const nums=parts.map(part=>Number(part));
  if(nums.some(num=>!Number.isInteger(num)||num<0||num>255))return null;
  return nums;
}
function forbiddenIpv4(value){
  const ip=parseIpv4(value);
  if(!ip)return true;
  const [a,b,c,d]=ip;
  if(a===0||a===10||a===127)return true;
  if(a===100&&b>=64&&b<=127)return true;
  if(a===169&&b===254)return true;
  if(a===172&&b>=16&&b<=31)return true;
  if(a===192&&b===0&&c===0)return true;
  if(a===192&&b===0&&c===2)return true;
  if(a===192&&b===88&&c===99)return true;
  if(a===192&&b===168)return true;
  if(a===198&&(b===18||b===19))return true;
  if(a===198&&b===51&&c===100)return true;
  if(a===203&&b===0&&c===113)return true;
  if(a>=224)return true;
  if(a===255&&b===255&&c===255&&d===255)return true;
  return false;
}
function forbiddenIpv6(value){
  const ip=value.toLowerCase().replace(/^\[|\]$/g,"");
  if(ip==="::"||ip==="::1")return true;
  const mapped=ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if(mapped)return forbiddenIpv4(mapped[1]);
  if(ip.startsWith("fc")||ip.startsWith("fd"))return true;
  if(/^fe[89ab]/.test(ip))return true;
  if(ip.startsWith("ff"))return true;
  if(ip.startsWith("2001:db8:")||ip==="2001:db8::")return true;
  return false;
}
function assertPublicIp(value){
  const address=bounded(value,"resolved A2A runtime address",128);
  const family=isIP(address);
  if(family===4&&forbiddenIpv4(address))throw new Error("A2A runtime DNS resolved to forbidden IPv4 address");
  if(family===6&&forbiddenIpv6(address))throw new Error("A2A runtime DNS resolved to forbidden IPv6 address");
  if(family===0)throw new Error("A2A runtime DNS returned invalid IP address");
  return {address,family};
}
async function resolvePinnedAddress(hostname,lookupImpl){
  if(typeof lookupImpl!=="function")throw new TypeError("A2A runtime DNS lookup unavailable");
  const literalFamily=isIP(hostname);
  if(literalFamily){
    const pinned=assertPublicIp(hostname);
    return Object.freeze({all:Object.freeze([Object.freeze(pinned)]),pinned:Object.freeze(pinned)});
  }
  const answers=await lookupImpl(hostname,{all:true,verbatim:true});
  if(!Array.isArray(answers)||answers.length<1)throw new Error("A2A runtime DNS returned no addresses");
  if(answers.length>MAX_DNS_ADDRESSES)throw new RangeError("A2A runtime DNS address limit exceeded");
  const normalized=answers.map(answer=>assertPublicIp(answer?.address));
  normalized.sort((a,b)=>a.family-b.family||a.address.localeCompare(b.address));
  return Object.freeze({
    all:Object.freeze(normalized.map(value=>Object.freeze({...value}))),
    pinned:Object.freeze({...normalized[0]})
  });
}
export async function prepareA2aRuntimeNetworkTarget({
  endpoint,
  allowedOrigins=[],
  networkEnabled=false,
  lookupImpl=dnsLookup
}={}){
  const url=normalizeEndpoint(endpoint);
  const origins=normalizeAllowedOrigins(allowedOrigins);
  if(networkEnabled!==true)throw Object.assign(new Error("A2A runtime target preparation network disabled"),{code:"ARCA_A2A_RUNTIME_NETWORK_DISABLED"});
  if(!origins.has(url.origin))throw Object.assign(new Error("A2A runtime endpoint origin not authorized by host"),{code:"ARCA_A2A_RUNTIME_ORIGIN_NOT_AUTHORIZED"});
  const dns=await resolvePinnedAddress(url.hostname,lookupImpl);
  return Object.freeze({
    endpoint:url.toString(),
    origin:url.origin,
    hostname:url.hostname,
    dnsAddresses:Object.freeze(dns.all.map(value=>value.address)),
    pinnedAddress:dns.pinned.address,
    pinnedAddressFamily:dns.pinned.family
  });
}

export function createPinnedLookup(pinnedAddress,addressFamily){
  const address=bounded(pinnedAddress,"pinned A2A runtime address",128);
  const family=Number(addressFamily);
  if(![4,6].includes(family))throw new Error("invalid pinned A2A runtime address family");
  return function pinnedLookup(_hostname,options,callback){
    const entry={address,family};
    if(options?.all===true){
      callback(null,[entry]);
      return;
    }
    callback(null,address,family);
  };
}
function secureHeadRequest({url,pinnedAddress,addressFamily,timeoutMs,headers}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const req=httpsRequest(url,{
      method:"HEAD",
      headers,
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
        remoteAddress:socket?.remoteAddress??null,
        remoteFamily:socket?.remoteFamily??null
      };
      res.destroy();
      resolve(result);
    });
    req.once("timeout",()=>{
      req.destroy(Object.assign(new Error("A2A runtime HEAD timeout"),{code:"ARCA_A2A_RUNTIME_TIMEOUT"}));
    });
    req.once("error",error=>{
      if(settled)return;
      settled=true;
      reject(error);
    });
    req.end();
  });
}

export async function probeA2aRuntimeReachability({
  endpoint,
  networkEnabled=false,
  allowedOrigins=[],
  lookupImpl=dnsLookup,
  headImpl=secureHeadRequest,
  timeoutMs=10000
}={}){
  const url=normalizeEndpoint(endpoint);
  normalizeAllowedOrigins(allowedOrigins);
  if(networkEnabled!==true)throw Object.assign(new Error("A2A runtime probe network disabled"),{code:"ARCA_A2A_RUNTIME_NETWORK_DISABLED"});

  const timeout=Number(timeoutMs);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("A2A runtime probe timeoutMs must be between 1000 and 30000");
  if(typeof headImpl!=="function")throw new TypeError("A2A runtime HEAD implementation unavailable");

  const target=await prepareA2aRuntimeNetworkTarget({
    endpoint:url.toString(),
    allowedOrigins,
    networkEnabled:true,
    lookupImpl
  });
  const headers=Object.freeze({
    Accept:"application/json",
    "User-Agent":"ARCA-A2A-Reachability-Probe/0.1",
    Connection:"close"
  });
  const response=await headImpl({
    url:url.toString(),
    pinnedAddress:target.pinnedAddress,
    addressFamily:target.pinnedAddressFamily,
    timeoutMs:timeout,
    headers
  });
  const statusCode=Number(response?.statusCode??0);
  if(!Number.isInteger(statusCode)||statusCode<100||statusCode>599)throw new Error("A2A runtime probe received invalid HTTP status");
  if(response?.remoteAddress){
    const remote=assertPublicIp(String(response.remoteAddress));
    if(remote.address!==target.pinnedAddress)throw new Error("A2A runtime remote address did not match pinned DNS address");
  }
  if(response?.tlsAuthorized===false)throw new Error("A2A runtime TLS connection was not authorized");

  const redirectLocation=statusCode>=300&&statusCode<400&&typeof response?.location==="string"?response.location:null;
  const redirectClassification=classifyA2aRuntimeRedirect(url.toString(),redirectLocation);
  const accessGate=classifyA2aAccessGate(redirectClassification);

  return Object.freeze({
    format:ARCA_A2A_RUNTIME_REACHABILITY_FORMAT,
    version:1,
    endpoint:url.toString(),
    origin:url.origin,
    hostname:url.hostname,
    dnsAddresses:Object.freeze(target.dnsAddresses),
    pinnedAddress:target.pinnedAddress,
    pinnedAddressFamily:target.pinnedAddressFamily,
    method:"HEAD",
    requestBodyBytes:0,
    authenticationSent:false,
    jsonRpcSent:false,
    taskSent:false,
    runtimeContacted:true,
    httpResponseReceived:true,
    httpStatus:statusCode,
    redirectReceived:redirectLocation!==null,
    redirectFollowed:false,
    redirectLocationPersisted:false,
    redirectClassification,
    accessGate,
    tlsAuthorized:response?.tlsAuthorized!==false,
    tlsProtocol:response?.tlsProtocol??null,
    serverHeader:response?.server??null,
    contentType:response?.contentType??null,
    reachabilityState:"reachable-http-response",
    protocolVerified:false,
    capabilitiesVerified:false,
    identityVerified:false,
    trustGranted:false,
    admissionGranted:false,
    dispatchAuthorized:false
  });
}
