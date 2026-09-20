import {createHash} from "node:crypto";
import {buildPncpDiscoveryPlan} from "../../packages/pncp-connector/src/discovery.ts";

export const PNCP_NATIONAL_WATCH_PLAN_FORMAT="arca-pncp-national-watch-plan-v0.1";
export const PNCP_WATCH_OBSERVATION_SCHEMA="arca.pncp-watch-observation.v0.1";

export const BRAZIL_UF_CODES=Object.freeze([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
]);

const UF_SET=new Set(BRAZIL_UF_CODES);
const ACTIONABLE=new Map([
  ["POTENTIAL_INTEGRITY_RELEVANCE",{triggerKind:"AUTONOMOUS_ANOMALY",priority:70}],
  ["MATERIAL_PUBLIC_RECORD_CHANGE",{triggerKind:"PUBLIC_SOURCE_CHANGE",priority:55}],
  ["PROVENANCE_CHANGE",{triggerKind:"PUBLIC_SOURCE_CHANGE",priority:50}],
  ["SOURCE_UNAVAILABLE",{triggerKind:"PUBLIC_SOURCE_CHANGE",priority:45}]
]);

function positive(value,fallback,max,field){
  const number=value===undefined?fallback:Number(value);
  if(!Number.isSafeInteger(number)||number<1||number>max)
    throw new RangeError(`${field} must be between 1 and ${max}`);
  return number;
}

function text(value,field,max=256){
  const normalized=String(value??"").normalize("NFKC").trim();
  if(!normalized||normalized.length>max||/[\u0000-\u001f\u007f]/.test(normalized))
    throw new Error(`ARCA_PNCP_WATCH_INVALID_${field}`);
  return normalized;
}

function publicSource(value){
  const source=text(value,"SOURCE_REF",384);
  if(/^pncp:sha256:[0-9a-f]{64}$/.test(source))return source;
  let url;
  try{url=new URL(source)}catch{throw new Error("ARCA_PNCP_WATCH_SOURCE_NOT_PUBLIC")}
  if(url.protocol!=="https:"||url.hostname!=="pncp.gov.br"||url.username||url.password)
    throw new Error("ARCA_PNCP_WATCH_SOURCE_NOT_PUBLIC");
  return url.toString();
}

function jurisdiction(value){
  const ref=text(value,"JURISDICTION",32).toUpperCase();
  if(ref==="BR"||ref==="BR/NATIONAL"||ref==="BR/FEDERAL")return ref;
  const state=/^BR\/UF\/([A-Z]{2})$/.exec(ref);
  if(state&&UF_SET.has(state[1]))return ref;
  if(/^BR\/IBGE\/[0-9]{7}$/.test(ref))return ref;
  throw new Error("ARCA_PNCP_WATCH_JURISDICTION_INVALID");
}

function observedAt(value){
  const input=text(value,"OBSERVED_AT",64);
  const date=new Date(input);
  if(Number.isNaN(date.getTime())||!/^\d{4}-\d{2}-\d{2}T/.test(input))
    throw new Error("ARCA_PNCP_WATCH_OBSERVED_AT_INVALID");
  return date;
}

function recordReference(value){
  const ref=text(value,"RECORD_REF",256);
  if(!/^pncp:[A-Za-z0-9._:/-]+$/.test(ref))
    throw new Error("ARCA_PNCP_WATCH_RECORD_REF_INVALID");
  return ref;
}

