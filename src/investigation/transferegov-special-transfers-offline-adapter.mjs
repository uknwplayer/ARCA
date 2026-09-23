import {createEvidenceEnvelope} from "./public-source-contract.mjs";

export const TRANSFEREGOV_SOURCE_ID="br.transferegov.public";
export const TRANSFEREGOV_PUBLIC_API_URL="https://api-publica.transferegov.gestao.gov.br/";

const UF_CODES=new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
]);

function text(value,field,max=240){
  const normalized=String(value??"").normalize("NFKC").trim();
  if(!normalized||normalized.length>max||/[\u0000-\u001f\u007f]/u.test(normalized))
    throw new Error(`ARCA_TRANSFEREGOV_INVALID_${field}`);
  return normalized;
}

function integer(value,field,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<min||number>max)
    throw new Error(`ARCA_TRANSFEREGOV_INVALID_${field}`);
  return number;
}

function identifier(value,field,max=120){
  const normalized=text(value,field,max);
  if(!/^[A-Z0-9._:-]+$/u.test(normalized))
    throw new Error(`ARCA_TRANSFEREGOV_INVALID_${field}`);
  return normalized;
}

function timestamp(value){
  const normalized=text(value,"UPDATED_AT",64);
  const parsed=new Date(normalized);
  if(Number.isNaN(parsed.getTime())||parsed.toISOString()!==normalized)
    throw new Error("ARCA_TRANSFEREGOV_INVALID_UPDATED_AT");
  return normalized;
}

export function normalizeTransferegovSpecialTransferFixture(record){
  if(!record||typeof record!=="object"||Array.isArray(record))
    throw new Error("ARCA_TRANSFEREGOV_INVALID_RECORD");

  const expected=[
    "transferId","amendmentCode","beneficiaryEntityCode","beneficiaryName",
    "beneficiaryUf","beneficiaryMunicipalityCode","authorRef","year",
    "amountCents","paidAmountCents","status","updatedAt"
  ];
  const keys=Object.keys(record);
  if(keys.length!==expected.length||keys.some(key=>!expected.includes(key)))
    throw new Error("ARCA_TRANSFEREGOV_UNEXPECTED_FIELD");

  const beneficiaryUf=text(record.beneficiaryUf,"UF",2).toUpperCase();
  if(!UF_CODES.has(beneficiaryUf))throw new Error("ARCA_TRANSFEREGOV_INVALID_UF");

  const amountCents=integer(record.amountCents,"AMOUNT_CENTS",{max:10_000_000_000_000});
  const paidAmountCents=integer(record.paidAmountCents,"PAID_AMOUNT_CENTS",{max:10_000_000_000_000});
  if(paidAmountCents>amountCents)throw new Error("ARCA_TRANSFEREGOV_PAID_EXCEEDS_AMOUNT");

  const year=integer(record.year,"YEAR",{min:2000,max:2100});
  const municipalityCode=text(record.beneficiaryMunicipalityCode,"MUNICIPALITY_CODE",16);
  if(!/^\d{7}$/u.test(municipalityCode))throw new Error("ARCA_TRANSFEREGOV_INVALID_MUNICIPALITY_CODE");

  const status=identifier(record.status,"STATUS",64);
  return Object.freeze({
    format:"arca-transferegov-special-transfer-offline-normalized-v1",
    recordKey:`transferegov-special-transfer:${identifier(record.transferId,"TRANSFER_ID")}`,
    transferId:identifier(record.transferId,"TRANSFER_ID"),
    amendmentCode:identifier(record.amendmentCode,"AMENDMENT_CODE"),
    beneficiaryEntityCode:identifier(record.beneficiaryEntityCode,"BENEFICIARY_ENTITY_CODE"),
    beneficiaryName:text(record.beneficiaryName,"BENEFICIARY_NAME"),
    beneficiaryUf,
    beneficiaryMunicipalityCode:municipalityCode,
    authorRef:identifier(record.authorRef,"AUTHOR_REF"),
    year,
    amountCents,
    paidAmountCents,
    currency:"BRL",
    status,
    updatedAt:timestamp(record.updatedAt)
  });
}

export function createOfflineTransferegovSpecialTransfersAdapter(){
  return Object.freeze({
    sourceId:TRANSFEREGOV_SOURCE_ID,
    mode:"OFFLINE_FIXTURE",
    async collect({source,shard}){
      if(source.id!==this.sourceId||source.adapterStatus!=="ACTIVE"||!source.executableModes.includes(this.mode))
        throw new Error("ARCA_TRANSFEREGOV_SOURCE_NOT_EXECUTABLE");
      const uf=text(shard?.uf,"UF",2).toUpperCase();
      if(!UF_CODES.has(uf)||shard?.sourceId!==this.sourceId)
        throw new Error("ARCA_TRANSFEREGOV_INVALID_SHARD");

      if(shard.status==="SOURCE_UNAVAILABLE"){
        return Object.freeze({
          uf,status:"SOURCE_UNAVAILABLE",records:Object.freeze([]),
          gap:Object.freeze({
            category:"SOURCE_UNAVAILABLE",
            reason:text(shard.reason,"UNAVAILABLE_REASON",160),
            suspicion:false
          })
        });
      }

      if(shard.status!=="AVAILABLE"||!Array.isArray(shard.records)||shard.records.length>25)
        throw new Error("ARCA_TRANSFEREGOV_INVALID_RECORD_BUDGET");

      const envelopes=shard.records.map(item=>{
        if(item.sourceUrl!==TRANSFEREGOV_PUBLIC_API_URL)
          throw new Error("ARCA_TRANSFEREGOV_CANONICAL_URL_REQUIRED");
        const normalized=normalizeTransferegovSpecialTransferFixture(item.record);
        if(normalized.beneficiaryUf!==uf)
          throw new Error("ARCA_TRANSFEREGOV_UF_MISMATCH");

        return createEvidenceEnvelope({
          source,
          rawRecord:item.record,
          normalizedRecord:normalized,
          recordKey:normalized.recordKey,
          sourceUrl:item.sourceUrl,
          acquiredAt:item.retrievedAt,
          transformations:["transferegov-special-transfer-offline-fixture-normalizer-v1"],
          coverage:{
            jurisdiction:`BR/UF/${uf}`,
            municipalityCode:normalized.beneficiaryMunicipalityCode,
            temporal:String(normalized.year),
            fields:[
              "amendmentCode","amountCents","authorRef","beneficiaryEntityCode",
              "beneficiaryMunicipalityCode","beneficiaryName","beneficiaryUf",
              "paidAmountCents","status","transferId","updatedAt","year"
            ],
            knownGaps:[
              "synthetic-record-not-observed-in-live-api",
              "live-endpoint-schema-not-yet-accepted",
              "transfer-does-not-prove-procurement-link",
              "payment-does-not-prove-physical-delivery",
              "author-reference-is-context-not-adverse-finding"
            ]
          }
        });
      });

      return Object.freeze({uf,status:"AVAILABLE",records:Object.freeze(envelopes),gap:null});
    }
  });
}
