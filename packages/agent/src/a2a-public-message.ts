import {createHash,randomUUID} from "node:crypto";
import {lookup as dnsLookup} from "node:dns/promises";
import {request as httpsRequest} from "node:https";
import {isIP} from "node:net";
import {createPinnedLookup} from "./a2a-runtime-reachability.ts";

export const ARCA_A2A_PUBLIC_INTERACTION_PROFILE_FORMAT="arca-a2a-public-interaction-profile-v1";
export const ARCA_A2A_PUBLIC_MESSAGE_RESULT_FORMAT="arca-a2a-public-message-result-v1";

const SAFE_HOST_SUFFIXES=[".localhost",".local",".internal",".home",".lan"];
const MAX_DNS_ADDRESSES=8;
const MAX_TEXT_BYTES=8*1024;
const DEFAULT_MAX_RESPONSE_BYTES=512*1024;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function bounded(value,label,max,{required=true}={}){
  const text=String(value??"").trim();
  if(required&&!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(plain(value)){
    const out={};
    for(const key of Object.keys(value).sort())if(value[key]!==undefined)out[key]=canonicalize(value[key]);
    return out;
  }
  return value;
}
function sha256Json(value){return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}
function normalizeCleanHttpsOrigin(value,label){
  const url=new URL(bounded(value,label,2048));
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"){
    throw new Error(label+" must be a clean HTTPS origin");
  }
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||SAFE_HOST_SUFFIXES.some(suffix=>host.endsWith(suffix))){
    throw new Error(label+" refuses local hostname");
  }
  return url.origin;
}
function normalizeEndpoint(value,{sourceOrigin,allowedOrigins}){
  const url=new URL(bounded(value,"A2A public endpoint",2048));
  if(url.protocol!=="https:")throw new Error("A2A public endpoint requires HTTPS");
  if(url.username||url.password||url.search||url.hash)throw new Error("A2A public endpoint cannot contain credentials, query or fragment");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||SAFE_HOST_SUFFIXES.some(suffix=>host.endsWith(suffix)))throw new Error("A2A public endpoint refuses local hostname");
  const allowed=new Set([sourceOrigin,...allowedOrigins]);
  if(!allowed.has(url.origin))throw Object.assign(new Error("A2A public endpoint origin not authorized"),{code:"ARCA_A2A_PUBLIC_ORIGIN_NOT_AUTHORIZED"});
  url.pathname=url.pathname.replace(/\/+$/,"")||"/";
  return url;
}
function securityRequirements(card){
  const fields=[card.securityRequirements,card.security_requirements,card.security];
  for(const field of fields){
    if(Array.isArray(field)&&field.length)return field;
    if(plain(field)&&Object.keys(field).length)return [field];
  }
  return [];
}
function skillRequiresSecurity(skill){
  if(!plain(skill))return false;
  for(const field of [skill.securityRequirements,skill.security_requirements,skill.security]){
    if(Array.isArray(field)&&field.length)return true;
    if(plain(field)&&Object.keys(field).length)return true;
  }
  return false;
}
function normalizeBinding(value){
  return String(value??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
}
function normalizeProtocolVersion(value){
  const raw=bounded(value,"A2A protocol version",40);
  const match=raw.match(/^(\d+)\.(\d+)(?:\.\d+)?$/);
  if(!match)throw new Error("unsupported A2A protocol version: "+raw);
  const major=Number(match[1]);
  const minor=Number(match[2]);
  if(major===0&&minor===3)return "0.3";
  if(major>=1)return major+"."+minor;
  throw new Error("unsupported A2A protocol version: "+raw);
}
function interfaceCandidates(card){
  const out=[];
  if(Array.isArray(card.supportedInterfaces)){
    for(const entry of card.supportedInterfaces){
      if(!plain(entry))continue;
      out.push({
        url:entry.url,
        binding:entry.protocolBinding??entry.protocol_binding,
        protocolVersion:entry.protocolVersion??entry.protocol_version
      });
    }
  }
  if(typeof card.url==="string"&&card.url.trim()){
    out.push({
      url:card.url,
      binding:card.preferredTransport??card.preferred_transport,
      protocolVersion:card.protocolVersion??card.protocol_version
    });
  }
  return out;
}
function messageMethod(protocolVersion){
  return protocolVersion==="0.3"?"message/send":"SendMessage";
}
function publicInteractionRequest({protocolVersion,requestId,messageId,text}){
  if(protocolVersion==="0.3"){
    return {
      jsonrpc:"2.0",
      id:requestId,
      method:"message/send",
      params:{
        message:{
          role:"user",
          parts:[{kind:"text",text}],
          messageId
        },
        configuration:{
          acceptedOutputModes:["text/plain"],
          blocking:true
        }
      }
    };
  }
  return {
    jsonrpc:"2.0",
    id:requestId,
    method:"SendMessage",
    params:{
      message:{
        messageId,
        role:"ROLE_USER",
        parts:[{text}]
      },
      configuration:{
        acceptedOutputModes:["text/plain"],
        historyLength:5,
        returnImmediately:false
      }
    }
  };
}
function parseIpv4(value){
  const parts=value.split(".");
  if(parts.length!==4)return null;
  const nums=parts.map(Number);
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
function publicIp(value){
  const address=bounded(value,"resolved A2A public address",128);
  const family=isIP(address);
  if(family===4&&forbiddenIpv4(address))throw new Error("A2A public endpoint resolved to forbidden IPv4 address");
  if(family===6&&forbiddenIpv6(address))throw new Error("A2A public endpoint resolved to forbidden IPv6 address");
  if(family===0)throw new Error("A2A public endpoint DNS returned invalid IP address");
  return {address,family};
}
async function resolvePinned(hostname,lookupImpl){
  const literal=isIP(hostname);
  if(literal)return publicIp(hostname);
  const answers=await lookupImpl(hostname,{all:true,verbatim:true});
  if(!Array.isArray(answers)||answers.length<1)throw new Error("A2A public endpoint DNS returned no addresses");
  if(answers.length>MAX_DNS_ADDRESSES)throw new RangeError("A2A public endpoint DNS address limit exceeded");
  const normalized=answers.map(answer=>publicIp(answer?.address));
  normalized.sort((a,b)=>a.family-b.family||a.address.localeCompare(b.address));
  return normalized[0];
}
function secureJsonGet({url,pinnedAddress,addressFamily,headers,timeoutMs,maxResponseBytes}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const req=httpsRequest(url,{
      method:"GET",
      headers,
      timeout:timeoutMs,
      lookup:createPinnedLookup(pinnedAddress,addressFamily),
      agent:false
    },res=>{
      const chunks=[];
      let total=0;
      res.on("data",chunk=>{
        total+=chunk.length;
        if(total>maxResponseBytes){
          req.destroy(Object.assign(new Error("A2A public Agent Card too large"),{code:"ARCA_A2A_PUBLIC_CARD_TOO_LARGE"}));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end",()=>{
        if(settled)return;
        settled=true;
        resolve({
          statusCode:Number(res.statusCode??0),
          location:typeof res.headers.location==="string"?res.headers.location:null,
          contentType:typeof res.headers["content-type"]==="string"?res.headers["content-type"]:null,
          tlsAuthorized:res.socket?.authorized===true,
          remoteAddress:res.socket?.remoteAddress??null,
          body:Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.once("timeout",()=>req.destroy(Object.assign(new Error("A2A public Agent Card timeout"),{code:"ARCA_A2A_PUBLIC_CARD_TIMEOUT"})));
    req.once("error",error=>{
      if(settled)return;
      settled=true;
      reject(error);
    });
    req.end();
  });
}

function secureJsonPost({url,pinnedAddress,addressFamily,headers,body,timeoutMs,maxResponseBytes}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const req=httpsRequest(url,{
      method:"POST",
      headers:{...headers,"Content-Length":Buffer.byteLength(body)},
      timeout:timeoutMs,
      lookup:createPinnedLookup(pinnedAddress,addressFamily),
      agent:false
    },res=>{
      const chunks=[];
      let total=0;
      res.on("data",chunk=>{
        total+=chunk.length;
        if(total>maxResponseBytes){
          req.destroy(Object.assign(new Error("A2A public response too large"),{code:"ARCA_A2A_PUBLIC_RESPONSE_TOO_LARGE"}));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end",()=>{
        if(settled)return;
        settled=true;
        resolve({
          statusCode:Number(res.statusCode??0),
          location:typeof res.headers.location==="string"?res.headers.location:null,
          contentType:typeof res.headers["content-type"]==="string"?res.headers["content-type"]:null,
          tlsAuthorized:res.socket?.authorized===true,
          remoteAddress:res.socket?.remoteAddress??null,
          body:Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.once("timeout",()=>req.destroy(Object.assign(new Error("A2A public message timeout"),{code:"ARCA_A2A_PUBLIC_TIMEOUT"})));
    req.once("error",error=>{
      if(settled)return;
      settled=true;
      reject(error);
    });
    req.write(body);
    req.end();
  });
}

export async function fetchA2aPublicAgentCard({
  origin,
  networkEnabled=false,
  lookupImpl=dnsLookup,
  getImpl=secureJsonGet,
  timeoutMs=15000,
  maxResponseBytes=DEFAULT_MAX_RESPONSE_BYTES
}={}){
  const sourceOrigin=normalizeCleanHttpsOrigin(origin,"A2A source origin");
  if(networkEnabled!==true)throw Object.assign(new Error("A2A public Agent Card network disabled"),{code:"ARCA_A2A_PUBLIC_CARD_NETWORK_DISABLED"});
  const timeout=Number(timeoutMs);
  const maxBytes=Number(maxResponseBytes);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("A2A public Agent Card timeoutMs must be between 1000 and 30000");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>2*1024*1024)throw new RangeError("invalid A2A public Agent Card maxResponseBytes");
  if(typeof lookupImpl!=="function"||typeof getImpl!=="function")throw new TypeError("A2A public Agent Card transport unavailable");
  const url=new URL("/.well-known/agent-card.json",sourceOrigin);
  const pinned=await resolvePinned(url.hostname,lookupImpl);
  const response=await getImpl({
    url:url.toString(),
    pinnedAddress:pinned.address,
    addressFamily:pinned.family,
    timeoutMs:timeout,
    maxResponseBytes:maxBytes,
    headers:Object.freeze({
      Accept:"application/json",
      "User-Agent":"ARCA-A2A-Public-Card/0.1",
      Connection:"close"
    })
  });
  const statusCode=Number(response?.statusCode??0);
  if(response?.remoteAddress&&publicIp(String(response.remoteAddress)).address!==pinned.address)throw new Error("A2A public Agent Card remote address did not match pinned DNS address");
  if(response?.tlsAuthorized===false)throw new Error("A2A public Agent Card TLS connection was not authorized");
  if(statusCode>=300&&statusCode<400)throw Object.assign(new Error("A2A public Agent Card redirect refused"),{code:"ARCA_A2A_PUBLIC_CARD_REDIRECT_REFUSED",location:response?.location??null});
  if(statusCode<200||statusCode>=300)throw Object.assign(new Error("A2A public Agent Card HTTP "+statusCode),{code:"ARCA_A2A_PUBLIC_CARD_HTTP_ERROR",httpStatus:statusCode});
  let card;
  try{card=JSON.parse(String(response?.body??""))}catch{throw Object.assign(new Error("A2A public Agent Card is not JSON"),{code:"ARCA_A2A_PUBLIC_CARD_INVALID_JSON"})}
  if(!plain(card))throw Object.assign(new Error("A2A public Agent Card must be object"),{code:"ARCA_A2A_PUBLIC_CARD_INVALID"});
  return Object.freeze({
    sourceOrigin,
    card,
    cardHash:sha256Json(card),
    authenticationSent:false,
    trustGranted:false,
    admissionGranted:false
  });
}

export function inspectA2aPublicInteractionProfile(card,{sourceOrigin,allowedAgentOrigins=[]}={}){
  if(!plain(card))throw new TypeError("A2A Agent Card required");
  const origin=normalizeCleanHttpsOrigin(sourceOrigin,"A2A source origin");
  if(!Array.isArray(allowedAgentOrigins))throw new TypeError("allowedAgentOrigins must be array");
  const allowed=allowedAgentOrigins.map(value=>normalizeCleanHttpsOrigin(value,"allowed A2A agent origin"));

  const requirements=securityRequirements(card);
  if(requirements.length)throw Object.assign(new Error("A2A Agent Card requires authentication"),{code:"ARCA_A2A_PUBLIC_AUTH_REQUIRED"});
  if(Array.isArray(card.skills)&&card.skills.some(skillRequiresSecurity)){
    throw Object.assign(new Error("A2A Agent Card contains skill authentication requirements"),{code:"ARCA_A2A_PUBLIC_SKILL_AUTH_REQUIRED"});
  }

  const interfaces=interfaceCandidates(card);
  let selected=null;
  for(const entry of interfaces){
    if(normalizeBinding(entry.binding)!=="jsonrpc")continue;
    if(!entry.protocolVersion)continue;
    const protocolVersion=normalizeProtocolVersion(entry.protocolVersion);
    const endpoint=normalizeEndpoint(entry.url,{sourceOrigin:origin,allowedOrigins:allowed});
    selected={endpoint,protocolVersion};
    break;
  }
  if(!selected)throw Object.assign(new Error("A2A Agent Card has no supported versioned JSON-RPC public interface"),{code:"ARCA_A2A_PUBLIC_JSONRPC_INTERFACE_MISSING"});

  return Object.freeze({
    format:ARCA_A2A_PUBLIC_INTERACTION_PROFILE_FORMAT,
    version:1,
    agentName:bounded(card.name??"a2a-agent","A2A agent name",200),
    sourceOrigin:origin,
    endpoint:selected.endpoint.toString(),
    endpointOrigin:selected.endpoint.origin,
    protocolBinding:"JSONRPC",
    protocolVersion:selected.protocolVersion,
    method:messageMethod(selected.protocolVersion),
    publicUnauthenticated:true,
    authenticationSent:false,
    streaming:false,
    pushNotifications:false,
    filesAllowed:false,
    textOnly:true,
    trustGranted:false,
    admissionGranted:false,
    capabilityVerificationGranted:false
  });
}

export function createA2aPublicMessageClient({
  profile,
  networkEnabled=false,
  lookupImpl=dnsLookup,
  postImpl=secureJsonPost,
  timeoutMs=15000,
  maxResponseBytes=DEFAULT_MAX_RESPONSE_BYTES
}={}){
  if(!plain(profile)||profile.format!==ARCA_A2A_PUBLIC_INTERACTION_PROFILE_FORMAT)throw new TypeError("A2A public interaction profile required");
  if(profile.publicUnauthenticated!==true)throw new Error("A2A public interaction profile must be unauthenticated");
  const endpoint=new URL(profile.endpoint);
  const timeout=Number(timeoutMs);
  const maxBytes=Number(maxResponseBytes);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("A2A public timeoutMs must be between 1000 and 30000");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>2*1024*1024)throw new RangeError("invalid A2A public maxResponseBytes");
  if(typeof lookupImpl!=="function"||typeof postImpl!=="function")throw new TypeError("A2A public transport unavailable");

  return Object.freeze({
    profile,
    async sendText(text,{requestId=randomUUID(),messageId=randomUUID()}={}){
      if(networkEnabled!==true)throw Object.assign(new Error("A2A public message network disabled"),{code:"ARCA_A2A_PUBLIC_NETWORK_DISABLED"});
      const message=bounded(text,"A2A public text message",8000);
      if(Buffer.byteLength(message,"utf8")>MAX_TEXT_BYTES)throw new RangeError("A2A public text message exceeds byte limit");
      const requestKey=bounded(requestId,"A2A JSON-RPC request id",120);
      const messageKey=bounded(messageId,"A2A message id",120);
      const request=publicInteractionRequest({
        protocolVersion:profile.protocolVersion,
        requestId:requestKey,
        messageId:messageKey,
        text:message
      });
      const encoded=JSON.stringify(request);
      const pinned=await resolvePinned(endpoint.hostname,lookupImpl);
      const response=await postImpl({
        url:endpoint.toString(),
        pinnedAddress:pinned.address,
        addressFamily:pinned.family,
        timeoutMs:timeout,
        maxResponseBytes:maxBytes,
        headers:Object.freeze({
          Accept:"application/json",
          "Content-Type":"application/json",
          "A2A-Version":profile.protocolVersion,
          "User-Agent":"ARCA-A2A-Public-Message/0.1",
          Connection:"close"
        }),
        body:encoded
      });
      const statusCode=Number(response?.statusCode??0);
      if(response?.remoteAddress&&publicIp(String(response.remoteAddress)).address!==pinned.address)throw new Error("A2A public remote address did not match pinned DNS address");
      if(response?.tlsAuthorized===false)throw new Error("A2A public TLS connection was not authorized");
      if(statusCode>=300&&statusCode<400)throw Object.assign(new Error("A2A public redirect refused"),{code:"ARCA_A2A_PUBLIC_REDIRECT_REFUSED",location:response?.location??null});
      if(statusCode<200||statusCode>=300)throw Object.assign(new Error("A2A public HTTP "+statusCode),{code:"ARCA_A2A_PUBLIC_HTTP_ERROR",httpStatus:statusCode});
      let body;
      try{body=JSON.parse(String(response?.body??""))}catch{throw Object.assign(new Error("A2A public response is not JSON"),{code:"ARCA_A2A_PUBLIC_INVALID_JSON"})}
      if(!plain(body)||body.jsonrpc!=="2.0")throw Object.assign(new Error("A2A public response is not JSON-RPC 2.0"),{code:"ARCA_A2A_PUBLIC_INVALID_JSONRPC"});
      if(String(body.id)!==requestKey)throw Object.assign(new Error("A2A public response id mismatch"),{code:"ARCA_A2A_PUBLIC_RESPONSE_ID_MISMATCH"});
      if(plain(body.error))throw Object.assign(new Error("A2A public JSON-RPC error: "+String(body.error.message??body.error.code??"unknown")),{code:"ARCA_A2A_PUBLIC_JSONRPC_ERROR",rpcError:canonicalize(body.error)});
      if(body.result===undefined)throw Object.assign(new Error("A2A public response missing result"),{code:"ARCA_A2A_PUBLIC_RESULT_MISSING"});
      const result=canonicalize(body.result);
      return Object.freeze({
        format:ARCA_A2A_PUBLIC_MESSAGE_RESULT_FORMAT,
        version:1,
        requestId:requestKey,
        messageId:messageKey,
        endpoint:profile.endpoint,
        endpointOrigin:profile.endpointOrigin,
        protocolVersion:profile.protocolVersion,
        method:profile.method,
        publicUnauthenticated:true,
        authenticationSent:false,
        textOnly:true,
        requestBytes:Buffer.byteLength(encoded,"utf8"),
        responseHash:sha256Json(result),
        result,
        trustGranted:false,
        admissionGranted:false,
        capabilityVerificationGranted:false,
        roleConformanceGranted:false,
        runtimeBindingGranted:false,
        externalTestimonyOnly:true
      });
    }
  });
}
