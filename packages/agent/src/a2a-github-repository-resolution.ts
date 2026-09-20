import {createHash} from "node:crypto";
import {AgentDiscoveryCandidateRegistry} from "./agent-discovery.ts";
import {normalizeA2aAgentCard} from "./a2a-discovery.ts";
import {classifyA2aReference} from "./a2a-reference-classification.ts";

export const ARCA_A2A_GITHUB_REPOSITORY_RESOLUTION_FORMAT="arca-a2a-github-repository-resolution-v1";
export const ARCA_A2A_GITHUB_REPOSITORY_SOURCE_KIND="a2a-github-repository";

const API_ORIGIN="https://api.github.com";
const CARD_PATHS=Object.freeze(["agent-card.json",".well-known/agent-card.json"]);
const MAX_CARD_BYTES=512*1024;
const MAX_METADATA_BYTES=128*1024;
const SAFE_SOURCE_ID=/^[A-Za-z0-9._:-]{1,120}$/;
const SAFE_REPO_PART=/^[A-Za-z0-9_.-]{1,100}$/;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function bounded(value,label,max){
  const text=String(value??"").trim();
  if(!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function safeSourceId(value){
  const text=bounded(value,"A2A GitHub resolver sourceId",120);
  if(!SAFE_SOURCE_ID.test(text))throw new TypeError("invalid A2A GitHub resolver sourceId");
  return text;
}
function sha256(value){return createHash("sha256").update(value).digest("hex")}
function cleanHttpsOrigin(value,label){
  const url=new URL(bounded(value,label,2048));
  if(url.protocol!=="https:")throw new Error(label+" requires HTTPS");
  if(url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new Error(label+" must be a clean HTTPS origin");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host==="127.0.0.1"||host==="::1"||host==="[::1]")throw new Error(label+" refuses loopback");
  return url.origin;
}
function normalizeAllowedAgentOrigins(values=[]){
  if(!Array.isArray(values))throw new TypeError("A2A GitHub resolver allowedAgentOrigins must be array");
  return [...new Set(values.map(value=>cleanHttpsOrigin(value,"A2A allowed agent origin")))].sort();
}
async function readBytes(response,maxBytes,label){
  const length=Number(response.headers?.get?.("content-length")??0);
  if(Number.isFinite(length)&&length>maxBytes)throw new RangeError(label+" too large");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw new RangeError(label+" too large");
  if(!bytes.byteLength)throw new Error("empty "+label);
  return bytes;
}
async function readJson(response,maxBytes,label){
  const bytes=await readBytes(response,maxBytes,label);
  return JSON.parse(new TextDecoder().decode(bytes));
}
function decodeGitHubBase64(value,maxBytes){
  const encoded=bounded(value,"GitHub content",1024*1024).replace(/\s+/g,"");
  if(encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error("invalid GitHub base64 content");
  const bytes=Buffer.from(encoded,"base64");
  if(bytes.byteLength>maxBytes)throw new RangeError("A2A Agent Card too large");
  if(!bytes.byteLength)throw new Error("empty A2A Agent Card");
  return new Uint8Array(bytes);
}
function repoParts(classification){
  const repository=bounded(classification.repository,"GitHub repository",220);
  const [owner,name,...rest]=repository.split("/");
  if(rest.length||!SAFE_REPO_PART.test(owner)||!SAFE_REPO_PART.test(name))throw new Error("invalid GitHub repository reference");
  return {owner,name,repository:owner+"/"+name};
}
function advertisedEndpointOrigin(card){
  let value=null;
  if(Array.isArray(card?.supportedInterfaces)){
    for(const entry of card.supportedInterfaces){
      if(plain(entry)&&typeof entry.url==="string"&&entry.url.trim()){value=entry.url.trim();break}
    }
  }
  if(value===null&&typeof card?.url==="string"&&card.url.trim())value=card.url.trim();
  if(value===null)throw new Error("A2A Agent Card has no advertised endpoint");
  const url=new URL(bounded(value,"A2A advertised endpoint",2048));
  if(url.protocol!=="https:")throw new Error("A2A advertised endpoint requires HTTPS");
  if(url.username||url.password||url.search||url.hash)throw new Error("A2A advertised endpoint cannot contain credentials, query or fragment");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host==="127.0.0.1"||host==="::1"||host==="[::1]")throw new Error("A2A advertised endpoint refuses loopback");
  return url.origin;
}
function apiUrl(path){
  const url=new URL(path,API_ORIGIN);
  if(url.origin!==API_ORIGIN)throw new Error("GitHub API origin invariant failed");
  return url;
}
async function fetchJson(fetchImpl,url,{timeoutMs,maxBytes,label,allow404=false}){
  const response=await fetchImpl(url.toString(),{
    method:"GET",
    headers:{
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"ARCA-A2A-GitHub-Resolver/0.1"
    },
    redirect:"manual",
    signal:AbortSignal.timeout(timeoutMs)
  });
  if(response.status>=300&&response.status<400)throw Object.assign(new Error(label+" redirect refused"),{code:"ARCA_A2A_GITHUB_REDIRECT_REFUSED"});
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw Object.assign(new Error(label+" HTTP "+response.status),{code:"ARCA_A2A_GITHUB_HTTP_ERROR",httpStatus:response.status});
  return readJson(response,maxBytes,label);
}

export async function resolveA2aGithubRepository({
  sourceId="a2a-github-repository",
  referenceUrl,
  networkEnabled=false,
  allowedAgentOrigins=[],
  fetchImpl=globalThis.fetch,
  timeoutMs=10000,
  maxCardBytes=MAX_CARD_BYTES,
  now=()=>new Date()
}={}){
  const id=safeSourceId(sourceId);
  if(typeof fetchImpl!=="function")throw new TypeError("A2A GitHub resolver fetch unavailable");
  const timeout=Number(timeoutMs);
  const cardLimit=Number(maxCardBytes);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("A2A GitHub resolver timeoutMs must be between 1000 and 30000");
  if(!Number.isSafeInteger(cardLimit)||cardLimit<1024||cardLimit>2*1024*1024)throw new RangeError("invalid A2A GitHub resolver maxCardBytes");
  if(typeof now!=="function")throw new TypeError("A2A GitHub resolver clock required");

  const classification=classifyA2aReference(referenceUrl);
  if(classification.kind!=="github-repository")throw new Error("A2A GitHub resolver requires github-repository reference");
  if(networkEnabled!==true)throw Object.assign(new Error("A2A GitHub resolver network disabled"),{code:"ARCA_A2A_GITHUB_NETWORK_DISABLED"});

  const {owner,name,repository}=repoParts(classification);
  const allowedOrigins=normalizeAllowedAgentOrigins(allowedAgentOrigins);

  const metadata=await fetchJson(
    fetchImpl,
    apiUrl("/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(name)),
    {timeoutMs:timeout,maxBytes:MAX_METADATA_BYTES,label:"GitHub repository metadata"}
  );
  if(!plain(metadata))throw new Error("invalid GitHub repository metadata");
  const defaultBranch=bounded(metadata.default_branch,"GitHub default branch",240);

  let card=null;
  let cardPath=null;
  let contentSha=null;
  for(const candidatePath of CARD_PATHS){
    const path=candidatePath.split("/").map(encodeURIComponent).join("/");
    const url=apiUrl("/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(name)+"/contents/"+path);
    url.searchParams.set("ref",defaultBranch);
    const body=await fetchJson(
      fetchImpl,
      url,
      {timeoutMs:timeout,maxBytes:1024*1024,label:"GitHub Agent Card content",allow404:true}
    );
    if(body===null)continue;
    if(!plain(body)||body.type!=="file"||body.encoding!=="base64"||typeof body.content!=="string")throw new Error("invalid GitHub Agent Card content response");
    if(Number(body.size)>cardLimit)throw new RangeError("A2A Agent Card too large");
    const bytes=decodeGitHubBase64(body.content,cardLimit);
    card=JSON.parse(new TextDecoder().decode(bytes));
    cardPath=candidatePath;
    contentSha=typeof body.sha==="string"&&body.sha.trim()?body.sha.trim():null;
    break;
  }
  if(card===null){
    return Object.freeze({
      format:ARCA_A2A_GITHUB_REPOSITORY_RESOLUTION_FORMAT,
      version:1,
      sourceId:id,
      sourceKind:ARCA_A2A_GITHUB_REPOSITORY_SOURCE_KIND,
      repository,
      repositoryUrl:classification.normalizedUrl,
      defaultBranch,
      cardStatus:"not-found",
      cardPath:null,
      cardSha256:null,
      contentSha:null,
      advertisedEndpointOrigin:null,
      endpointOriginAuthorized:false,
      candidate:null,
      candidateCreated:false,
      rawAgentCardPersisted:false,
      candidateExecuted:false,
      trustGranted:false,
      admissionGranted:false,
      dispatchAuthorized:false
    });
  }

  const serialized=JSON.stringify(card);
  const endpointOrigin=advertisedEndpointOrigin(card);
  const authorized=allowedOrigins.includes(endpointOrigin);

  if(!authorized){
    return Object.freeze({
      format:ARCA_A2A_GITHUB_REPOSITORY_RESOLUTION_FORMAT,
      version:1,
      sourceId:id,
      sourceKind:ARCA_A2A_GITHUB_REPOSITORY_SOURCE_KIND,
      repository,
      repositoryUrl:classification.normalizedUrl,
      defaultBranch,
      cardStatus:"endpoint-authorization-required",
      cardPath,
      cardSha256:sha256(serialized),
      contentSha,
      advertisedEndpointOrigin:endpointOrigin,
      endpointOriginAuthorized:false,
      candidate:null,
      candidateCreated:false,
      rawAgentCardPersisted:false,
      candidateExecuted:false,
      trustGranted:false,
      admissionGranted:false,
      dispatchAuthorized:false
    });
  }

  const normalized=normalizeA2aAgentCard(card,{
    sourceOrigin:"https://github.com",
    allowedAgentOrigins:allowedOrigins,
    allowLoopback:false
  });
  const registry=new AgentDiscoveryCandidateRegistry();
  const candidate=registry.observe(normalized,{
    sourceId:id,
    sourceKind:ARCA_A2A_GITHUB_REPOSITORY_SOURCE_KIND,
    sourceUri:classification.normalizedUrl,
    discoveredAt:now()
  });
  if(candidate.trustState!=="untrusted"||candidate.capabilityState!=="declared"||candidate.admissionState!=="not-admitted"){
    throw new Error("A2A GitHub repository resolution crossed the discovery trust boundary");
  }

  return Object.freeze({
    format:ARCA_A2A_GITHUB_REPOSITORY_RESOLUTION_FORMAT,
    version:1,
    sourceId:id,
    sourceKind:ARCA_A2A_GITHUB_REPOSITORY_SOURCE_KIND,
    repository,
    repositoryUrl:classification.normalizedUrl,
    defaultBranch,
    cardStatus:"candidate-created",
    cardPath,
    cardSha256:sha256(serialized),
    contentSha,
    advertisedEndpointOrigin:endpointOrigin,
    endpointOriginAuthorized:true,
    candidate,
    candidateCreated:true,
    rawAgentCardPersisted:false,
    candidateExecuted:false,
    trustGranted:false,
    admissionGranted:false,
    dispatchAuthorized:false
  });
}
