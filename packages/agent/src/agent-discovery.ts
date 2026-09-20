import {createHash} from "node:crypto";

export const ARCA_AGENT_DISCOVERY_CANDIDATE_FORMAT="arca-agent-discovery-candidate-v1";
export const ARCA_AGENT_DISCOVERY_CATALOG_FORMAT="arca-agent-discovery-catalog-v1";
export const ARCA_AGENT_DISCOVERY_RUN_FORMAT="arca-agent-discovery-run-v1";

const SAFE_ID=/^[A-Za-z0-9._:-]{1,120}$/;
const CAPABILITY=/^[A-Za-z0-9._:-]{1,120}$/;
const HASH=/^[a-f0-9]{64}$/;
const PROTOCOLS=new Set(["aap","a2a","mcp","arca-federation","custom"]);
const KINDS=new Set(["agent","tool-server","arca-node"]);
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const DEFAULT_MAX_RESPONSE_BYTES=512*1024;

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function sha256(value){return createHash("sha256").update(typeof value==="string"?value:JSON.stringify(stableValue(value))).digest("hex")}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function bounded(value,label,max,{required=true}={}){
  const text=String(value??"").trim();
  if(required&&!text)throw new TypeError(label+" required");
  if(text.length>max)throw new RangeError(label+" exceeds "+max+" characters");
  return text;
}
function safeId(value,label){const text=bounded(value,label,120);if(!SAFE_ID.test(text))throw new TypeError("invalid "+label);return text}
function normalizeCapabilities(values=[]){
  if(!Array.isArray(values))throw new TypeError("discovery capabilities must be array");
  const out=[...new Set(values.map(value=>bounded(value,"capability",120).toLowerCase()))].sort();
  for(const capability of out)if(!CAPABILITY.test(capability))throw new TypeError("invalid capability: "+capability);
  return out;
}
function assertNoSecrets(value,path="candidate"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecrets(item,path+"["+index+"]"));return}
  if(!plain(value))return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY.test(key))throw new Error("secret-like field not allowed in "+path+"."+key);
    assertNoSecrets(item,path+"."+key);
  }
}
function isLoopback(hostname){
  const host=String(hostname).toLowerCase();
  return host==="localhost"||host==="127.0.0.1"||host==="::1"||host==="[::1]";
}
function normalizeEndpoint(value,{label="candidate endpoint"}={}){
  const url=new URL(bounded(value,label,2048));
  if(!["https:","http:"].includes(url.protocol))throw new Error(label+" must use HTTP(S)");
  if(url.username||url.password)throw new Error(label+" cannot contain credentials");
  if(url.search||url.hash)throw new Error(label+" cannot contain query or fragment");
  if(url.protocol==="http:"&&!isLoopback(url.hostname))throw new Error(label+" requires TLS outside loopback");
  url.pathname=url.pathname.replace(/\/+$/,"")||"/";
  return url.toString().replace(/\/$/,"");
}
function normalizeCatalogUrl(value){
  const url=new URL(bounded(value,"discovery catalog url",2048));
  if(!["https:","http:"].includes(url.protocol))throw new Error("discovery catalog must use HTTP(S)");
  if(url.username||url.password)throw new Error("discovery catalog cannot contain credentials");
  if(url.search||url.hash)throw new Error("discovery catalog cannot contain query or fragment");
  if(url.protocol==="http:"&&!isLoopback(url.hostname))throw new Error("HTTP discovery catalog allowed only for loopback");
  return url.toString();
}
function normalizeOrigins(values=[]){
  if(!Array.isArray(values))throw new TypeError("allowedOrigins must be array");
  return new Set(values.map(value=>new URL(String(value)).origin));
}
function assertSourcePolicy(url,{allowedOrigins,allowLoopback}){
  const parsed=new URL(url);
  if(isLoopback(parsed.hostname)){
    if(allowLoopback!==true)throw new Error("loopback discovery source not authorized by host");
    return;
  }
  if(!allowedOrigins.has(parsed.origin))throw new Error("external discovery source origin not authorized by host: "+parsed.origin);
}
async function readJson(response,maxBytes){
  const length=Number(response.headers?.get?.("content-length")??0);
  if(Number.isFinite(length)&&length>maxBytes)throw new RangeError("discovery response too large");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw new RangeError("discovery response too large");
  if(!bytes.byteLength)throw new Error("empty discovery response");
  return JSON.parse(new TextDecoder().decode(bytes));
}
function normalizeProtocol(value){const protocol=bounded(value??"aap","candidate protocol",40).toLowerCase();if(!PROTOCOLS.has(protocol))throw new Error("unsupported candidate protocol: "+protocol);return protocol}
function normalizeKind(value){const kind=bounded(value??"agent","candidate kind",40).toLowerCase();if(!KINDS.has(kind))throw new Error("unsupported candidate kind: "+kind);return kind}
function normalizeDate(value,label){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error("invalid "+label);return date.toISOString()}
function candidateKeyFor({kind,protocol,endpoint,advertisedId}){return sha256({kind,protocol,endpoint,advertisedId})}

