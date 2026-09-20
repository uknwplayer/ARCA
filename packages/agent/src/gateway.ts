export const ARCA_AGENT_DESCRIPTOR_FORMAT="arca-agent-descriptor-v1";
export const ARCA_AGENT_TASK_FORMAT="arca-agent-task-v1";
export const ARCA_AGENT_RESULT_FORMAT="arca-agent-result-v1";
export const ARCA_AGENT_GATEWAY_RESULT_FORMAT="arca-agent-gateway-result-v1";

const AGENT_ID=/^[A-Za-z0-9._-]{1,80}$/;
const CAPABILITY=/^[A-Za-z0-9._-]{1,80}$/;
const HEADER_NAME=/^[A-Za-z0-9-]{1,80}$/;
const AUTH_MODES=new Set(["none","bearer","api-key","oauth2"]);
const INLINE_SECRET_KEYS=new Set(["apikey","api_key","token","accesstoken","access_token","secret","clientsecret","client_secret","password","authorization"]);
const DEFAULT_MAX_RESPONSE_BYTES=2*1024*1024;

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function boundedString(value,field,max,{required=true}={}){const text=String(value??"").trim();if(required&&!text)throw new TypeError(`${field} obrigatorio`);if(text.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return text}
function uniqueCapabilities(values=[]){if(!Array.isArray(values))throw new TypeError("capabilities deve ser array");const normalized=[...new Set(values.map(value=>boundedString(value,"capability",80)).map(value=>value.toLowerCase()))].sort();for(const capability of normalized)if(!CAPABILITY.test(capability))throw new TypeError(`capability invalida: ${capability}`);return normalized}
function jsonClone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function isLoopback(hostname){const host=String(hostname).toLowerCase();return host==="localhost"||host==="127.0.0.1"||host==="::1"||host==="[::1]"}
function assertNoInlineSecrets(value,path="connection"){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoInlineSecrets(item,`${path}[${index}]`));return}
  if(!plainObject(value))return;
  for(const [key,item] of Object.entries(value)){
    const normalized=key.toLowerCase().replaceAll("-","");
    if(INLINE_SECRET_KEYS.has(key.toLowerCase())||INLINE_SECRET_KEYS.has(normalized))throw new Error(`segredo inline nao permitido em ${path}.${key}; use credentialRef`);
    assertNoInlineSecrets(item,`${path}.${key}`);
  }
}
function normalizeEndpoint(value){
  const url=new URL(boundedString(value,"endpoint",2048));
  if(!["https:","http:"].includes(url.protocol))throw new Error("endpoint deve usar HTTP(S)");
  if(url.username||url.password)throw new Error("credenciais nao podem estar embutidas no endpoint");
  if(url.search||url.hash)throw new Error("endpoint base nao pode conter query ou fragmento");
  if(url.protocol==="http:"&&!isLoopback(url.hostname))throw new Error("HTTP sem TLS permitido somente para loopback local");
  url.pathname=url.pathname.replace(/\/+$/,"")||"/";
  return url.toString().replace(/\/$/,"");
}
function normalizeAuth(input={mode:"none"}){
  if(!plainObject(input))throw new TypeError("auth invalido");
  assertNoInlineSecrets(input,"auth");
  const mode=String(input.mode??"none").trim().toLowerCase();
  if(!AUTH_MODES.has(mode))throw new Error(`auth mode nao suportado: ${mode}`);
  const credentialRef=mode==="none"?null:boundedString(input.credentialRef,"credentialRef",200);
  const headerName=mode==="api-key"?boundedString(input.headerName??"X-API-Key","headerName",80):null;
  if(headerName&&!HEADER_NAME.test(headerName))throw new TypeError("headerName invalido");
  if(headerName&&["host","content-length","connection"].includes(headerName.toLowerCase()))throw new Error("headerName reservado");
  return Object.freeze({mode,credentialRef,headerName});
}
function normalizeConnection(input){
  if(!plainObject(input))throw new TypeError("connection obrigatoria para agente externo");
  assertNoInlineSecrets(input,"connection");
  return Object.freeze({endpoint:normalizeEndpoint(input.endpoint),auth:normalizeAuth(input.auth??{mode:"none"})});
}
function publicDescriptor(entry){
  const base={format:ARCA_AGENT_DESCRIPTOR_FORMAT,id:entry.id,name:entry.name,provider:entry.provider,kind:entry.kind,capabilities:[...entry.capabilities],priority:entry.priority,principal:entry.principal===true};
  if(entry.kind==="external")base.connection={endpoint:entry.connection.endpoint,auth:{mode:entry.connection.auth.mode,headerName:entry.connection.auth.headerName}};
  return Object.freeze(base);
}
function normalizeDescriptor(input,{kind,handler}={}){
  if(!plainObject(input))throw new TypeError("descriptor invalido");
  const id=boundedString(input.id,"agent.id",80);if(!AGENT_ID.test(id))throw new TypeError("agent.id invalido");
  const name=boundedString(input.name??id,"agent.name",160);
  const provider=boundedString(input.provider??(kind==="internal"?"arca":"external"),"agent.provider",120);
  const capabilities=uniqueCapabilities(input.capabilities??[]);
  const priorityRaw=input.priority??(input.principal===true?1000:100);const priority=Number(priorityRaw);if(!Number.isSafeInteger(priority)||priority<0||priority>10000)throw new RangeError("priority deve estar entre 0 e 10000");
  if(kind==="internal"&&typeof handler!=="function")throw new TypeError("handler obrigatorio para agente interno");
  const connection=kind==="external"?normalizeConnection(input.connection):null;
  return Object.freeze({format:ARCA_AGENT_DESCRIPTOR_FORMAT,id,name,provider,kind,capabilities,priority,principal:input.principal===true,connection,handler:kind==="internal"?handler:null});
}

