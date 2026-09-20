import {createHash,randomBytes} from "node:crypto";
import {mkdir,open,rm} from "node:fs/promises";
import {join,resolve} from "node:path";
import {captureFile} from "../../acquisition/src/index.ts";

export const PNCP_CONNECTOR_VERSION="0.4.0-v3-c1";
export const PNCP_PRODUCTION_BASE_URL="https://pncp.gov.br/api/pncp";
export const PNCP_ALLOWED_ORIGIN="https://pncp.gov.br";
export const PNCP_ALLOWED_BASE_PATH="/api/pncp";
export const DEFAULT_MAX_RESPONSE_BYTES=5*1024*1024;
export const DEFAULT_TIMEOUT_MS=15000;
export const DEFAULT_MAX_RETRIES=2;

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function normalizeCnpj(value){
  const normalized=String(value??"").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]+/g,"");
  if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(normalized))throw new TypeError("CNPJ deve conter 12 caracteres alfanumericos e 2 digitos verificadores");
  return normalized;
}
function positiveInteger(value,field){
  const parsed=typeof value==="number"?value:Number(String(value??""));
  if(!Number.isSafeInteger(parsed)||parsed<=0)throw new TypeError(`${field} deve ser inteiro positivo`);
  return parsed;
}
function cleanResourceKey(value){return String(value??"resource").normalize("NFKC").replace(/[^A-Za-z0-9._-]/g,"-").slice(0,120)||"resource"}

export function validatePncpPublicTarget(input){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new TypeError("target PNCP invalido");
  return {cnpj:normalizeCnpj(input.cnpj),ano:positiveInteger(input.ano,"ano"),sequencial:positiveInteger(input.sequencial,"sequencial")};
}

export function buildPncpPublicUrl(path,baseUrl=PNCP_PRODUCTION_BASE_URL){
  const base=new URL(baseUrl.endsWith("/")?baseUrl:`${baseUrl}/`);
  if(base.origin!==PNCP_ALLOWED_ORIGIN||base.pathname.replace(/\/$/,"")!==PNCP_ALLOWED_BASE_PATH)throw new Error("baseUrl PNCP fora da allowlist");
  if(typeof path!=="string"||!path.startsWith("/v1/"))throw new TypeError("path PNCP deve iniciar em /v1/");
  if(path.includes("..")||path.includes("\\")||path.includes("?")||path.includes("#"))throw new Error("path PNCP inseguro");
  const url=new URL(`${PNCP_ALLOWED_BASE_PATH}${path}`,PNCP_ALLOWED_ORIGIN);
  if(url.origin!==PNCP_ALLOWED_ORIGIN||!url.pathname.startsWith(`${PNCP_ALLOWED_BASE_PATH}/v1/`))throw new Error("URL PNCP escapou da allowlist");
  return url.toString();
}

function request(kind,path,{required=true}={}){
  return Object.freeze({kind,method:"GET",path,baseUrl:PNCP_PRODUCTION_BASE_URL,required,publicAccess:true,authenticationRequired:false});
}

export function buildPncpProcurementRequestPlan(input,options={}){
  const target=validatePncpPublicTarget(input);
  const root=`/v1/orgaos/${target.cnpj}/compras/${target.ano}/${target.sequencial}`;
  const requests=[
    request("contratacao",root),
    request("itens",`${root}/itens`),
    request("contratos",`/v1/orgaos/${target.cnpj}/contratos/contratacao/${target.ano}/${target.sequencial}`,{required:false})
  ];
  if(options.includeBudgetSources!==false)requests.push(request("fontes-orcamentarias",`${root}/fonte-orcamentaria`,{required:false}));
  return {
    format:"arca-pncp-request-plan-v1",
    connectorVersion:PNCP_CONNECTOR_VERSION,
    target,
    baseUrl:PNCP_PRODUCTION_BASE_URL,
    requests,
    networkAllowedByPlan:false,
    humanAuthorizationRequiredForNetwork:true,
    publicGetOnly:true
  };
}

export function buildPncpItemResultRequests(input,items){
  const target=validatePncpPublicTarget(input);
  if(!Array.isArray(items))throw new TypeError("items deve ser array");
  const root=`/v1/orgaos/${target.cnpj}/compras/${target.ano}/${target.sequencial}/itens`;
  return items.map((item,index)=>{
    const number=positiveInteger(item?.numeroItem??item?.itemNumber??index+1,"numeroItem");
    return request(`resultados-item-${number}`,`${root}/${number}/resultados`,{required:false});
  });
}