function normalizeObservation(input,{sourceId,sourceKind,sourceUri=null,discoveredAt}={}){
  assertNoSecrets(input);
  const kind=normalizeKind(input.kind);
  const protocol=normalizeProtocol(input.protocol);
  const advertisedId=safeId(input.id??input.advertisedId,"candidate advertisedId");
  const endpoint=normalizeEndpoint(input.endpoint);
  const provider=bounded(input.provider??"unknown","candidate provider",120);
  const name=bounded(input.name??advertisedId,"candidate name",200);
  const declaredCapabilities=normalizeCapabilities(input.capabilities??input.declaredCapabilities??[]);
  const seenAt=normalizeDate(discoveredAt,"discovery observation time");
  const source=safeId(sourceId,"discovery sourceId");
  const sourceType=bounded(sourceKind??"custom","discovery sourceKind",80);
  const sourceLocation=sourceUri===null?null:normalizeCatalogUrl(sourceUri);
  const candidateKey=candidateKeyFor({kind,protocol,endpoint,advertisedId});
  return Object.freeze({
    candidateKey,
    advertisedId,
    kind,
    protocol,
    endpoint,
    provider,
    name,
    declaredCapabilities:Object.freeze([...declaredCapabilities]),
    observation:Object.freeze({
      sourceId:source,
      sourceKind:sourceType,
      sourceUri:sourceLocation,
      discoveredAt:seenAt,
      declaredCapabilities:Object.freeze([...declaredCapabilities]),
      provider,
      name
    })
  });
}
function freezeCandidate(record){
  return Object.freeze({
    ...record,
    declaredCapabilities:Object.freeze([...record.declaredCapabilities]),
    observations:Object.freeze(record.observations.map(value=>Object.freeze({...value,declaredCapabilities:Object.freeze([...value.declaredCapabilities])})))
  });
}

export class AgentDiscoveryCandidateRegistry{
  #records=new Map();

  observe(input,provenance={}){
    const normalized=normalizeObservation(input,provenance);
    const current=this.#records.get(normalized.candidateKey);
    if(!current){
      const record=freezeCandidate({
        format:ARCA_AGENT_DISCOVERY_CANDIDATE_FORMAT,
        version:1,
        candidateKey:normalized.candidateKey,
        advertisedId:normalized.advertisedId,
        kind:normalized.kind,
        protocol:normalized.protocol,
        endpoint:normalized.endpoint,
        provider:normalized.provider,
        name:normalized.name,
        declaredCapabilities:[...normalized.declaredCapabilities],
        capabilityState:"declared",
        trustState:"untrusted",
        admissionState:"not-admitted",
        firstSeenAt:normalized.observation.discoveredAt,
        lastSeenAt:normalized.observation.discoveredAt,
        observations:[normalized.observation]
      });
      this.#records.set(record.candidateKey,record);
      return record;
    }

    const observations=current.observations.filter(value=>value.sourceId!==normalized.observation.sourceId);
    observations.push(normalized.observation);
    observations.sort((a,b)=>a.sourceId.localeCompare(b.sourceId));

    const capabilities=[...new Set(observations.flatMap(value=>value.declaredCapabilities))].sort();
    const lastSeenAt=[current.lastSeenAt,normalized.observation.discoveredAt].sort().at(-1);
    const record=freezeCandidate({
      ...current,
      provider:normalized.provider,
      name:normalized.name,
      declaredCapabilities:capabilities,
      capabilityState:"declared",
      trustState:"untrusted",
      admissionState:"not-admitted",
      lastSeenAt,
      observations
    });
    this.#records.set(record.candidateKey,record);
    return record;
  }

  get(candidateKey){
    const key=String(candidateKey??"");
    if(!HASH.test(key))throw new Error("invalid discovery candidateKey");
    return this.#records.get(key)??null;
  }

  list({protocol=null,kind=null,capability=null}={}){
    let records=[...this.#records.values()];
    if(protocol!==null){const wanted=normalizeProtocol(protocol);records=records.filter(value=>value.protocol===wanted)}
    if(kind!==null){const wanted=normalizeKind(kind);records=records.filter(value=>value.kind===wanted)}
    if(capability!==null){const wanted=normalizeCapabilities([capability])[0];records=records.filter(value=>value.declaredCapabilities.includes(wanted))}
    return records.sort((a,b)=>a.candidateKey.localeCompare(b.candidateKey));
  }

  size(){return this.#records.size}
}

export function createStaticAgentDiscoverySource({sourceId,candidates=[]}={}){
  const id=safeId(sourceId,"discovery sourceId");
  if(!Array.isArray(candidates))throw new TypeError("static discovery candidates must be array");
  const snapshot=clone(candidates);
  return Object.freeze({
    id,
    kind:"static",
    uri:null,
    async discover(){return clone(snapshot)}
  });
}

export function createHttpAgentCatalogSource({
  sourceId,
  url,
  networkEnabled=false,
  allowedOrigins=[],
  allowLoopback=false,
  fetchImpl=globalThis.fetch,
  timeoutMs=10000,
  maxResponseBytes=DEFAULT_MAX_RESPONSE_BYTES
}={}){
  const id=safeId(sourceId,"discovery sourceId");
  const catalogUrl=normalizeCatalogUrl(url);
  if(typeof fetchImpl!=="function")throw new TypeError("discovery fetch unavailable");
  const origins=normalizeOrigins(allowedOrigins);
  const timeout=Number(timeoutMs);
  const maxBytes=Number(maxResponseBytes);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>30000)throw new RangeError("discovery timeoutMs must be between 1000 and 30000");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>2*1024*1024)throw new RangeError("invalid discovery maxResponseBytes");

