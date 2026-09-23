import {canonicalJson,sha256} from "./public-source-contract.mjs";

export const M5_PNCP_LIVE_PARSER_SCHEMA="arca.m5-pncp-live-parser.v1";
export const M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256=
  "4a00de8f61190819cc6e172f45438dcb22dc1c952430fc7a1c79f2cc0dcfabb9";
export const M5_PNCP_AP_PAGE_FILE_SHA256=
  "da9ae12fcea93ed85c85761b08d214f241333be5209ea15b4bda6b627e3f4afc";

export const M5_PNCP_LIVE_RECORD_FIELDS=Object.freeze([
  "amparoLegal","anoCompra","dataAberturaProposta","dataAtualizacao",
  "dataAtualizacaoGlobal","dataEncerramentoProposta","dataInclusao",
  "dataPublicacaoPncp","emendaParlamentar","fontesOrcamentarias",
  "informacaoComplementar","justificativaPresencial","linkProcessoEletronico",
  "linkSistemaOrigem","modalidadeId","modalidadeNome","modoDisputaId",
  "modoDisputaNome","numeroCompra","numeroControlePNCP","objetoCompra",
  "orgaoEntidade","orgaoSubRogado","processo","sequencialCompra",
  "situacaoCompraId","situacaoCompraNome","srp",
  "tipoInstrumentoConvocatorioCodigo","tipoInstrumentoConvocatorioNome",
  "unidadeOrgao","unidadeSubRogada","usuarioNome","valorTotalEstimado",
  "valorTotalHomologado"
]);

const ORGAO_FIELDS=Object.freeze(["cnpj","esferaId","poderId","razaoSocial"]);
const UNIDADE_FIELDS=Object.freeze([
  "codigoIbge","codigoUnidade","municipioNome","nomeUnidade","ufNome","ufSigla"
]);
const AMPARO_FIELDS=Object.freeze(["codigo","descricao","nome"]);
const FONTE_FIELDS=Object.freeze(["codigo","dataInclusao","descricao","nome"]);

export const M5_PNCP_LIVE_PARSER_CONTRACT=Object.freeze({
  schema:"arca.m5-pncp-live-parser-contract.v1",
  parserVersion:"v1",
  captureRunId:"35547609136",
  observedStructureSha256:M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256,
  pageFileSha256:M5_PNCP_AP_PAGE_FILE_SHA256,
  expectedRecordFields:M5_PNCP_LIVE_RECORD_FIELDS,
  outputKind:"PROCUREMENT_DISCOVERY_TARGET",
  networkAuthorized:false,
  publicationAuthorized:false,
  correlationAuthorized:false,
  humanReviewRequired:true
});
export const M5_PNCP_LIVE_PARSER_CONTRACT_SHA256=
  sha256(canonicalJson(M5_PNCP_LIVE_PARSER_CONTRACT));

function plain(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
function exactKeys(value,expected,code){
  if(!plain(value))throw new Error(code);
  const actual=Object.keys(value).sort();
  const wanted=[...expected].sort();
  if(JSON.stringify(actual)!==JSON.stringify(wanted))throw new Error(code);
}
function str(v,field,max=1600){
  if(typeof v!=="string")throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  const out=v.normalize("NFKC").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/u.test(out))
    throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  return out;
}
function nullableString(v,field,max=1600){
  if(v===null)return null;
  return str(v,field,max);
}
function optionalString(v,field,max=3000){
  if(typeof v!=="string")throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  const out=v.normalize("NFKC").trim();
  if(out.length>max||/[\u0000-\u001f\u007f]/u.test(out))
    throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  return out||null;
}
function integer(v,field,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
  if(!Number.isSafeInteger(v)||v<min||v>max)
    throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  return v;
}
function boolean(v,field){
  if(typeof v!=="boolean")throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  return v;
}
function nullOnly(v,field){
  if(v!==null)throw new Error(`ARCA_M5_PNCP_PARSER_SCHEMA_DRIFT_${field}`);
  return null;
}
function datePrefix(v,field){
  const raw=str(v,field,64);
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if(!m)throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  const date=`${m[1]}-${m[2]}-${m[3]}`;
  const parsed=new Date(date+"T00:00:00.000Z");
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)
    throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  return date;
}
function moneyCents(v,field){
  if(typeof v!=="number"||!Number.isFinite(v)||v<0)
    throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  const scaled=v*100;
  const rounded=Math.round(scaled);
  if(!Number.isSafeInteger(rounded)||Math.abs(scaled-rounded)>1e-6)
    throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  return rounded;
}
function cnpj(v){
  const out=str(v,"CNPJ",32).replace(/\D/g,"");
  if(!/^\d{14}$/.test(out))throw new Error("ARCA_M5_PNCP_PARSER_INVALID_CNPJ");
  return out;
}
function nullableNumber(v,field){
  if(v===null)return null;
  if(typeof v!=="number"||!Number.isFinite(v))
    throw new Error(`ARCA_M5_PNCP_PARSER_INVALID_${field}`);
  return v;
}
function validateFonte(item){
  exactKeys(item,FONTE_FIELDS,"ARCA_M5_PNCP_PARSER_FONTE_SCHEMA_DRIFT");
  integer(item.codigo,"FONTE_CODIGO");
  str(item.dataInclusao,"FONTE_DATA",64);
  str(item.descricao,"FONTE_DESCRICAO",800);
  str(item.nome,"FONTE_NOME",400);
}
function recordRef(control){return `pncp:control:sha256:${sha256(control)}`}