function headerValue(headers,name){
  if(!headers)return null;
  if(typeof headers.get==="function")return headers.get(name);
  const direct=headers[name]??headers[name.toLowerCase()]??headers[name.toUpperCase()];
  return direct===undefined?null:String(direct);
}
async function readLimitedBody(response,maxBytes){
  const lengthHeader=headerValue(response.headers,"content-length");
  if(lengthHeader&&Number(lengthHeader)>maxBytes)throw new RangeError(`resposta PNCP excede ${maxBytes} bytes`);
  if(!response.body)return new Uint8Array();
  const chunks=[];let total=0;
  for await(const raw of response.body){
    const chunk=raw instanceof Uint8Array?raw:new Uint8Array(raw);
    total+=chunk.byteLength;
    if(total>maxBytes){try{await response.body.cancel?.()}catch{}throw new RangeError(`resposta PNCP excede ${maxBytes} bytes`)}
    chunks.push(chunk);
  }
  const output=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength}
  return output;
}
function retryable(status){return status===429||(status>=500&&status<=599)}
const wait=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));

export function createPncpHttpTransport(options={}){
  const allowNetwork=options.allowNetwork===true;
  const fetchImpl=options.fetchImpl??globalThis.fetch;
  if(typeof fetchImpl!=="function")throw new TypeError("fetch indisponivel");
  const maxBytes=options.maxBytes??DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutMs=options.timeoutMs??DEFAULT_TIMEOUT_MS;
  const maxRetries=options.maxRetries??DEFAULT_MAX_RETRIES;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw new RangeError("maxBytes invalido");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new RangeError("timeoutMs invalido");
  if(!Number.isSafeInteger(maxRetries)||maxRetries<0||maxRetries>5)throw new RangeError("maxRetries invalido");
  return {
    kind:"pncp-public-http-v1",
    networkEnabled:allowNetwork,
    async get(descriptor){
      if(!allowNetwork)throw new Error("rede PNCP bloqueada: use allowNetwork=true de forma explicita");
      if(!descriptor||descriptor.method!=="GET"||descriptor.publicAccess!==true||descriptor.authenticationRequired!==false)throw new Error("conector PNCP aceita somente consulta publica GET sem autenticacao");
      const url=buildPncpPublicUrl(descriptor.path,descriptor.baseUrl??PNCP_PRODUCTION_BASE_URL);
      let lastError=null;
      for(let attempt=0;attempt<=maxRetries;attempt+=1){
        try{
          const response=await fetchImpl(url,{method:"GET",headers:{Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(timeoutMs)});
          if(retryable(response.status)&&attempt<maxRetries){await wait(Math.min(250*(2**attempt),2000));continue}
          const bytes=await readLimitedBody(response,maxBytes);
          return {resourceKind:descriptor.kind,url,method:"GET",status:response.status,ok:response.status>=200&&response.status<300,contentType:headerValue(response.headers,"content-type")??"application/octet-stream",accessedAt:new Date().toISOString(),bytes,sha256:sha256(bytes),attemptCount:attempt+1};
        }catch(error){lastError=error;if(attempt>=maxRetries)throw error;await wait(Math.min(250*(2**attempt),2000))}
      }
      throw lastError??new Error("falha de transporte PNCP");
    }
  };
}

export function createFixtureTransport(fixtures){
  if(!fixtures||typeof fixtures!=="object")throw new TypeError("fixtures invalidas");
  return {kind:"pncp-fixture-transport-v1",networkEnabled:false,async get(descriptor){
    const fixture=fixtures[descriptor.kind];
    if(fixture===undefined){const bytes=new TextEncoder().encode("{}");return {resourceKind:descriptor.kind,url:`fixture://${descriptor.kind}`,method:"GET",status:404,ok:false,contentType:"application/json",accessedAt:"2026-01-01T00:00:00.000Z",bytes,sha256:sha256(bytes),attemptCount:1}}
    const text=typeof fixture==="string"?fixture:JSON.stringify(fixture);const bytes=new TextEncoder().encode(text);
    return {resourceKind:descriptor.kind,url:`fixture://${descriptor.kind}`,method:"GET",status:200,ok:true,contentType:"application/json",accessedAt:"2026-01-01T00:00:00.000Z",bytes,sha256:sha256(bytes),attemptCount:1};
  }};
}

export function decodePncpJsonResponse(response){
  if(!response?.ok)throw new Error(`resposta PNCP nao bem sucedida: ${response?.status??"unknown"}`);
  const type=String(response.contentType??"").toLowerCase();
  if(!type.includes("json")&&!String(response.url??"").startsWith("fixture://"))throw new TypeError(`resposta PNCP nao JSON: ${type||"sem content-type"}`);
  try{return JSON.parse(new TextDecoder().decode(response.bytes))}catch{throw new Error("resposta PNCP contem JSON invalido")}
}
function unwrapList(value,keys=[]){if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value?.[key]))return value[key];return []}
function noContent(response){return response?.status===204||response?.bytes?.byteLength===0}

export async function executePncpRequestPlan(plan,{transport}){
  if(!plan||plan.format!=="arca-pncp-request-plan-v1")throw new TypeError("plano PNCP invalido");
  if(!transport||typeof transport.get!=="function")throw new TypeError("transport.get obrigatorio");
  const responses=[];
  for(const descriptor of plan.requests){const response=await transport.get(descriptor);if(!response.ok&&descriptor.required)throw new Error(`recurso PNCP obrigatorio falhou: ${descriptor.kind} HTTP ${response.status}`);responses.push({descriptor,response})}
  return responses;
}