  return Object.freeze({
    id,
    kind:"http-catalog",
    uri:catalogUrl,
    async discover(){
      if(networkEnabled!==true)throw Object.assign(new Error("discovery network disabled"),{code:"ARCA_DISCOVERY_NETWORK_DISABLED"});
      assertSourcePolicy(catalogUrl,{allowedOrigins:origins,allowLoopback});
      const response=await fetchImpl(catalogUrl,{
        method:"GET",
        headers:{Accept:"application/json"},
        redirect:"manual",
        signal:AbortSignal.timeout(timeout)
      });
      if(response.status>=300&&response.status<400)throw Object.assign(new Error("discovery redirect refused"),{code:"ARCA_DISCOVERY_REDIRECT_REFUSED"});
      if(!response.ok)throw Object.assign(new Error("discovery catalog HTTP "+response.status),{code:"ARCA_DISCOVERY_HTTP_ERROR",httpStatus:response.status});
      const body=await readJson(response,maxBytes);
      if(!plain(body)||body.format!==ARCA_AGENT_DISCOVERY_CATALOG_FORMAT||body.version!==1||!Array.isArray(body.candidates))throw new Error("invalid ARCA discovery catalog");
      if(body.candidates.length>256)throw new RangeError("discovery catalog candidate limit exceeded");
      assertNoSecrets(body);
      return clone(body.candidates);
    }
  });
}

export class AgentDiscoveryFabric{
  constructor({registry=new AgentDiscoveryCandidateRegistry(),sources=[],maxCandidatesPerSource=256,now=()=>new Date()}={}){
    if(!(registry instanceof AgentDiscoveryCandidateRegistry))throw new TypeError("AgentDiscoveryCandidateRegistry required");
    if(!Array.isArray(sources))throw new TypeError("discovery sources must be array");
    if(!Number.isSafeInteger(maxCandidatesPerSource)||maxCandidatesPerSource<1||maxCandidatesPerSource>256)throw new RangeError("invalid maxCandidatesPerSource");
    if(typeof now!=="function")throw new TypeError("discovery clock required");
    this.registry=registry;
    this.sources=[];
    this.maxCandidatesPerSource=maxCandidatesPerSource;
    this.now=now;
    for(const source of sources)this.addSource(source);
  }

  addSource(source){
    if(!source||typeof source!=="object"||Array.isArray(source)||typeof source.discover!=="function")throw new TypeError("invalid discovery source");
    const id=safeId(source.id,"discovery sourceId");
    if(this.sources.some(value=>value.id===id))throw new Error("duplicate discovery source: "+id);
    this.sources.push(source);
    this.sources.sort((a,b)=>a.id.localeCompare(b.id));
    return this;
  }

  async run({runId=null}={}){
    const startedAt=normalizeDate(this.now(),"discovery start time");
    const normalizedRunId=runId===null?"discovery-"+startedAt.replace(/[-:.TZ]/g,"").slice(0,14):safeId(runId,"discovery runId");
    const sourceResults=[];
    const observedKeys=new Set();

    for(const source of this.sources){
      try{
        const candidates=await source.discover();
        if(!Array.isArray(candidates))throw new TypeError("discovery source must return array");
        if(candidates.length>this.maxCandidatesPerSource)throw new RangeError("discovery source candidate limit exceeded");
        let observed=0;
        for(const candidate of candidates){
          const record=this.registry.observe(candidate,{
            sourceId:source.id,
            sourceKind:source.kind??"custom",
            sourceUri:source.uri??null,
            discoveredAt:this.now()
          });
          observedKeys.add(record.candidateKey);
          observed+=1;
        }
        sourceResults.push(Object.freeze({sourceId:source.id,status:"completed",observed,errorCode:null}));
      }catch(error){
        sourceResults.push(Object.freeze({
          sourceId:source.id,
          status:"failed",
          observed:0,
          errorCode:typeof error?.code==="string"?error.code:"ARCA_DISCOVERY_SOURCE_FAILED"
        }));
      }
    }

    const completedAt=normalizeDate(this.now(),"discovery completion time");
    return Object.freeze({
      format:ARCA_AGENT_DISCOVERY_RUN_FORMAT,
      version:1,
      runId:normalizedRunId,
      startedAt,
      completedAt,
      sourceCount:this.sources.length,
      observedCandidateCount:observedKeys.size,
      registryCandidateCount:this.registry.size(),
      candidateKeys:Object.freeze([...observedKeys].sort()),
      sourceResults:Object.freeze(sourceResults),
      trustGranted:false,
      capabilitiesVerified:false,
      admissionGranted:false,
      dispatchAuthorized:false
    });
  }
}
