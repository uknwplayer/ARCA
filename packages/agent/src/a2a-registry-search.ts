import {createHash} from "node:crypto";

export const ARCA_A2A_REGISTRY_SEARCH_RESULT_FORMAT="arca-a2a-registry-search-result-v1";
export const ARCA_A2A_REGISTRY_SEARCH_HIT_FORMAT="arca-a2a-registry-search-hit-v1";
export const ARCA_A2A_REGISTRY_SEARCH_SOURCE_KIND="a2a-registry-public-search";

const DEFAULT_MAX_RESPONSE_BYTES=512*1024;
const SAFE_SOURCE_ID=/^[A-Za-z0-9._:-]{1,120}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function bounded(value,label,max,{required=true}={}){
  const text=String(value??"").trim();
  if(required&&!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function safeSourceId(value){
  const text=bounded(value,"A2A registry search sourceId",120);
  if(!SAFE_SOURCE_ID.test(text))throw new TypeError("invalid A2A registry search sourceId");
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
function optionalBounded(value,label,max){
  if(value===undefined||value===null||String(value).trim()==="")return null;
  return bounded(value,label,max);
}
function normalizeTags(values=[]){
  if(!Array.isArray(values))throw new TypeError("A2A registry tags must be array");
  const tags=[...new Set(values.map(value=>bounded(value,"A2A registry tag",80)))].sort();
  if(tags.length>20)throw new RangeError("A2A registry tag limit exceeded");
  return tags;
}
async function readJson(response,maxBytes){
  const length=Number(response.headers?.get?.("content-length")??0);
  if(Number.isFinite(length)&&length>maxBytes)throw new RangeError("A2A registry search response too large");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw new RangeError("A2A registry search response too large");
  if(!bytes.byteLength)throw new Error("empty A2A registry search response");
  return JSON.parse(new TextDecoder().decode(bytes));
}
function rowsFromBody(body){
  if(Array.isArray(body))return body;
  if(!plain(body))throw new Error("invalid A2A registry search response");
  for(const key of ["agents","results","items"]){if(Array.isArray(body[key]))return body[key]}
  if(Array.isArray(body.data))return body.data;
  if(plain(body.data)){
    for(const key of ["agents","results","items"]){if(Array.isArray(body.data[key]))return body.data[key]}
  }
  throw new Error("A2A registry search response has no agent list");
}
function firstField(row,keys){
  for(const key of keys){
    const value=row?.[key];
    if(typeof value==="string"&&value.trim())return value.trim();
    if(typeof value==="number"&&Number.isFinite(value))return String(value);
  }
  return null;
}
function normalizeOptionalPublicUrl(value){
  if(value===null)return null;
  const url=new URL(bounded(value,"A2A registry manifest URL",2048));
  if(url.protocol!=="https:")return null;
  if(isLoopback(url.hostname)||url.username||url.password||url.hash)return null;
  return url.toString();
}
function normalizeHit(row,{apiOrigin,index}){
  if(!plain(row))throw new Error("invalid A2A registry search hit");
  const registryId=firstField(row,["id","identifier","package_name","packageName","package_id","packageId","slug"]);
  if(!registryId)throw new Error("A2A registry search hit missing identifier");
  const displayName=firstField(row,["display_name","displayName","name","title"])??registryId;
  const manifestRaw=firstField(row,["manifest_url","manifestUrl","agent_card_url","agentCardUrl","card_url","cardUrl"]);
  const manifestUrl=manifestRaw===null?null:normalizeOptionalPublicUrl(manifestRaw);
  const detailsUrl=apiOrigin+"/public/agents/"+encodeURIComponent(registryId);
  const hitKey=createHash("sha256").update(registryId+"\n"+(manifestUrl??"")).digest("hex");
  return Object.freeze({
    format:ARCA_A2A_REGISTRY_SEARCH_HIT_FORMAT,
    version:1,
    hitKey,
    rank:index+1,
    registryId:bounded(registryId,"A2A registry hit identifier",240),
    displayName:bounded(displayName,"A2A registry hit displayName",240),
    detailsUrl,
    manifestUrl,
    trustState:"untrusted",
    admissionState:"not-admitted",
    candidateCreated:false,
    candidateExecuted:false,
    trustGranted:false,
    admissionGranted:false,
    dispatchAuthorized:false
  });
}

export function createA2aRegistrySearchSource({
  sourceId="a2a-global-registry",
  apiOrigin="https://api.a2a-registry.org",
  query,
  tags=[],
  category=null,
  target=null,
  orgId=null,
  networkEnabled=false,
  allowedOrigins=[],
  fetchImpl=globalThis.fetch,
  timeoutMs=10000,
  maxResponseBytes=DEFAULT_MAX_RESPONSE_BYTES,
  maxResults=20
}={}){
  const id=safeSourceId(sourceId);
  const origin=normalizeApiOrigin(apiOrigin);
  const q=bounded(query,"A2A registry search query",500);
  const normalizedTags=normalizeTags(tags);
  const normalizedCategory=optionalBounded(category,"A2A registry category",120);
  const normalizedTarget=optionalBounded(target,"A2A registry target",120);
  const normalizedOrgId=optionalBounded(orgId,"A2A registry orgId",160);
  const origins=normalizeAllowedOrigins(allowedOrigins);
  const timeout=Number(timeoutMs);
  const maxBytes=Number(maxResponseBytes);
  const limit=Number(maxResults);
  if(typeof fetchImpl!=="function")throw new TypeError("A2A registry search fetch unavailable");
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("A2A registry search timeoutMs must be between 1000 and 30000");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>2*1024*1024)throw new RangeError("invalid A2A registry search maxResponseBytes");
  if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw new RangeError("A2A registry search maxResults must be between 1 and 20");

  const searchUrl=new URL("/public/agents",origin);
  searchUrl.searchParams.set("q",q);
  if(normalizedTags.length)searchUrl.searchParams.set("tags",normalizedTags.join(","));
  if(normalizedCategory!==null)searchUrl.searchParams.set("category",normalizedCategory);
  if(normalizedTarget!==null)searchUrl.searchParams.set("target",normalizedTarget);
  if(normalizedOrgId!==null)searchUrl.searchParams.set("orgId",normalizedOrgId);

  return Object.freeze({
    id,
    kind:ARCA_A2A_REGISTRY_SEARCH_SOURCE_KIND,
    uri:origin,
    async search(){
      if(networkEnabled!==true)throw Object.assign(new Error("A2A registry search network disabled"),{code:"ARCA_A2A_REGISTRY_SEARCH_NETWORK_DISABLED"});
      if(!origins.has(origin))throw new Error("A2A registry search origin not authorized by host: "+origin);
      const response=await fetchImpl(searchUrl.toString(),{
        method:"GET",
        headers:{Accept:"application/json"},
        redirect:"manual",
        signal:AbortSignal.timeout(timeout)
      });
      if(response.status>=300&&response.status<400)throw Object.assign(new Error("A2A registry search redirect refused"),{code:"ARCA_A2A_REGISTRY_SEARCH_REDIRECT_REFUSED"});
      if(!response.ok)throw Object.assign(new Error("A2A registry search HTTP "+response.status),{code:"ARCA_A2A_REGISTRY_SEARCH_HTTP_ERROR",httpStatus:response.status});
      const body=await readJson(response,maxBytes);
      const rows=rowsFromBody(body).slice(0,limit);
      const hits=rows.map((row,index)=>normalizeHit(row,{apiOrigin:origin,index}));
      return Object.freeze({
        format:ARCA_A2A_REGISTRY_SEARCH_RESULT_FORMAT,
        version:1,
        sourceId:id,
        sourceKind:ARCA_A2A_REGISTRY_SEARCH_SOURCE_KIND,
        sourceOrigin:origin,
        query:q,
        hitCount:hits.length,
        hits:Object.freeze(hits),
        trustGranted:false,
        admissionGranted:false,
        candidateCreated:false,
        candidateExecuted:false,
        dispatchAuthorized:false
      });
    }
  });
}