export async function collectPncpSnapshot(input,options={}){
  const target=validatePncpPublicTarget(input);
  const plan=buildPncpProcurementRequestPlan(target,options);
  const transport=options.transport??createPncpHttpTransport({allowNetwork:options.allowNetwork===true,maxBytes:options.maxBytes,timeoutMs:options.timeoutMs,maxRetries:options.maxRetries});
  const baseResponses=await executePncpRequestPlan(plan,{transport});
  const byKind=new Map(baseResponses.map(entry=>[entry.descriptor.kind,entry]));
  const requiredJson=kind=>{const response=byKind.get(kind)?.response;if(noContent(response)){if(kind==="itens")return [];throw new Error(`recurso PNCP obrigatorio sem conteudo: ${kind} HTTP ${response?.status??"unknown"}`)}return decodePncpJsonResponse(response)};
  const optionalJson=kind=>{const response=byKind.get(kind)?.response;if(!response?.ok||noContent(response))return null;return decodePncpJsonResponse(response)};
  const contratacao=requiredJson("contratacao");
  const itens=unwrapList(requiredJson("itens"),["itens","data","content"]);
  const resultResponses=[];
  for(const descriptor of buildPncpItemResultRequests(target,itens)){resultResponses.push({descriptor,response:await transport.get(descriptor)})}
  const resultados=resultResponses.flatMap(({response})=>response.ok&&!noContent(response)?unwrapList(decodePncpJsonResponse(response),["listaResultados","resultados","data","content"]):[]);
  const contratos=unwrapList(optionalJson("contratos"),["contratos","data","content"]);
  const fontesOrcamentarias=unwrapList(optionalJson("fontes-orcamentarias"),["fonteOrcamentaria","fontesOrcamentarias","data","content"]);
  const responses=[...baseResponses,...resultResponses];
  return {format:"arca-pncp-public-snapshot-v1",target,retrievedAt:responses.map(entry=>entry.response.accessedAt).sort().at(-1)??null,bundle:{contratacao,itens,resultados,contratos,fontesOrcamentarias},responses,publicAccessOnly:true,networkUsed:transport.networkEnabled===true};
}

async function writeStagingFile(root,name,bytes){await mkdir(root,{recursive:true,mode:0o700});const path=join(root,name);const handle=await open(path,"wx",0o600);try{await handle.writeFile(bytes);await handle.sync()}finally{await handle.close()}return path}
function acquisitionIdFor(response,investigationId){const digest=sha256(`${investigationId}\n${response.resourceKind}\n${response.url}\n${response.accessedAt}\n${response.sha256}`).slice(0,12).toUpperCase();return `ACQ-PNCP-${digest}`}

export async function capturePncpResponse(input){
  const response=input?.response;
  if(!response?.bytes||!response?.url||!response?.resourceKind)throw new TypeError("response PNCP invalida");
  if(!input.investigationId||!input.sourceId||!input.actor)throw new TypeError("contexto de custodia incompleto");
  const stagingRoot=resolve(input.stagingRoot);const nonce=randomBytes(5).toString("hex");const stagingPath=await writeStagingFile(stagingRoot,`${cleanResourceKey(response.resourceKind)}-${nonce}.json`,response.bytes);const acquisitionId=input.acquisitionId??acquisitionIdFor(response,input.investigationId);
  try{
    const captured=await captureFile({format:"arca-acquisition-request-v1",acquisitionId,investigationId:input.investigationId,sourceId:input.sourceId,title:input.title??`PNCP ${response.resourceKind}`,sourcePath:stagingPath,locator:response.url,accessedAt:response.accessedAt,acquisitionMethod:"authorized-download",access:{basis:"public",declaration:"Consulta publica ao PNCP, sem autenticacao e sem contorno de controle de acesso."},mediaType:response.contentType||"application/json",expectedEventHead:input.expectedEventHead??null,actor:input.actor},{home:input.custodyHome,allowedRoot:stagingRoot,maxBytes:input.maxBytes??DEFAULT_MAX_RESPONSE_BYTES});
    if(captured.manifest?.original?.originalSha256!==response.sha256)throw new Error("hash preservado diverge dos bytes recebidos do PNCP");
    return captured;
  }finally{if(input.keepStaging!==true)await rm(stagingPath,{force:true})}
}

export async function capturePncpSnapshotResponses(snapshot,input){
  if(!snapshot||snapshot.format!=="arca-pncp-public-snapshot-v1")throw new TypeError("snapshot PNCP invalido");
  const captures=[];
  for(const {descriptor,response} of snapshot.responses){if(!response.ok)continue;captures.push(await capturePncpResponse({...input,response,title:`PNCP ${descriptor.kind}`}))}
  const successful=snapshot.responses.filter(entry=>entry.response.ok).length;
  return {snapshotFormat:snapshot.format,target:snapshot.target,captures,capturedCount:captures.length,analysisMayProceed:captures.length===successful};
}
