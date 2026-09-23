import {createHash} from "node:crypto";

export const PUBLIC_SOURCE_REGISTRY_SCHEMA="arca.public-source-registry.v1";
export const PUBLIC_SOURCE_ADAPTER_SCHEMA="arca.public-source-adapter.v1";
export const EVIDENCE_ENVELOPE_SCHEMA="arca.evidence-envelope.v1";

const SOURCE_STATUSES=new Set(["ACTIVE","DECLARED_ONLY","SUSPENDED"]);
const EXECUTION_MODES=new Set(["OFFLINE_FIXTURE","PUBLIC_GET","BULK_DOWNLOAD"]);
const UF_CODES=new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
]);

function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])]));
  return value;
}

export function canonicalJson(value){return JSON.stringify(canonicalize(value))}
export function sha256(value){return createHash("sha256").update(typeof value==="string"?value:canonicalJson(value)).digest("hex")}

function text(value,field,max=512){
  const normalized=String(value??"").normalize("NFKC").trim();
  if(!normalized||normalized.length>max||/[\u0000-\u001f\u007f]/.test(normalized))
    throw new Error(`ARCA_PUBLIC_SOURCE_INVALID_${field}`);
  return normalized;
}

function safeId(value,field="ID"){
  const id=text(value,field,160);
  if(!/^[a-z0-9][a-z0-9._:-]*$/.test(id))throw new Error(`ARCA_PUBLIC_SOURCE_INVALID_${field}`);
  return id;
}

function httpsUrl(value,field){
  let url;
  try{url=new URL(text(value,field,1024))}catch{throw new Error(`ARCA_PUBLIC_SOURCE_INVALID_${field}`)}
  if(url.protocol!=="https:"||url.username||url.password)throw new Error(`ARCA_PUBLIC_SOURCE_INVALID_${field}`);
  return url;
}

function stringArray(value,field,{allowEmpty=false}={}){
  if(!Array.isArray(value)||(!allowEmpty&&value.length===0))throw new Error(`ARCA_PUBLIC_SOURCE_INVALID_${field}`);
  return [...new Set(value.map(item=>text(item,field,160)))].sort();
}

export function validateSourceDescriptor(input={}){
  const id=safeId(input.id,"SOURCE_ID");
  const canonicalPublicUrl=httpsUrl(input.canonicalPublicUrl,"CANONICAL_URL");
  const allowedOrigins=stringArray(input.allowedOrigins,"ALLOWED_ORIGINS").map(origin=>httpsUrl(origin,"ALLOWED_ORIGIN").origin);
  if(!allowedOrigins.includes(canonicalPublicUrl.origin))throw new Error("ARCA_PUBLIC_SOURCE_CANONICAL_ORIGIN_NOT_ALLOWED");
  const adapterStatus=text(input.adapterStatus,"ADAPTER_STATUS",32);
  if(!SOURCE_STATUSES.has(adapterStatus))throw new Error("ARCA_PUBLIC_SOURCE_INVALID_ADAPTER_STATUS");
  const executableModes=stringArray(input.executableModes??[],"EXECUTION_MODES",{allowEmpty:true});
  if(executableModes.some(mode=>!EXECUTION_MODES.has(mode)))throw new Error("ARCA_PUBLIC_SOURCE_INVALID_EXECUTION_MODE");
  if(adapterStatus!=="ACTIVE"&&executableModes.length)throw new Error("ARCA_PUBLIC_SOURCE_DECLARED_ONLY_CANNOT_EXECUTE");
  if(input.publicAccess!==true)throw new Error("ARCA_PUBLIC_SOURCE_PUBLIC_ACCESS_REQUIRED");
  const coverage=input.coverage;
  if(!coverage||typeof coverage!=="object"||Array.isArray(coverage))throw new Error("ARCA_PUBLIC_SOURCE_COVERAGE_REQUIRED");
  const levels=stringArray(coverage.levels,"COVERAGE_LEVELS");
  return Object.freeze({
    schema:PUBLIC_SOURCE_ADAPTER_SCHEMA,
    id,
    publisher:text(input.publisher,"PUBLISHER",240),
    sourceClass:safeId(input.sourceClass,"SOURCE_CLASS"),
    accessMethod:safeId(input.accessMethod,"ACCESS_METHOD"),
    canonicalPublicUrl:canonicalPublicUrl.toString(),
    allowedOrigins:Object.freeze(allowedOrigins),
    formats:Object.freeze(stringArray(input.formats,"FORMATS")),
    publicAccess:true,
    coverage:Object.freeze({country:"BR",levels:Object.freeze(levels),municipalityDefault:null}),
    temporalCoverage:Object.freeze({...input.temporalCoverage}),
    adapterStatus,
    executableModes:Object.freeze(executableModes),
    updateProfile:text(input.updateProfile,"UPDATE_PROFILE",120),
    limitations:Object.freeze(stringArray(input.limitations,"LIMITATIONS"))
  });
}

