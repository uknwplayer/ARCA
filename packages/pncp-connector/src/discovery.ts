import {createHash} from "node:crypto";
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  capturePncpResponse,
  decodePncpJsonResponse
} from "./index.ts";

export const PNCP_CONSULTA_BASE_URL="https://pncp.gov.br/api/consulta";
export const PNCP_DISCOVERY_FORMAT="arca-pncp-discovery-result-v2";
export const DEFAULT_DISCOVERY_MAX_INTERVAL_DAYS=31;
export const DEFAULT_DISCOVERY_MAX_PAGES_PER_MODALITY=10;
export const DEFAULT_DISCOVERY_MAX_TOTAL_PAGES=100;
export const DEFAULT_DISCOVERY_MAX_RECORDS=5000;
export const DEFAULT_DISCOVERY_PAGE_SIZE=100;

const ALLOWED_QUERY_KEYS=new Set([
  "dataInicial","dataFinal","codigoModalidadeContratacao","uf","codigoMunicipioIbge","cnpj","pagina","tamanhoPagina"
]);

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function positiveInteger(value,field,max=Number.MAX_SAFE_INTEGER){const n=typeof value==="number"?value:Number(String(value??""));if(!Number.isSafeInteger(n)||n<=0||n>max)throw new TypeError(`${field} deve ser inteiro positivo ate ${max}`);return n}
function optionalCnpj(value){if(value===undefined||value===null||value==="")return null;const normalized=String(value).normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]+/g,"");if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(normalized))throw new TypeError("CNPJ deve conter 12 caracteres alfanumericos e 2 digitos verificadores");return normalized}
function yyyymmdd(value,field){const text=String(value??"");if(!/^\d{8}$/.test(text))throw new TypeError(`${field} deve usar AAAAMMDD`);const year=Number(text.slice(0,4)),month=Number(text.slice(4,6)),day=Number(text.slice(6,8));const date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new TypeError(`${field} invalida`);return {text,date}}
function municipalityCode(value){if(value===undefined||value===null||value==="")return null;const text=String(value).trim();if(!/^\d{7}$/.test(text))throw new TypeError("codigoMunicipioIbge deve conter 7 digitos");return text}
function ufCode(value){if(value===undefined||value===null||value==="")return null;const text=String(value).trim().toUpperCase();if(!/^[A-Z]{2}$/.test(text))throw new TypeError("uf deve conter 2 letras");return text}
function uniquePositiveIntegers(values,field){if(!Array.isArray(values)||values.length===0)throw new TypeError(`${field} deve ser array nao vazio`);return [...new Set(values.map(value=>positiveInteger(value,field,10000)))].sort((a,b)=>a-b)}

export function validatePncpDiscoveryScope(input,options={}){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new TypeError("escopo de descoberta PNCP invalido");
  const start=yyyymmdd(input.dataInicial??input.startDate,"dataInicial");
  const end=yyyymmdd(input.dataFinal??input.endDate,"dataFinal");
  if(end.date<start.date)throw new RangeError("dataFinal deve ser igual ou posterior a dataInicial");
  const maxIntervalDays=options.maxIntervalDays??DEFAULT_DISCOVERY_MAX_INTERVAL_DAYS;
  const inclusiveDays=Math.floor((end.date.getTime()-start.date.getTime())/86_400_000)+1;
  if(inclusiveDays>maxIntervalDays)throw new RangeError(`intervalo excede limite operacional de ${maxIntervalDays} dias`);
  const cnpj=optionalCnpj(input.cnpj);
  const codigoMunicipioIbge=municipalityCode(input.codigoMunicipioIbge??input.municipalityCode);
  const uf=ufCode(input.uf);
  if(!cnpj&&!codigoMunicipioIbge&&!uf)throw new TypeError("descoberta exige ao menos cnpj, codigoMunicipioIbge ou uf para limitar o universo");
  return {cnpj,codigoMunicipioIbge,uf,dataInicial:start.text,dataFinal:end.text,inclusiveDays};
}

