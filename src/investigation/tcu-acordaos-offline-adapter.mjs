import {createEvidenceEnvelope} from "./public-source-contract.mjs";

export const TCU_SOURCE_ID="br.tcu.open-data";
export const TCU_ACORDAOS_ENDPOINT="https://dados-abertos.apps.tcu.gov.br/api/acordao/recupera-acordaos";
export const TCU_ACORDAOS_FIXTURE_SCHEMA="arca.tcu-acordaos-offline-fixture.v1";

function text(value,field,max=1200){
  const normalized=String(value??"").normalize("NFKC").trim();
  if(!normalized||normalized.length>max||/[\u0000-\u001f\u007f]/u.test(normalized))
    throw new Error(`ARCA_TCU_ACORDAO_INVALID_${field}`);
  return normalized;
}

function tcuUrl(value,field){
  let url;
  try{url=new URL(text(value,field,1600))}catch{throw new Error(`ARCA_TCU_ACORDAO_INVALID_${field}`)}
  if(url.protocol!=="https:"||url.username||url.password||!(url.hostname==="tcu.gov.br"||url.hostname.endsWith(".tcu.gov.br")))
    throw new Error(`ARCA_TCU_ACORDAO_INVALID_${field}`);
  return url.toString();
}

function isoDateFromBr(value){
  const raw=text(value,"DATA_SESSAO",16);
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(raw);
  if(!match)throw new Error("ARCA_TCU_ACORDAO_INVALID_DATA_SESSAO");
  const iso=`${match[3]}-${match[2]}-${match[1]}`;
  const parsed=new Date(`${iso}T00:00:00.000Z`);
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)
    throw new Error("ARCA_TCU_ACORDAO_INVALID_DATA_SESSAO");
  return iso;
}

export function normalizeTcuAcordaoFixture(record){
  if(!record||typeof record!=="object"||Array.isArray(record))
    throw new Error("ARCA_TCU_ACORDAO_INVALID_RECORD");
  const expected=[
    "key","tipo","anoAcordao","titulo","numeroAcordao","colegiado","dataSessao",
    "relator","situacao","sumario","urlArquivo","urlArquivoPDF","urlAcordao"
  ];
  const keys=Object.keys(record);
  if(keys.length!==expected.length||keys.some(key=>!expected.includes(key)))
    throw new Error("ARCA_TCU_ACORDAO_UNEXPECTED_FIELD");

  const year=text(record.anoAcordao,"ANO",4);
  if(!/^\d{4}$/u.test(year))throw new Error("ARCA_TCU_ACORDAO_INVALID_ANO");
  const number=text(record.numeroAcordao,"NUMERO",40);
  if(!/^[A-Z0-9./_-]+$/iu.test(number))throw new Error("ARCA_TCU_ACORDAO_INVALID_NUMERO");

  const key=text(record.key,"KEY",160);
  return Object.freeze({
    format:"arca-tcu-acordao-offline-normalized-v1",
    recordKey:`tcu-acordao:${key}`,
    key,
    tipo:text(record.tipo,"TIPO",120),
    year:Number(year),
    title:text(record.titulo,"TITULO",500),
    number,
    collegium:text(record.colegiado,"COLEGIADO",160),
    sessionDate:isoDateFromBr(record.dataSessao),
    rapporteur:text(record.relator,"RELATOR",240),
    status:text(record.situacao,"SITUACAO",160),
    summary:text(record.sumario,"SUMARIO",1200),
    documentUrl:tcuUrl(record.urlArquivo,"URL_ARQUIVO"),
    pdfUrl:tcuUrl(record.urlArquivoPDF,"URL_ARQUIVO_PDF"),
    decisionUrl:tcuUrl(record.urlAcordao,"URL_ACORDAO")
  });
}

export function createOfflineTcuAcordaosAdapter(){
  return Object.freeze({
    sourceId:TCU_SOURCE_ID,
    mode:"OFFLINE_FIXTURE",
    collect({source,fixture}={}){
      if(source?.id!==this.sourceId||source.adapterStatus!=="ACTIVE"||!source.executableModes.includes(this.mode))
        throw new Error("ARCA_TCU_ACORDAO_SOURCE_NOT_EXECUTABLE");
      if(fixture?.schema!==TCU_ACORDAOS_FIXTURE_SCHEMA)
        throw new Error("ARCA_TCU_ACORDAO_FIXTURE_SCHEMA_INVALID");

      if(fixture.status==="SOURCE_UNAVAILABLE"){
        return Object.freeze({
          jurisdiction:"BR/NATIONAL",
          status:"SOURCE_UNAVAILABLE",
          records:Object.freeze([]),
          gap:Object.freeze({
            category:"SOURCE_UNAVAILABLE",
            reason:text(fixture.reason,"UNAVAILABLE_REASON",160),
            suspicion:false
          })
        });
      }

      if(fixture.status!=="AVAILABLE"||!Array.isArray(fixture.records)||fixture.records.length<1||fixture.records.length>25)
        throw new Error("ARCA_TCU_ACORDAO_INVALID_RECORD_BUDGET");

      const records=fixture.records.map(item=>{
        if(item.sourceUrl!==TCU_ACORDAOS_ENDPOINT)
          throw new Error("ARCA_TCU_ACORDAO_CANONICAL_URL_REQUIRED");
        const normalized=normalizeTcuAcordaoFixture(item.record);
        return createEvidenceEnvelope({
          source,
          rawRecord:item.record,
          normalizedRecord:normalized,
          recordKey:normalized.recordKey,
          sourceUrl:item.sourceUrl,
          acquiredAt:item.retrievedAt,
          transformations:["tcu-acordao-offline-fixture-normalizer-v1"],
          coverage:{
            jurisdiction:"BR/NATIONAL",
            municipalityCode:null,
            temporal:String(normalized.year),
            fields:[
              "collegium","decisionUrl","documentUrl","key","number","pdfUrl","rapporteur",
              "sessionDate","status","summary","title","tipo","year"
            ],
            knownGaps:[
              "synthetic-record-not-observed-in-live-api",
              "decision-context-must-be-read",
              "later-decision-or-appeal-may-change-context",
              "acordao-does-not-by-itself-prove-current-irregularity"
            ]
          }
        });
      });

      return Object.freeze({
        jurisdiction:"BR/NATIONAL",
        status:"AVAILABLE",
        records:Object.freeze(records),
        gap:null
      });
    }
  });
}