export function normalizePncpLiveProcurementRecord(record){
  exactKeys(record,M5_PNCP_LIVE_RECORD_FIELDS,"ARCA_M5_PNCP_PARSER_RECORD_SCHEMA_DRIFT");
  exactKeys(record.orgaoEntidade,ORGAO_FIELDS,"ARCA_M5_PNCP_PARSER_ORGAO_SCHEMA_DRIFT");
  exactKeys(record.unidadeOrgao,UNIDADE_FIELDS,"ARCA_M5_PNCP_PARSER_UNIDADE_SCHEMA_DRIFT");
  exactKeys(record.amparoLegal,AMPARO_FIELDS,"ARCA_M5_PNCP_PARSER_AMPARO_SCHEMA_DRIFT");
  if(!Array.isArray(record.fontesOrcamentarias)||record.fontesOrcamentarias.length>25)
    throw new Error("ARCA_M5_PNCP_PARSER_FONTES_INVALID");
  record.fontesOrcamentarias.forEach(validateFonte);

  nullOnly(record.emendaParlamentar,"EMENDA_PARLAMENTAR");
  nullOnly(record.informacaoComplementar,"INFORMACAO_COMPLEMENTAR");
  nullOnly(record.justificativaPresencial,"JUSTIFICATIVA_PRESENCIAL");
  nullOnly(record.orgaoSubRogado,"ORGAO_SUBROGADO");
  nullOnly(record.unidadeSubRogada,"UNIDADE_SUBROGADA");
  nullOnly(record.valorTotalHomologado,"VALOR_TOTAL_HOMOLOGADO");

  const control=str(record.numeroControlePNCP,"CONTROLE",120).toUpperCase();
  const match=/^([A-Z0-9]{14})-\d+-(\d+)\/(\d{4})$/.exec(control);
  if(!match)throw new Error("ARCA_M5_PNCP_PARSER_CONTROL_FORMAT_INVALID");
  const agencyCnpj=cnpj(record.orgaoEntidade.cnpj);
  const year=integer(record.anoCompra,"ANO_COMPRA",{min:2000,max:2100});
  const sequence=integer(record.sequencialCompra,"SEQUENCIAL",{min:1,max:999999999});
  if(match[1]!==agencyCnpj||Number(match[2])!==sequence||Number(match[3])!==year)
    throw new Error("ARCA_M5_PNCP_PARSER_CONTROL_BINDING_MISMATCH");

  const uf=str(record.unidadeOrgao.ufSigla,"UF",2).toUpperCase();
  if(!/^[A-Z]{2}$/.test(uf))throw new Error("ARCA_M5_PNCP_PARSER_INVALID_UF");
  const ibge=str(record.unidadeOrgao.codigoIbge,"IBGE",16);
  if(!/^\d{7}$/.test(ibge))throw new Error("ARCA_M5_PNCP_PARSER_INVALID_IBGE");

  integer(record.modalidadeId,"MODALIDADE",{min:1,max:10000});
  integer(record.modoDisputaId,"MODO_DISPUTA",{min:0,max:10000});
  integer(record.situacaoCompraId,"SITUACAO",{min:0,max:10000});
  integer(record.tipoInstrumentoConvocatorioCodigo,"INSTRUMENTO",{min:0,max:10000});
  integer(record.amparoLegal.codigo,"AMPARO_CODIGO",{min:0,max:100000});
  boolean(record.srp,"SRP");
  const estimatedValueCents=moneyCents(record.valorTotalEstimado,"VALOR_ESTIMADO");

  const normalized={
    schema:M5_PNCP_LIVE_PARSER_SCHEMA,
    version:1,
    recordRef:recordRef(control),
    procurementControlNumber:control,
    agencyIdentifier:Object.freeze({namespace:"CNPJ",value:agencyCnpj}),
    agencyName:str(record.orgaoEntidade.razaoSocial,"ORGAO_NOME",800),
    unitCode:str(record.unidadeOrgao.codigoUnidade,"UNIDADE_CODIGO",120),
    unitName:str(record.unidadeOrgao.nomeUnidade,"UNIDADE_NOME",800),
    municipalityCode:ibge,
    municipalityName:str(record.unidadeOrgao.municipioNome,"MUNICIPIO",400),
    uf,
    year,
    sequence,
    purchaseNumber:str(record.numeroCompra,"NUMERO_COMPRA",160),
    processNumber:str(record.processo,"PROCESSO",240),
    modalityId:record.modalidadeId,
    modalityName:str(record.modalidadeNome,"MODALIDADE_NOME",240),
    disputeModeId:record.modoDisputaId,
    disputeModeName:str(record.modoDisputaNome,"MODO_DISPUTA_NOME",240),
    statusId:record.situacaoCompraId,
    statusName:str(record.situacaoCompraNome,"SITUACAO_NOME",240),
    instrumentCode:record.tipoInstrumentoConvocatorioCodigo,
    instrumentName:str(record.tipoInstrumentoConvocatorioNome,"INSTRUMENTO_NOME",400),
    publishedAt:datePrefix(record.dataPublicacaoPncp,"DATA_PUBLICACAO"),
    objectDescription:optionalString(record.objetoCompra,"OBJETO",3000),
    estimatedValueCents,
    currency:"BRL",
    srp:record.srp,
    legalBasis:Object.freeze({
      code:record.amparoLegal.codigo,
      name:str(record.amparoLegal.nome,"AMPARO_NOME",400),
      description:str(record.amparoLegal.descricao,"AMPARO_DESCRICAO",1200)
    }),
    electronicProcessUrl:nullableString(record.linkProcessoEletronico,"LINK_PROCESSO",1600),
    sourceSystemUrl:nullableString(record.linkSistemaOrigem,"LINK_ORIGEM",1600),
    sourceRecordSha256:sha256(canonicalJson(record)),
    supplierIdentifier:null,
    supplierObserved:false,
    identityInferencesMade:false,
    humanReviewRequired:true,
    publicationAuthorized:false,
    correlationAuthorized:false
  };
  return Object.freeze(normalized);
}

