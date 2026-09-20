export const ARCA_A2A_REGISTRY_RESOLUTION_FORMAT="arca-a2a-registry-resolution-v1";

const DEFAULT_MAX_RESPONSE_BYTES=512*1024;
const SAFE_SOURCE_ID=/^[A-Za-z0-9._:-]{1,120}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function bounded(value,label,max){
  const text=String(value??"").trim();
  if(!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function isLoopback(hostname){
  const host=String(hostname).toLowerCase();
  return host==="localhost"||host==="127.0.0.1"||host==="::1"||host==="[::1]";
}
function normalizeApiOrigin(value){
  const url=new URL(bounded(value,"A2A registry API origin",2048));
  if(url.protocol!=="https:")throw new Error("A2A registry API origin requires HTTPS");
  if(isLoopback(url.hostname))throw new Error("A2A registry API origin refuses loopback");
  if(url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new Error("A2A registry API origin must be a clean HTTPS origin");
  return url.origin;
}
function normalizeAllowedOrigins(values=[]){
  if(!Array.isArray(values))throw new TypeError("A2A registry allowedOrigins must be array");
  return new Set(values.map(value=>normalizeApiOrigin(value)));
}
function normalizeRegistryId(value){
  const id=bounded(value,"A2A registry id",240);
  if(/[\u0000-\u001f\u007f]/.test(id))throw new TypeError("invalid A2A registry id");
  return id;
}
function normalizeManifestUrl(value){
  if(value===undefined||value===null||String(value).trim()==="")return null;
  let url;
  try{url=new URL(String(value).trim())}catch{return null}
  if(url.protocol!=="https:")return null;
  if(isLoopback(url.hostname)||url.username||url.password||url.hash)return null;
  return url.toString();
}
function firstField(row,keys){
  for(const key of keys){
    const value=row?.[key];
    if(typeof value==="string"&&value.trim())return value.trim();
    if(typeof value==="number"&&Number.isFinite(value))return String(value);
  }
  return null;
}
async function readJson(response,maxBytes){
  const length=Number(response.headers?.get?.("content-length")??0);
  if(Number.isFinite(length)&&length>maxBytes)throw new RangeError("A2A registry resolution response too large");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw new RangeError("A2A registry resolution response too large");
  if(!bytes.byteLength)throw new Error("empty A2A registry resolution response");
  return JSON.parse(new TextDecoder().decode(bytes));
}
function unwrapAgent(body){
  if(!plain(body))throw new Error("invalid A2A registry resolution response");
  if(plain(body.agent))return body.agent;
  if(plain(body.data)){
    if(plain(body.data.agent))return body.data.agent;
    return body.data;
  }
  return body;
}

export function createA2aRegistryResolver({
  sourceId="a2a-global-registry-resolution",
  apiOrigin="https://api.a2a-registry.org",
  networkEnabled=false,
  allowedOrigins=[],
  fetchImpl=globalThis.fetch,
  timeoutMs=10000,
  maxResponseBytes=DEFAULT_MAX_RESPONSE_BYTES
}={}){
  const id=bounded(sourceId,"A2A registry resolution sourceId",120);
  if(!SAFE_SOURCE_ID.test(id))throw new TypeError("invalid A2A registry resolution sourceId");
  const origin=normalizeApiOrigin(apiOrigin);
  const origins=normalizeAllowedOrigins(allowedOrigins);
  const timeout=Number(timeoutMs);
  const maxBytes=Number(maxResponseBytes);
  if(typeof fetchImpl!=="function")throw new TypeError("A2A registry resolution fetch unavailable");
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("A2A registry resolution timeoutMs must be between 1000 and 30000");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>2*1024*1024)throw new RangeError("invalid A2A registry resolution maxResponseBytes");

  return Object.freeze({
    id,
    kind:"a2a-registry-public-resolution",
    uri:origin,
    async resolve(registryId){
      if(networkEnabled!==true)throw Object.assign(new Error("A2A registry resolution network disabled"),{code:"ARCA_A2A_REGISTRY_RESOLUTION_NETWORK_DISABLED"});
      if(!origins.has(origin))throw new Error("A2A registry resolution origin not authorized by host: "+origin);
      const normalizedId=normalizeRegistryId(registryId);
      const url=origin+"/public/agents/"+encodeURIComponent(normalizedId);
      const response=await fetchImpl(url,{
        method:"GET",
        headers:{Accept:"application/json"},
        redirect:"manual",
        signal:AbortSignal.timeout(timeout)
      });
      if(response.status>=300&&response.status<400)throw Object.assign(new Error("A2A registry resolution redirect refused"),{code:"ARCA_A2A_REGISTRY_RESOLUTION_REDIRECT_REFUSED"});
      if(!response.ok)throw Object.assign(new Error("A2A registry resolution HTTP "+response.status),{code:"ARCA_A2A_REGISTRY_RESOLUTION_HTTP_ERROR",httpStatus:response.status});
      const agent=unwrapAgent(await readJson(response,maxBytes));
      const returnedId=firstField(agent,["id","identifier","package_name","packageName","package_id","packageId","slug"])??normalizedId;
      const displayName=firstField(agent,["display_name","displayName","name","title"])??returnedId;
      const packageName=firstField(agent,["package_name","packageName","package_id","packageId"]);
      const manifestRaw=firstField(agent,["manifest_url","manifestUrl","agent_card_url","agentCardUrl","card_url","cardUrl"]);
      const manifestUrl=normalizeManifestUrl(manifestRaw);
      return Object.freeze({
        format:ARCA_A2A_REGISTRY_RESOLUTION_FORMAT,
        version:1,
        sourceId:id,
        sourceKind:"a2a-registry-public-resolution",
        sourceOrigin:origin,
        requestedRegistryId:normalizedId,
        registryId:bounded(returnedId,"A2A registry returned id",240),
        displayName:bounded(displayName,"A2A registry displayName",240),
        packageName:packageName===null?null:bounded(packageName,"A2A registry packageName",240),
        manifestUrl,
        manifestReferencePresent:manifestUrl!==null,
        trustState:"untrusted",
        admissionState:"not-admitted",
        candidateCreated:false,
        candidateExecuted:false,
        manifestFetched:false,
        trustGranted:false,
        admissionGranted:false,
        dispatchAuthorized:false
      });
    }
  });
}
