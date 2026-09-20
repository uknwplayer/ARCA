import {createHash} from "node:crypto";

export const ARCA_A2A_WELL_KNOWN_PATH="/.well-known/agent-card.json";
export const ARCA_A2A_DISCOVERY_SOURCE_KIND="a2a-well-known";

const MAX_CARD_BYTES=512*1024;
const SAFE_SOURCE_ID=/^[A-Za-z0-9._:-]{1,120}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function sha256(value){return createHash("sha256").update(String(value)).digest("hex")}
function bounded(value,label,max,{required=true}={}){
  const text=String(value??"").trim();
  if(required&&!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function safeSourceId(value){
  const text=bounded(value,"A2A discovery sourceId",120);
  if(!SAFE_SOURCE_ID.test(text))throw new TypeError("invalid A2A discovery sourceId");
  return text;
}
function isLoopback(hostname){
  const host=String(hostname).toLowerCase();
  return host==="localhost"||host==="127.0.0.1"||host==="::1"||host==="[::1]";
}
function normalizeOrigin(value){
  const url=new URL(bounded(value,"A2A origin",2048));
  if(url.username||url.password||url.search||url.hash)throw new Error("A2A origin cannot contain credentials, query or fragment");
  if(url.pathname!=="/"&&url.pathname!=="")throw new Error("A2A origin must not contain a path");
  if(!["https:","http:"].includes(url.protocol))throw new Error("A2A origin must use HTTP(S)");
  if(url.protocol==="http:"&&!isLoopback(url.hostname))throw new Error("A2A origin requires TLS outside loopback");
  return url.origin;
}
function normalizeAllowedOrigins(values=[]){
  if(!Array.isArray(values))throw new TypeError("A2A allowedAgentOrigins must be array");
  return new Set(values.map(value=>new URL(String(value)).origin));
}
function assertOriginAllowed(origin,{sourceOrigin,allowedAgentOrigins,allowLoopback}){
  const url=new URL(origin);
  if(isLoopback(url.hostname)){
    if(allowLoopback!==true)throw new Error("A2A loopback agent endpoint not authorized");
    return;
  }
  if(url.origin===sourceOrigin)return;
  if(!allowedAgentOrigins.has(url.origin))throw new Error("A2A advertised endpoint origin not authorized: "+url.origin);
}
function normalizeAgentEndpoint(value,policy){
  const url=new URL(bounded(value,"A2A agent endpoint",2048));
  if(url.username||url.password||url.search||url.hash)throw new Error("A2A agent endpoint cannot contain credentials, query or fragment");
  if(!["https:","http:"].includes(url.protocol))throw new Error("A2A agent endpoint must use HTTP(S)");
  if(url.protocol==="http:"&&!isLoopback(url.hostname))throw new Error("A2A agent endpoint requires TLS outside loopback");
  assertOriginAllowed(url.origin,policy);
  url.pathname=url.pathname.replace(/\/+$/,"")||"/";
  return url.toString().replace(/\/$/,"");
}
async function readJson(response,maxBytes){
  const length=Number(response.headers?.get?.("content-length")??0);
  if(Number.isFinite(length)&&length>maxBytes)throw new RangeError("A2A Agent Card too large");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw new RangeError("A2A Agent Card too large");
  if(!bytes.byteLength)throw new Error("empty A2A Agent Card");
  return JSON.parse(new TextDecoder().decode(bytes));
}
function capabilityToken(prefix,value){
  const original=bounded(value,"A2A skill identifier",500);
  const base=original
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,72)||"unnamed";
  return prefix+"."+base+"."+sha256(original).slice(0,8);
}
function declaredCapabilities(card){
  const out=new Set(["a2a"]);
  if(Array.isArray(card.skills)){
    for(const skill of card.skills){
      if(!plain(skill))continue;
      if(typeof skill.id==="string"&&skill.id.trim())out.add(capabilityToken("a2a.skill",skill.id));
      if(Array.isArray(skill.tags)){
        for(const tag of skill.tags){
          if(typeof tag==="string"&&tag.trim())out.add(capabilityToken("a2a.tag",tag));
        }
      }
    }
  }
  return [...out].sort();
}
function providerName(card){
  if(typeof card?.provider?.organization==="string"&&card.provider.organization.trim())return card.provider.organization.trim().slice(0,120);
  if(typeof card?.provider?.name==="string"&&card.provider.name.trim())return card.provider.name.trim().slice(0,120);
  return "a2a";
}
function interfaceFromCard(card){
  if(Array.isArray(card.supportedInterfaces)&&card.supportedInterfaces.length){
    for(const entry of card.supportedInterfaces){
      if(!plain(entry)||typeof entry.url!=="string"||!entry.url.trim())continue;
      return {
        url:entry.url,
        binding:String(entry.protocolBinding??entry.protocol_binding??"unknown"),
        protocolVersion:String(entry.protocolVersion??entry.protocol_version??"")
      };
    }
  }
  if(typeof card.url==="string"&&card.url.trim()){
    return {
      url:card.url,
      binding:String(card.preferredTransport??card.preferred_transport??"unknown"),
      protocolVersion:String(card.protocolVersion??card.protocol_version??"")
    };
  }
  throw new Error("A2A Agent Card has no supported interface");
}
function generatedId(card,endpoint){
  const name=bounded(card.name??"a2a-agent","A2A agent name",200);
  return "a2a-"+sha256(name+"\n"+endpoint).slice(0,32);
}
function validateCard(card){
  if(!plain(card))throw new Error("invalid A2A Agent Card");
  bounded(card.name,"A2A agent name",200);
  if(!Array.isArray(card.skills))throw new Error("A2A Agent Card skills must be array");
  if(card.skills.length>256)throw new RangeError("A2A Agent Card skill limit exceeded");
  return card;
}

export function normalizeA2aAgentCard(card,{
  sourceOrigin,
  allowedAgentOrigins=[],
  allowLoopback=false
}={}){
  const origin=normalizeOrigin(sourceOrigin);
  const normalizedCard=validateCard(card);
  const iface=interfaceFromCard(normalizedCard);
  const endpoint=normalizeAgentEndpoint(iface.url,{
    sourceOrigin:origin,
    allowedAgentOrigins:normalizeAllowedOrigins(allowedAgentOrigins),
    allowLoopback
  });
  return Object.freeze({
    id:generatedId(normalizedCard,endpoint),
    name:bounded(normalizedCard.name,"A2A agent name",200),
    provider:providerName(normalizedCard),
    kind:"agent",
    protocol:"a2a",
    endpoint,
    capabilities:Object.freeze(declaredCapabilities(normalizedCard))
  });
}

export function createA2aWellKnownDiscoverySource({
  sourceId,
  origin,
  networkEnabled=false,
  allowedAgentOrigins=[],
  allowLoopback=false,
  fetchImpl=globalThis.fetch,
  timeoutMs=10000,
  maxResponseBytes=MAX_CARD_BYTES
}={}){
  const id=safeSourceId(sourceId);
  const sourceOrigin=normalizeOrigin(origin);
  const cardUrl=sourceOrigin+ARCA_A2A_WELL_KNOWN_PATH;
  const timeout=Number(timeoutMs);
  const maxBytes=Number(maxResponseBytes);
  if(typeof fetchImpl!=="function")throw new TypeError("A2A discovery fetch unavailable");
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("A2A discovery timeoutMs must be between 1000 and 30000");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>2*1024*1024)throw new RangeError("invalid A2A discovery maxResponseBytes");
  const allowed=normalizeAllowedOrigins(allowedAgentOrigins);

  return Object.freeze({
    id,
    kind:ARCA_A2A_DISCOVERY_SOURCE_KIND,
    uri:cardUrl,
    async discover(){
      if(networkEnabled!==true)throw Object.assign(new Error("A2A discovery network disabled"),{code:"ARCA_A2A_DISCOVERY_NETWORK_DISABLED"});
      if(isLoopback(new URL(sourceOrigin).hostname)&&allowLoopback!==true)throw new Error("A2A loopback source not authorized");
      const response=await fetchImpl(cardUrl,{
        method:"GET",
        headers:{Accept:"application/json"},
        redirect:"manual",
        signal:AbortSignal.timeout(timeout)
      });
      if(response.status>=300&&response.status<400)throw Object.assign(new Error("A2A Agent Card redirect refused"),{code:"ARCA_A2A_DISCOVERY_REDIRECT_REFUSED"});
      if(!response.ok)throw Object.assign(new Error("A2A Agent Card HTTP "+response.status),{code:"ARCA_A2A_DISCOVERY_HTTP_ERROR",httpStatus:response.status});
      const card=await readJson(response,maxBytes);
      const candidate=normalizeA2aAgentCard(card,{
        sourceOrigin,
        allowedAgentOrigins:[...allowed],
        allowLoopback
      });
      return [candidate];
    }
  });
}