export function buildPncpNationalWatchPlan(input={},options={}){
  if(input.cnpj||input.codigoMunicipioIbge||input.municipalityCode)
    throw new Error("ARCA_PNCP_NATIONAL_PLAN_LOCAL_FILTER_FORBIDDEN");
  const modalidadeIds=input.modalidadeIds??options.modalidadeIds;
  if(!Array.isArray(modalidadeIds)||modalidadeIds.length===0)
    throw new Error("ARCA_PNCP_NATIONAL_PLAN_MODALITIES_REQUIRED");
  const perShard={
    maxPagesPerModality:positive(options.maxPagesPerModality,2,10,"maxPagesPerModality"),
    maxTotalPages:positive(options.maxTotalPages,5,25,"maxTotalPages"),
    maxRecords:positive(options.maxRecords,250,1000,"maxRecords"),
    pageSize:positive(options.pageSize,100,200,"pageSize")
  };
  const maxConcurrentShards=positive(options.maxConcurrentShards,3,8,"maxConcurrentShards");
  const shards=BRAZIL_UF_CODES.map(uf=>Object.freeze({
    shardId:`BR-UF-${uf}`,
    uf,
    discovery:buildPncpDiscoveryPlan({
      dataInicial:input.dataInicial??input.startDate,
      dataFinal:input.dataFinal??input.endDate,
      uf,
      modalidadeIds
    },{...perShard,modalidadeIds})
  }));
  return Object.freeze({
    format:PNCP_NATIONAL_WATCH_PLAN_FORMAT,
    coverage:Object.freeze({
      country:"BR",
      strategy:"all-federative-units",
      ufCount:shards.length,
      ufCodes:Object.freeze([...BRAZIL_UF_CODES]),
      municipalityDefault:null
    }),
    scheduling:Object.freeze({
      order:"uf-code-lexicographic-v1",
      maxConcurrentShards
    }),
    budgets:Object.freeze({
      perShard:Object.freeze(perShard),
      maximumPagesPerCycle:perShard.maxTotalPages*shards.length,
      maximumRecordsPerCycle:perShard.maxRecords*shards.length
    }),
    shards:Object.freeze(shards),
    networkDefault:"blocked",
    networkAuthorizationRequired:"PNCP_PUBLIC_GET_ONLY",
    custodyRequiredBeforeClassification:true,
    anomalyIsNotIrregularity:true,
    humanReviewRequired:true
  });
}

export function createPncpNationalInvestigationIngress({investigationRuntime}={}){
  if(!investigationRuntime||typeof investigationRuntime.request!=="function")
    throw new Error("ARCA_PNCP_WATCH_RUNTIME_REQUIRED");

  return Object.freeze({
    schema:"arca.pncp-national-investigation-ingress.v0.1",

    async ingest(observation={}){
      if(observation.schema!==PNCP_WATCH_OBSERVATION_SCHEMA)
        throw new Error("ARCA_PNCP_WATCH_OBSERVATION_SCHEMA_INVALID");
      const action=ACTIONABLE.get(observation.category);
      if(!action)throw new Error("ARCA_PNCP_WATCH_CATEGORY_NOT_ACTIONABLE");
      if(observation.humanReviewRequired!==true||observation.anomalyIsNotIrregularity!==true)
        throw new Error("ARCA_PNCP_WATCH_SAFETY_ASSERTIONS_REQUIRED");

      const recordRef=recordReference(observation.recordRef);
      const jurisdictionRef=jurisdiction(observation.jurisdictionRef);
      const sourceRef=publicSource(observation.sourceRef);
      const timestamp=observedAt(observation.observedAt);
      const timeWindow=`${timestamp.getUTCFullYear()}-${String(timestamp.getUTCMonth()+1).padStart(2,"0")}`;
      const priority=observation.priority===undefined
        ?action.priority
        :positive(observation.priority,action.priority,100,"priority");
      const observationId=createHash("sha256").update(JSON.stringify({
        category:observation.category,
        recordRef,
        jurisdictionRef,
        sourceRef
      })).digest("hex");

      const result=await investigationRuntime.request({
        scope:{
          jurisdiction:jurisdictionRef,
          subjectRef:recordRef,
          topic:"pncp-public-procurement-review",
          timeWindow,
          sourceScopes:["pncp-public"]
        },
        triggerKind:action.triggerKind,
        triggerRef:`pncp-watch:${observationId}`,
        priority
      });
      return {
        schema:"arca.pncp-watch-ingress-result.v0.1",
        observationId,
        investigationId:result.record.investigationId,
        created:result.created,
        awakened:result.awakened,
        state:result.record.state,
        humanReviewRequired:true,
        deliveryEvents:result.events
      };
    }
  });
}
