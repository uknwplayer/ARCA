import {canonicalJson,sha256} from "./public-source-contract.mjs";

export const M5_PORTAL_RELATED_DOCUMENTS_PARSER_SCHEMA="arca.m5-portal-related-documents-parser.v1";
export const M5_PORTAL_RELATED_DOCUMENTS_NORMALIZATION_SCHEMA="arca.m5-portal-related-documents-normalization.v1";
export const GATE046_OBSERVED_SCHEMA_SHA256="79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6";

export const M5_PORTAL_RELATED_DOCUMENTS_EXPECTED_FIELDS=Object.freeze([
  "data","documento","documentoResumido","elementoDespesa","especie","fase",
  "favorecido","orgaoSuperior","orgaoVinculado","unidadeGestora","valor"
]);

export const M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT=Object.freeze({
  schema:"arca.m5-portal-related-documents-parser-contract.v1",
  parserVersion:"v1",
  observedSchemaSha256:GATE046_OBSERVED_SCHEMA_SHA256,
  expectedFields:M5_PORTAL_RELATED_DOCUMENTS_EXPECTED_FIELDS,
  acceptedDateFormats:Object.freeze(["YYYY-MM-DD","DD/MM/YYYY"]),
  acceptedCurrency:"BRL",
  acceptedDecimalSeparator:",",
  acceptedPhases:Object.freeze(["EMPENHO","LIQUIDACAO","PAGAMENTO"]),
  liveNormalizationAuthorized:false,
  identityInferencesMade:false,
  publicationAuthorized:false,
  humanReviewRequired:true
});

export const M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT_SHA256=
  sha256(canonicalJson(M5_PORTAL_RELATED_DOCUMENTS_PARSER_CONTRACT));

function text(value,field,max=800){
  if(typeof value!=="string")throw new Error(`ARCA_M5_PORTAL_PARSER_INVALID_${field}`);
  const out=value.normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/u.test(out))
    throw new Error(`ARCA_M5_PORTAL_PARSER_INVALID_${field}`);
  return out;
}
function exactRecord(record){
  if(!record||typeof record!=="object"||Array.isArray(record))
    throw new Error("ARCA_M5_PORTAL_PARSER_RECORD_INVALID");
  const keys=Object.keys(record).sort();
  const expected=[...M5_PORTAL_RELATED_DOCUMENTS_EXPECTED_FIELDS].sort();
  if(JSON.stringify(keys)!==JSON.stringify(expected))
    throw new Error("ARCA_M5_PORTAL_PARSER_SCHEMA_DRIFT");
}
function dateOnly(value){
  const raw=text(value,"DATE",32);
  let iso=null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))iso=raw;
  else{
    const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if(match)iso=`${match[3]}-${match[2]}-${match[1]}`;
  }
  if(!iso)throw new Error("ARCA_M5_PORTAL_PARSER_DATE_FORMAT_UNSUPPORTED");
  const parsed=new Date(iso+"T00:00:00.000Z");
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)
    throw new Error("ARCA_M5_PORTAL_PARSER_DATE_INVALID");
  return iso;
}
function moneyCents(value){
  const raw=text(value,"VALUE",64);
  const normalized=raw.replace(/^R\$\s*/u,"");
  const match=/^(-?)(?:(\d{1,3}(?:\.\d{3})+)|(\d+)),(\d{2})$/.exec(normalized);
  if(!match)throw new Error("ARCA_M5_PORTAL_PARSER_VALUE_FORMAT_UNSUPPORTED");
  const sign=match[1]==="-"?-1:1;
  const whole=(match[2]??match[3]).replace(/\./g,"");
  if(whole.length>13)throw new Error("ARCA_M5_PORTAL_PARSER_VALUE_OUT_OF_RANGE");
  const cents=sign*(Number(whole)*100+Number(match[4]));
  if(!Number.isSafeInteger(cents))
    throw new Error("ARCA_M5_PORTAL_PARSER_VALUE_OUT_OF_RANGE");
  return cents;
}
function phaseKind(value){
  const raw=text(value,"PHASE",80);
  const folded=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  if(["1","EMPENHO","EMPENHADO"].includes(folded))return "EMPENHO";
  if(["2","LIQUIDACAO","LIQUIDADO"].includes(folded))return "LIQUIDACAO";
  if(["3","PAGAMENTO","PAGO"].includes(folded))return "PAGAMENTO";
  throw new Error("ARCA_M5_PORTAL_PARSER_PHASE_UNSUPPORTED");
}
function valueRef(namespace,value){
  return `portal:${namespace}:sha256:${sha256(value)}`;
}