export function buildPncpConsultaUrl(path,query,baseUrl=PNCP_CONSULTA_BASE_URL){
  const base=new URL(baseUrl.endsWith("/")?baseUrl:`${baseUrl}/`);
  if(base.origin!=="https://pncp.gov.br"||base.pathname.replace(/\/$/,"")!=="/api/consulta")throw new Error("baseUrl de consulta PNCP fora da allowlist");
  if(path!=="/v1/contratacoes/publicacao")throw new Error("endpoint de descoberta PNCP nao allowlisted");
  const url=new URL(`${base.origin}/api/consulta${path}`);
  for(const [key,value] of Object.entries(query??{})){
    if(!ALLOWED_QUERY_KEYS.has(key))throw new Error(`parametro de consulta PNCP nao allowlisted: ${key}`);
    if(value!==undefined&&value!==null&&value!=="")url.searchParams.set(key,String(value));
  }
  if(url.origin!=="https://pncp.gov.br"||url.pathname!=="/api/consulta/v1/contratacoes/publicacao")throw new Error("URL de consulta PNCP escapou da allowlist");
  return url.toString();
}

async function readLimitedBody(response,maxBytes){
  const length=response?.headers?.get?.("content-length");
  if(length&&Number(length)>maxBytes)throw new RangeError(`resposta PNCP consulta excede ${maxBytes} bytes`);
  if(!response.body)return new Uint8Array();
  const chunks=[];let total=0;
  for await(const raw of response.body){const chunk=raw instanceof Uint8Array?raw:new Uint8Array(raw);total+=chunk.byteLength;if(total>maxBytes){try{await response.body.cancel?.()}catch{}throw new RangeError(`resposta PNCP consulta excede ${maxBytes} bytes`)}chunks.push(chunk)}
  const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength}return output;
}

export function createPncpConsultaHttpTransport(options={}){
  const allowNetwork=options.allowNetwork===true;
  const fetchImpl=options.fetchImpl??globalThis.fetch;
  if(typeof fetchImpl!=="function")throw new TypeError("fetch indisponivel");
  const maxBytes=options.maxBytes??DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutMs=options.timeoutMs??15000;
  const maxRetries=options.maxRetries??2;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||maxBytes>DEFAULT_MAX_RESPONSE_BYTES)throw new RangeError("maxBytes invalido");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||timeoutMs>60000)throw new RangeError("timeoutMs invalido");
  if(!Number.isSafeInteger(maxRetries)||maxRetries<0||maxRetries>5)throw new RangeError("maxRetries invalido");
  return {kind:"pncp-public-consulta-http-v2",networkEnabled:allowNetwork,async get(descriptor){
    if(!allowNetwork)throw new Error("rede PNCP consulta bloqueada");
    if(!descriptor||descriptor.method!=="GET"||descriptor.publicAccess!==true||descriptor.authenticationRequired!==false)throw new Error("consulta PNCP aceita somente GET publico sem autenticacao");
    const url=buildPncpConsultaUrl(descriptor.path,descriptor.query,descriptor.baseUrl??PNCP_CONSULTA_BASE_URL);
    let lastError=null;
    for(let attempt=0;attempt<=maxRetries;attempt+=1){
      try{
        const response=await fetchImpl(url,{method:"GET",headers:{Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(timeoutMs)});
        if((response.status===429||response.status>=500)&&response.status<=599&&attempt<maxRetries){await new Promise(r=>setTimeout(r,Math.min(250*(2**attempt),2000)));continue}
        const bytes=await readLimitedBody(response,maxBytes);
        return {resourceKind:descriptor.kind,url,method:"GET",status:response.status,ok:response.status>=200&&response.status<300,contentType:response.headers?.get?.("content-type")??"application/octet-stream",accessedAt:new Date().toISOString(),bytes,sha256:sha256(bytes),attemptCount:attempt+1};
      }catch(error){lastError=error;if(attempt>=maxRetries)throw error;await new Promise(r=>setTimeout(r,Math.min(250*(2**attempt),2000)))}
    }
    throw lastError??new Error("falha de transporte PNCP consulta");
  }};
}