export function createPublicSourceRegistry(document={}){
  if(document.schema!==PUBLIC_SOURCE_REGISTRY_SCHEMA||!Array.isArray(document.sources))
    throw new Error("ARCA_PUBLIC_SOURCE_REGISTRY_SCHEMA_INVALID");
  const sources=document.sources.map(validateSourceDescriptor);
  const ids=sources.map(source=>source.id);
  if(new Set(ids).size!==ids.length)throw new Error("ARCA_PUBLIC_SOURCE_REGISTRY_DUPLICATE_ID");
  const byId=new Map(sources.map(source=>[source.id,source]));
  return Object.freeze({
    schema:PUBLIC_SOURCE_REGISTRY_SCHEMA,
    sources:Object.freeze(sources),
    get(sourceId){return byId.get(sourceId)??null},
    executable(){return sources.filter(source=>source.adapterStatus==="ACTIVE")}
  });
}

function jurisdiction(value){
  const normalized=text(value,"JURISDICTION",32).toUpperCase();
  if(normalized==="BR/NATIONAL")return normalized;
  const match=/^BR\/UF\/([A-Z]{2})$/.exec(normalized);
  if(!match||!UF_CODES.has(match[1]))throw new Error("ARCA_EVIDENCE_INVALID_JURISDICTION");
  return normalized;
}

export function createEvidenceEnvelope({source,rawRecord,normalizedRecord,recordKey,sourceUrl,acquiredAt,transformations=[],custodyRef,coverage={}}={}){
  if(!source||source.schema!==PUBLIC_SOURCE_ADAPTER_SCHEMA)throw new Error("ARCA_EVIDENCE_SOURCE_REQUIRED");
  if(rawRecord===undefined||normalizedRecord===undefined)throw new Error("ARCA_EVIDENCE_RECORDS_REQUIRED");
  const url=httpsUrl(sourceUrl,"SOURCE_URL");
  if(!source.allowedOrigins.includes(url.origin))throw new Error("ARCA_EVIDENCE_SOURCE_ORIGIN_NOT_ALLOWED");
  const timestamp=new Date(acquiredAt);
  if(Number.isNaN(timestamp.getTime()))throw new Error("ARCA_EVIDENCE_INVALID_ACQUIRED_AT");
  const normalizedKey=text(recordKey,"RECORD_KEY",256);
  const rawSha256=sha256(rawRecord);
  const normalizedSha256=sha256(normalizedRecord);
  const envelopeBase={
    schema:EVIDENCE_ENVELOPE_SCHEMA,
    sourceId:source.id,
    sourceClass:source.sourceClass,
    recordKey:normalizedKey,
    jurisdiction:jurisdiction(coverage.jurisdiction),
    municipalityCode:coverage.municipalityCode??null,
    sourceUrl:url.toString(),
    acquiredAt:timestamp.toISOString(),
    retrievalMode:"OFFLINE_FIXTURE",
    rawSha256,
    normalizedSha256,
    transformations:stringArray(transformations,"TRANSFORMATIONS"),
    custodyRef:text(custodyRef??`fixture:sha256:${rawSha256}`,"CUSTODY_REF",320),
    coverage:Object.freeze({
      temporal:text(coverage.temporal,"COVERAGE_TEMPORAL",80),
      fields:Object.freeze(stringArray(coverage.fields,"COVERAGE_FIELDS")),
      knownGaps:Object.freeze(stringArray(coverage.knownGaps??[],"KNOWN_GAPS",{allowEmpty:true}))
    }),
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({...envelopeBase,envelopeSha256:sha256(envelopeBase)});
}