export function normalizePncpLivePageFixture({
  page,
  observedStructureSha256,
  executionMode="SYNTHETIC_FIXTURE"
}={}){
  if(executionMode!=="SYNTHETIC_FIXTURE")
    throw new Error("ARCA_M5_PNCP_PARSER_LIVE_NORMALIZATION_NOT_AUTHORIZED");
  if(observedStructureSha256!==M5_PNCP_AP_OBSERVED_STRUCTURE_SHA256)
    throw new Error("ARCA_M5_PNCP_PARSER_STRUCTURE_HASH_MISMATCH");
  exactKeys(page,["data","empty","numeroPagina","paginasRestantes","totalPaginas","totalRegistros"],
    "ARCA_M5_PNCP_PARSER_PAGE_SCHEMA_DRIFT");
  if(!Array.isArray(page.data)||page.data.length<1||page.data.length>10)
    throw new Error("ARCA_M5_PNCP_PARSER_RECORD_BUDGET_INVALID");
  boolean(page.empty,"PAGE_EMPTY");
  integer(page.numeroPagina,"PAGE_NUMBER",{min:1,max:10000});
  integer(page.paginasRestantes,"REMAINING_PAGES",{min:0,max:100000});
  integer(page.totalPaginas,"TOTAL_PAGES",{min:0,max:100000});
  integer(page.totalRegistros,"TOTAL_RECORDS",{min:0,max:100000000});
  const records=page.data.map(normalizePncpLiveProcurementRecord);
  const base={
    schema:"arca.m5-pncp-live-normalization.v1",
    version:1,
    parserContractSha256:M5_PNCP_LIVE_PARSER_CONTRACT_SHA256,
    observedStructureSha256,
    executionMode,
    recordCount:records.length,
    records:Object.freeze(records),
    normalizationState:"NORMALIZED_SYNTHETIC_FIXTURE",
    liveNormalizationAuthorized:false,
    networkUsed:false,
    publicationAttempted:false,
    correlationAttempted:false,
    humanReviewRequired:true,
    adverseFinding:false
  };
  return Object.freeze({...base,normalizationSha256:sha256(canonicalJson(base))});
}