export function createPncpConsultaFixtureTransport(fixtures){
  if(!fixtures||typeof fixtures!=="object")throw new TypeError("fixtures invalidas");
  return {kind:"pncp-consulta-fixture-v2",networkEnabled:false,async get(descriptor){const fixture=fixtures[descriptor.kind];const text=fixture===undefined?"{}":typeof fixture==="string"?fixture:JSON.stringify(fixture);const bytes=new TextEncoder().encode(text);return {resourceKind:descriptor.kind,url:`fixture://${descriptor.kind}`,method:"GET",status:fixture===undefined?404:200,ok:fixture!==undefined,contentType:"application/json",accessedAt:"2026-01-01T00:00:00.000Z",bytes,sha256:sha256(bytes),attemptCount:1}}};
}

function discoveryDescriptor(scope,modalidadeId,page,pageSize){
  return {kind:`discovery-modality-${modalidadeId}-page-${page}`,method:"GET",path:"/v1/contratacoes/publicacao",baseUrl:PNCP_CONSULTA_BASE_URL,query:{dataInicial:scope.dataInicial,dataFinal:scope.dataFinal,codigoModalidadeContratacao:modalidadeId,uf:scope.uf,codigoMunicipioIbge:scope.codigoMunicipioIbge,cnpj:scope.cnpj,pagina:page,tamanhoPagina:pageSize},required:true,publicAccess:true,authenticationRequired:false};
}

export function buildPncpDiscoveryPlan(input,options={}){
  const scope=validatePncpDiscoveryScope(input,options);
  const modalidadeIds=uniquePositiveIntegers(options.modalidadeIds??input.modalidadeIds,"modalidadeIds");
  const maxPagesPerModality=positiveInteger(options.maxPagesPerModality??input.maxPagesPerModality??DEFAULT_DISCOVERY_MAX_PAGES_PER_MODALITY,"maxPagesPerModality",100);
  const maxTotalPages=positiveInteger(options.maxTotalPages??input.maxTotalPages??DEFAULT_DISCOVERY_MAX_TOTAL_PAGES,"maxTotalPages",1000);
  const maxRecords=positiveInteger(options.maxRecords??input.maxRecords??DEFAULT_DISCOVERY_MAX_RECORDS,"maxRecords",100000);
  const pageSize=positiveInteger(options.pageSize??input.pageSize??DEFAULT_DISCOVERY_PAGE_SIZE,"pageSize",500);
  return {format:"arca-pncp-discovery-plan-v2",scope,modalidadeIds,budgets:{maxPagesPerModality,maxTotalPages,maxRecords,pageSize},firstPageRequests:modalidadeIds.map(id=>discoveryDescriptor(scope,id,1,pageSize)),networkDefault:"blocked",custodyRequiredBeforeParsing:true,humanReviewRequired:true};
}

function listFromPage(value){if(Array.isArray(value))return value;for(const key of ["data","items","content","contratacoes"])if(Array.isArray(value?.[key]))return value[key];return []}
function paginationFromPage(value,currentPage){const totalRaw=value?.totalPaginas??value?.totalPages??value?.total_paginas;const remainingRaw=value?.paginasRestantes??value?.remainingPages??value?.paginas_restantes;const totalPages=Number.isSafeInteger(Number(totalRaw))&&Number(totalRaw)>=0?Number(totalRaw):null;const remainingPages=Number.isSafeInteger(Number(remainingRaw))&&Number(remainingRaw)>=0?Number(remainingRaw):null;return {currentPage,totalPages,remainingPages}}
function targetFromRecord(record){
  const control=String(record?.numeroControlePNCP??record?.numeroControlePncp??"").trim().toUpperCase();
  const match=/^([A-Z0-9]{14})-\d+-(\d+)\/(\d{4})$/.exec(control);
  const cnpj=String(record?.orgaoEntidade?.cnpj??record?.cnpjOrgao??record?.cnpj??match?.[1]??"").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]+/g,"");
  const ano=Number(record?.anoCompra??record?.anoContratacao??match?.[3]);
  const sequencial=Number(record?.sequencialCompra??record?.sequencial??match?.[2]);
  if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)||!Number.isSafeInteger(ano)||ano<=0||!Number.isSafeInteger(sequencial)||sequencial<=0)return null;
  return {procurementControlNumber:control||null,cnpj,ano,sequencial,objectDescription:record?.objetoCompra??record?.objeto??null,modalityId:record?.modalidadeId??record?.modalidadeContratacaoId??null,modalityName:record?.modalidadeNome??record?.modalidadeContratacaoNome??null,publishedAt:record?.dataPublicacaoPncp??record?.dataPublicacaoPNCP??null,estimatedValue:record?.valorTotalEstimado??null};
}