export function normalizePortalRelatedDocumentRecord(record){
  exactRecord(record);
  const documentCode=text(record.documento,"DOCUMENT",160);
  const date=dateOnly(record.data);
  const amountCents=moneyCents(record.valor);
  const phase=phaseKind(record.fase);
  const beneficiary=text(record.favorecido,"BENEFICIARY",800);
  const superiorAgency=text(record.orgaoSuperior,"SUPERIOR_AGENCY",800);
  const linkedAgency=text(record.orgaoVinculado,"LINKED_AGENCY",800);
  const managementUnit=text(record.unidadeGestora,"MANAGEMENT_UNIT",800);
  const normalized={
    schema:M5_PORTAL_RELATED_DOCUMENTS_PARSER_SCHEMA,
    version:1,
    recordRef:valueRef("document",documentCode),
    documentCode,
    documentSummary:text(record.documentoResumido,"DOCUMENT_SUMMARY",800),
    date,
    phase,
    species:text(record.especie,"SPECIES",240),
    expenseElement:text(record.elementoDespesa,"EXPENSE_ELEMENT",400),
    amountCents,
    currency:"BRL",
    beneficiaryText:beneficiary,
    beneficiaryRef:valueRef("beneficiary-text",beneficiary),
    superiorAgencyText:superiorAgency,
    superiorAgencyRef:valueRef("superior-agency-text",superiorAgency),
    linkedAgencyText:linkedAgency,
    linkedAgencyRef:valueRef("linked-agency-text",linkedAgency),
    managementUnitText:managementUnit,
    managementUnitRef:valueRef("management-unit-text",managementUnit),
    rawRecordSha256:sha256(canonicalJson(record)),
    identityInferencesMade:false,
    containsSourceValues:true,
    publicationAuthorized:false,
    humanReviewRequired:true
  };
  return Object.freeze(normalized);
}

export function normalizePortalRelatedDocumentsFixture({
  records,
  observedSchemaSha256,
  executionMode="SYNTHETIC_FIXTURE"
}={}){
  if(executionMode!=="SYNTHETIC_FIXTURE")
    throw new Error("ARCA_M5_PORTAL_PARSER_LIVE_NORMALIZATION_NOT_AUTHORIZED");
  if(observedSchemaSha256!==GATE046_OBSERVED_SCHEMA_SHA256)
    throw new Error("ARCA_M5_PORTAL_PARSER_SCHEMA_HASH_MISMATCH");
  if(!Array.isArray(records)||records.length<1||records.length>25)
    throw new Error("ARCA_M5_PORTAL_PARSER_RECORD_BUDGET_INVALID");
  const normalizedRecords=records.map(normalizePortalRelatedDocumentRecord);
  const base={
    schema:M5_PORTAL_RELATED_DOCUMENTS_NORMALIZATION_SCHEMA,
    version:1,
    parserVersion:"v1",
    executionMode,
    observedSchemaSha256,
    recordCount:normalizedRecords.length,
    records:Object.freeze(normalizedRecords),
    normalizationState:"NORMALIZED_SYNTHETIC_FIXTURE",
    liveNormalizationAuthorized:false,
    networkUsed:false,
    publicationAttempted:false,
    adverseFinding:false,
    humanReviewRequired:true
  };
  return Object.freeze({...base,normalizationSha256:sha256(canonicalJson(base))});
}
