import {buildPncpDiscoveryPlan,runPncpBoundedDiscovery} from "../../packages/pncp-connector/src/discovery.ts";

const REMOTE_MAX_TOTAL_PAGES=25;
const REMOTE_MAX_PAGES_PER_MODALITY=10;
const REMOTE_MAX_RECORDS=1000;
const REMOTE_MAX_PAGE_SIZE=200;

function positiveBounded(value,fallback,max,field){
  const n=value===undefined||value===null||value===""?fallback:Number(value);
  if(!Number.isSafeInteger(n)||n<=0||n>max)throw new RangeError(`${field} deve estar entre 1 e ${max}`);
  return n;
}

function discoveryOptions(params={}){
  return {
    maxPagesPerModality:positiveBounded(params.maxPagesPerModality,5,REMOTE_MAX_PAGES_PER_MODALITY,"maxPagesPerModality"),
    maxTotalPages:positiveBounded(params.maxTotalPages,15,REMOTE_MAX_TOTAL_PAGES,"maxTotalPages"),
    maxRecords:positiveBounded(params.maxRecords,500,REMOTE_MAX_RECORDS,"maxRecords"),
    pageSize:positiveBounded(params.pageSize,100,REMOTE_MAX_PAGE_SIZE,"pageSize")
  };
}

function scopeFromParams(params={}){
  const scope=params.scope&&typeof params.scope==="object"&&!Array.isArray(params.scope)?params.scope:params;
  return {...scope,modalidadeIds:params.modalidadeIds??scope.modalidadeIds};
}

export function runPncpDiscoveryPlanAction(params={}){
  if(params.allowNetwork===true||params.authorizePublicNetwork===true)throw new Error("pncp.discovery-plan never enables network");
  const options=discoveryOptions(params);
  return {...buildPncpDiscoveryPlan(scopeFromParams(params),options),execution:"plan-only",networkUsed:false};
}

export async function runPncpDiscoveryPublicAction(params={},context={}){
  if(params.authorizePublicNetwork!==true)throw new Error("autorizacao explicita de rede publica PNCP obrigatoria");
  const investigationId=String(params.investigationId??"").trim();
  const sourceId=String(params.sourceId??"").trim();
  if(!investigationId||investigationId.length>72)throw new TypeError("investigationId obrigatorio e limitado a 72 caracteres");
  if(!sourceId||sourceId.length>72)throw new TypeError("sourceId obrigatorio e limitado a 72 caracteres");
  if(!context.workerId||!context.custodyHome||!context.stagingRoot)throw new Error("worker PNCP sem configuracao persistente de custodia");
  const options={
    ...discoveryOptions(params),
    custodyHome:context.custodyHome,
    stagingRoot:context.stagingRoot,
    fetchImpl:context.fetchImpl,
    maxBytes:context.maxBytes,
    timeoutMs:context.timeoutMs,
    maxRetries:context.maxRetries,
    actor:{id:context.workerId,role:"authorized-pncp-public-worker"}
  };
  return runPncpBoundedDiscovery({
    ...scopeFromParams(params),
    investigationId,
    sourceId,
    authorizePublicNetwork:true
  },options);
}

export const PNCP_REMOTE_DISCOVERY_LIMITS=Object.freeze({
  maxTotalPages:REMOTE_MAX_TOTAL_PAGES,
  maxPagesPerModality:REMOTE_MAX_PAGES_PER_MODALITY,
  maxRecords:REMOTE_MAX_RECORDS,
  maxPageSize:REMOTE_MAX_PAGE_SIZE
});