export class AgentRegistry{
  #agents=new Map();
  registerInternal(descriptor,handler){const entry=normalizeDescriptor(descriptor,{kind:"internal",handler});return this.#register(entry)}
  registerExternal(descriptor){const entry=normalizeDescriptor(descriptor,{kind:"external"});return this.#register(entry)}
  #register(entry){if(this.#agents.has(entry.id))throw new Error(`agent ja registrado: ${entry.id}`);if(entry.principal&&[...this.#agents.values()].some(agent=>agent.principal))throw new Error("somente um agente principal pode ser registrado");this.#agents.set(entry.id,entry);return this}
  has(id){return this.#agents.has(String(id))}
  get(id){return this.#agents.get(String(id))??null}
  list(){return [...this.#agents.values()].map(publicDescriptor).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))}
  select(requiredCapabilities=[],options={}){
    const required=uniqueCapabilities(requiredCapabilities);const preferredId=options.preferredAgentId?String(options.preferredAgentId):null;const allowExternal=options.allowExternal===true;
    const candidates=[...this.#agents.values()].filter(agent=>(allowExternal||agent.kind==="internal")&&required.every(capability=>agent.capabilities.includes(capability)));
    candidates.sort((a,b)=>{if(preferredId){if(a.id===preferredId&&b.id!==preferredId)return -1;if(b.id===preferredId&&a.id!==preferredId)return 1}if(a.principal!==b.principal)return a.principal?-1:1;if(a.priority!==b.priority)return b.priority-a.priority;if(a.kind!==b.kind)return a.kind==="internal"?-1:1;return a.id.localeCompare(b.id)});
    return candidates[0]??null;
  }
}

function normalizeOrigins(values=[]){if(!Array.isArray(values))throw new TypeError("allowedOrigins deve ser array");return new Set(values.map(value=>{const url=new URL(String(value));return url.origin}))}
function assertEndpointPolicy(endpoint,{allowedOrigins,allowLoopback}){const url=new URL(endpoint);if(isLoopback(url.hostname)){if(allowLoopback!==true)throw new Error("endpoint loopback nao autorizado pelo host");return}if(!allowedOrigins.has(url.origin))throw new Error(`origin externa nao autorizada pelo host: ${url.origin}`)}
async function readJsonResponse(response,maxBytes){
  const length=Number(response.headers?.get?.("content-length")??0);if(length>maxBytes)throw new RangeError(`resposta do agente excede ${maxBytes} bytes`);
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>maxBytes)throw new RangeError(`resposta do agente excede ${maxBytes} bytes`);
  if(!bytes.byteLength)return null;return JSON.parse(new TextDecoder().decode(bytes));
}
function joinEndpoint(base,path){return `${String(base).replace(/\/+$/,"")}${path}`}
function validateRemoteDescriptor(value){
  if(!plainObject(value)||value.format!==ARCA_AGENT_DESCRIPTOR_FORMAT)throw new Error("descriptor remoto ARCA invalido");
  return {id:boundedString(value.id,"remote.id",80),name:boundedString(value.name??value.id,"remote.name",160),provider:boundedString(value.provider??"external","remote.provider",120),capabilities:uniqueCapabilities(value.capabilities??[])};
}
function normalizeTask(input){
  if(!plainObject(input))throw new TypeError("task invalida");
  const taskId=boundedString(input.taskId,"taskId",120);const task=boundedString(input.task,"task",100000);const requiredCapabilities=uniqueCapabilities(input.requiredCapabilities??[]);
  const context=input.context===undefined?{}:input.context;if(!plainObject(context))throw new TypeError("context deve ser objeto");
  return Object.freeze({format:ARCA_AGENT_TASK_FORMAT,taskId,task,requiredCapabilities,context:jsonClone(context),humanReviewRequired:true});
}
function validateRemoteResult(value,taskId){
  if(!plainObject(value)||value.format!==ARCA_AGENT_RESULT_FORMAT)throw new Error("resultado remoto ARCA invalido");
  if(value.taskId!==taskId)throw new Error("taskId divergente no resultado remoto");
  if(value.status!=="completed")throw new Error(`resultado remoto nao concluido: ${value.status??"<missing>"}`);
  if(value.humanReviewRequired!==true)throw new Error("resultado remoto deve exigir revisao humana");
  return jsonClone(value);
}

export function createExternalAgentClient(connection,options={}){
  const normalized=normalizeConnection(connection);const networkEnabled=options.networkEnabled===true;const fetchImpl=options.fetchImpl??globalThis.fetch;
  if(typeof fetchImpl!=="function")throw new TypeError("fetch indisponivel");
  const credentialBroker=options.credentialBroker??null;
  if(normalized.auth.mode!=="none"&&typeof credentialBroker?.authorizedFetch!=="function")throw new Error("Credential Broker obrigatorio para conexao autenticada");
  const allowedOrigins=normalizeOrigins(options.allowedOrigins??[]);const allowLoopback=options.allowLoopback===true;const timeoutMs=Number(options.timeoutMs??30000);const maxResponseBytes=Number(options.maxResponseBytes??DEFAULT_MAX_RESPONSE_BYTES);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw new RangeError("timeoutMs invalido");if(!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1024||maxResponseBytes>DEFAULT_MAX_RESPONSE_BYTES)throw new RangeError("maxResponseBytes invalido");
  const request=async(path,{method="GET",body}={})=>{
    if(!networkEnabled)throw new Error("rede para agentes externos bloqueada");assertEndpointPolicy(normalized.endpoint,{allowedOrigins,allowLoopback});
    const url=joinEndpoint(normalized.endpoint,path);const init={method,headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"manual",signal:AbortSignal.timeout(timeoutMs)};
    const response=normalized.auth.mode==="none"?await fetchImpl(url,init):await credentialBroker.authorizedFetch({auth:normalized.auth,url,init});
    if(response.status>=300&&response.status<400)throw new Error("redirect de agente externo recusado");if(!response.ok)throw new Error(`agente externo respondeu HTTP ${response.status}`);
    return readJsonResponse(response,maxResponseBytes);
  };
  return Object.freeze({connection:{endpoint:normalized.endpoint,auth:{mode:normalized.auth.mode,headerName:normalized.auth.headerName}},probe:async()=>validateRemoteDescriptor(await request("/arca/agent")),run:async task=>validateRemoteResult(await request("/arca/jobs",{method:"POST",body:normalizeTask(task)}),String(task.taskId))});
}

export class AgentGateway{
  constructor(registry,options={}){if(!(registry instanceof AgentRegistry))throw new TypeError("AgentRegistry obrigatorio");this.registry=registry;this.options={...options}}
  async dispatch(input,options={}){
    const task=normalizeTask(input);
    const allowExternal=options.allowExternal===true;
    let agent;
    if(options.targetAgentId!==undefined&&options.targetAgentId!==null){
      const targetAgentId=boundedString(options.targetAgentId,"targetAgentId",80);
      agent=this.registry.get(targetAgentId);
      if(!agent)throw new Error(`agente alvo desconhecido: ${targetAgentId}`);
      if(agent.kind==="external"&&!allowExternal)throw new Error(`agente externo alvo nao autorizado: ${targetAgentId}`);
      if(!task.requiredCapabilities.every(capability=>agent.capabilities.includes(capability)))throw new Error(`agente alvo incompativel para: ${task.requiredCapabilities.join(",")||"<sem capability>"}`);
    }else{
      agent=this.registry.select(task.requiredCapabilities,{allowExternal,preferredAgentId:options.preferredAgentId});
      if(!agent)throw new Error(`nenhum agente compativel para: ${task.requiredCapabilities.join(",")||"<sem capability>"}`);
    }
    let result;
    if(agent.kind==="internal")result=await agent.handler(task,{agent:publicDescriptor(agent)});
    else result=await createExternalAgentClient(agent.connection,{...this.options,...options.externalClient}).run(task);
    return Object.freeze({format:ARCA_AGENT_GATEWAY_RESULT_FORMAT,taskId:task.taskId,agent:publicDescriptor(agent),external:agent.kind==="external",output:jsonClone(result),humanReviewRequired:true,coreMutationPerformed:false});
  }
}

export function createArcaAgentGateway({primaryHandler,primaryCapabilities=[],externalAgents=[],clientOptions={}}={}){
  const registry=new AgentRegistry().registerInternal({id:"arca-primary",name:"ARCA Agent",provider:"arca",principal:true,priority:1000,capabilities:primaryCapabilities},primaryHandler);
  for(const agent of externalAgents)registry.registerExternal(agent);
  return new AgentGateway(registry,clientOptions);
}

export async function linkExternalAgent(registry,descriptor,options={}){
  if(!(registry instanceof AgentRegistry))throw new TypeError("AgentRegistry obrigatorio");const connection=normalizeConnection(descriptor?.connection);const client=createExternalAgentClient(connection,options);const remote=await client.probe();
  if(descriptor.id&&String(descriptor.id)!==remote.id)throw new Error("id remoto divergente do agente informado");
  const requested=uniqueCapabilities(descriptor.capabilities??remote.capabilities);for(const capability of requested)if(!remote.capabilities.includes(capability))throw new Error(`capability nao anunciada pelo agente remoto: ${capability}`);
  registry.registerExternal({...descriptor,id:remote.id,name:descriptor.name??remote.name,provider:descriptor.provider??remote.provider,capabilities:requested,connection});
  return registry.get(remote.id)?publicDescriptor(registry.get(remote.id)):null;
}