export async function runPncpBoundedDiscovery(input,options={}){
  const plan=buildPncpDiscoveryPlan(input,options);
  const transport=options.transport??createPncpConsultaHttpTransport({allowNetwork:input?.authorizePublicNetwork===true,fetchImpl:options.fetchImpl,maxBytes:options.maxBytes,timeoutMs:options.timeoutMs,maxRetries:options.maxRetries});
  if(transport.networkEnabled===true&&input?.authorizePublicNetwork!==true)throw new Error("autorizacao explicita de rede publica PNCP obrigatoria");
  const investigationId=String(input?.investigationId??"").trim();const sourceId=String(input?.sourceId??"").trim();const actor=options.actor??input?.actor;
  if(!investigationId||!sourceId||!actor?.id)throw new TypeError("contexto de custodia da descoberta incompleto");
  if(!options.custodyHome&&!input?.custodyHome)throw new TypeError("custodyHome obrigatorio");
  if(!options.stagingRoot&&!input?.stagingRoot)throw new TypeError("stagingRoot obrigatorio");
  const custodyHome=options.custodyHome??input.custodyHome;const stagingRoot=options.stagingRoot??input.stagingRoot;
  const targets=new Map();const pages=[];let pageRequests=0,pagesCaptured=0,rawRecordsSeen=0,stoppedBy="complete";
  outer:for(const modalidadeId of plan.modalidadeIds){
    for(let page=1;page<=plan.budgets.maxPagesPerModality;page+=1){
      if(pageRequests>=plan.budgets.maxTotalPages){stoppedBy="max-total-pages";break outer}
      if(rawRecordsSeen>=plan.budgets.maxRecords){stoppedBy="max-records";break outer}
      const descriptor=discoveryDescriptor(plan.scope,modalidadeId,page,plan.budgets.pageSize);pageRequests+=1;
      const response=await transport.get(descriptor);
      if(!response.ok)throw new Error(`pagina de descoberta PNCP falhou: ${descriptor.kind} HTTP ${response.status}`);
      const captured=await capturePncpResponse({response,investigationId,sourceId,actor,stagingRoot,custodyHome,title:`PNCP descoberta modalidade ${modalidadeId} pagina ${page}`});
      pagesCaptured+=1;
      pages.push({kind:descriptor.kind,url:response.url,status:response.status,sha256:response.sha256,byteLength:response.bytes?.byteLength??0,acquisitionId:captured.manifest.acquisitionId,proposal:captured.proposal});
      let payload={};let records=[];
      if(response.status!==204&&response.bytes?.byteLength){payload=decodePncpJsonResponse(response);records=listFromPage(payload)}
      rawRecordsSeen+=records.length;
      for(const record of records){const target=targetFromRecord(record);if(!target)continue;const key=`${target.cnpj}/${target.ano}/${target.sequencial}`;if(!targets.has(key))targets.set(key,target)}
      if(rawRecordsSeen>=plan.budgets.maxRecords){stoppedBy="max-records";break outer}
      const pagination=paginationFromPage(payload,page);
      const more=pagination.totalPages!==null?page<pagination.totalPages:pagination.remainingPages!==null?pagination.remainingPages>0:records.length===plan.budgets.pageSize;
      if(!more)break;
    }
  }
  return {format:PNCP_DISCOVERY_FORMAT,scope:plan.scope,modalidadeIds:plan.modalidadeIds,budgets:plan.budgets,targets:[...targets.values()],pages,stats:{pageRequests,pagesCaptured,rawRecordsSeen,uniqueTargets:targets.size,stoppedBy},invariants:{custodyBeforeParsing:true,publicGetOnly:true,coreMutationPerformed:false,humanReviewRequired:true},networkUsed:transport.networkEnabled===true,humanReviewRequired:true};
}
