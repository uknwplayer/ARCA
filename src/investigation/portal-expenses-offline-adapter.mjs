import {createEvidenceEnvelope} from "./public-source-contract.mjs";

export const PORTAL_EXPENSE_SOURCE_ID="br.portal-transparencia.download-despesas";
export const PORTAL_EXPENSE_CATALOG_URL="https://portaldatransparencia.gov.br/download-de-dados/despesas";
export const PORTAL_PAYMENT_IMPACT_DATASET="Despesas_Pagamento_EmpenhosImpactados";

function field(row,key,max=160){
  const value=row?.[key];
  if(typeof value!=="string")throw new Error("ARCA_PORTAL_EXPENSE_INVALID_FIELD");
  const trimmed=value.normalize("NFKC").trim();
  if(!trimmed||trimmed.length>max||/[\u0000-\u001f\u007f]/.test(trimmed))throw new Error("ARCA_PORTAL_EXPENSE_INVALID_FIELD");
  return trimmed;
}

function amountInCents(value){
  if(!/^(?:0|[1-9]\d{0,11})(?:,\d{2})$/.test(value))throw new Error("ARCA_PORTAL_EXPENSE_INVALID_AMOUNT");
  const [reais,centavos]=value.split(",");
  const amount=Number(reais)*100+Number(centavos);
  if(!Number.isSafeInteger(amount))throw new Error("ARCA_PORTAL_EXPENSE_INVALID_AMOUNT");
  return amount;
}

function textPeriod(shard,impactRecord){
  const explicit=String(impactRecord?.period??shard?.period??"").trim();
  if(!/^\d{4}-\d{2}$/.test(explicit))
    throw new Error("ARCA_PORTAL_EXPENSE_IMPACT_PERIOD_REQUIRED");
  return explicit;
}

export function normalizePortalExpenseRow(row){
  if(!row||typeof row!=="object"||Array.isArray(row))throw new Error("ARCA_PORTAL_EXPENSE_INVALID_ROW");
  const expected=["Código Pagamento","Código Órgão","Órgão","Código Favorecido","Favorecido","Data Emissão","Valor do Pagamento Convertido pra R$"];
  if(Object.keys(row).length!==expected.length||Object.keys(row).some(key=>!expected.includes(key)))
    throw new Error("ARCA_PORTAL_EXPENSE_UNEXPECTED_FIELD");
  const documentCode=field(row,"Código Pagamento",40);
  const agencyCode=field(row,"Código Órgão",32);
  const beneficiaryCode=field(row,"Código Favorecido",64);
  const issued=field(row,"Data Emissão",10);
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(issued);
  if(!match)throw new Error("ARCA_PORTAL_EXPENSE_INVALID_DATE");
  const isoDate=`${match[3]}-${match[2]}-${match[1]}`;
  const date=new Date(`${isoDate}T00:00:00.000Z`);
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==isoDate)
    throw new Error("ARCA_PORTAL_EXPENSE_INVALID_DATE");
  if(!/^[A-Z0-9-]+$/.test(documentCode)||!/^[A-Z0-9-]+$/.test(agencyCode)||!/^[A-Z0-9-]+$/.test(beneficiaryCode))
    throw new Error("ARCA_PORTAL_EXPENSE_INVALID_IDENTIFIER");
  return Object.freeze({
    format:"arca-portal-payment-offline-normalized-v1",
    recordKey:`portal-payment:${documentCode}`,
    documentCode,
    agencyCode,
    beneficiaryCode,
    issuedAt:isoDate,
    period:isoDate.slice(0,7),
    amountCents:amountInCents(field(row,"Valor do Pagamento Convertido pra R$",40)),
    currency:"BRL",
    agencyName:field(row,"Órgão",240),
    beneficiaryName:field(row,"Favorecido",240)
  });
}

export function normalizePortalPaymentImpactFixture(relation){
  if(!relation||typeof relation!=="object"||Array.isArray(relation))
    throw new Error("ARCA_PORTAL_EXPENSE_INVALID_IMPACT_RELATION");
  const expected=["paymentDocumentCode","commitmentCode","subitem","paidAmountCents"];
  if(Object.keys(relation).length!==expected.length||Object.keys(relation).some(key=>!expected.includes(key)))
    throw new Error("ARCA_PORTAL_EXPENSE_UNEXPECTED_IMPACT_FIELD");
  const paymentDocumentCode=field(relation,"paymentDocumentCode",80);
  const commitmentCode=field(relation,"commitmentCode",80);
  const subitem=field(relation,"subitem",40);
  const paidAmountCents=Number(relation.paidAmountCents);
  if(!/^[A-Z0-9._:-]+$/.test(paymentDocumentCode)||
     !/^[A-Z0-9._:-]+$/.test(commitmentCode)||
     !/^[A-Z0-9._:-]+$/.test(subitem)||
     !Number.isSafeInteger(paidAmountCents)||paidAmountCents<0)
    throw new Error("ARCA_PORTAL_EXPENSE_INVALID_IMPACT_RELATION");
  return Object.freeze({
    format:"arca-portal-payment-impact-offline-normalized-v1",
    recordKey:`portal-payment-impact:${paymentDocumentCode}:${commitmentCode}:${subitem}`,
    dataset:PORTAL_PAYMENT_IMPACT_DATASET,
    paymentDocumentCode,
    commitmentCode,
    subitem,
    paidAmountCents,
    currency:"BRL"
  });
}

export function createOfflinePortalExpensesAdapter(){
  return Object.freeze({
    sourceId:PORTAL_EXPENSE_SOURCE_ID,
    mode:"OFFLINE_FIXTURE",
    async collect({source,shard}){
      if(source.id!==this.sourceId||source.adapterStatus!=="ACTIVE"||!source.executableModes.includes(this.mode))
        throw new Error("ARCA_PORTAL_EXPENSE_SOURCE_NOT_EXECUTABLE");
      if(shard.sourceId!==this.sourceId||!["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].includes(shard.uf))
        throw new Error("ARCA_PORTAL_EXPENSE_INVALID_SHARD");
      if(shard.status==="SOURCE_UNAVAILABLE"){
        if(typeof shard.reason!=="string"||!shard.reason.trim())throw new Error("ARCA_PORTAL_EXPENSE_INVALID_REASON");
        return Object.freeze({uf:shard.uf,status:"SOURCE_UNAVAILABLE",records:Object.freeze([]),
          gap:Object.freeze({category:"SOURCE_UNAVAILABLE",reason:field(shard,"reason"),suspicion:false})});
      }
      if(shard.status!=="AVAILABLE"||!Array.isArray(shard.records)||shard.records.length>20||
         (shard.impactRecords!==undefined&&(!Array.isArray(shard.impactRecords)||shard.impactRecords.length>40)))
        throw new Error("ARCA_PORTAL_EXPENSE_INVALID_RECORD_BUDGET");
      const records=shard.records.map(record=>{
        // The catalog is a reference to the official dataset, never a claim that this synthetic row exists there.
        if(record.sourceUrl!==PORTAL_EXPENSE_CATALOG_URL)throw new Error("ARCA_PORTAL_EXPENSE_CATALOG_URL_REQUIRED");
        const normalized=normalizePortalExpenseRow(record.row);
        return createEvidenceEnvelope({
          source,rawRecord:record.row,normalizedRecord:normalized,recordKey:normalized.recordKey,
          sourceUrl:record.sourceUrl,acquiredAt:record.retrievedAt,
          transformations:["portal-payment-offline-fixture-normalizer-v1"],
          coverage:{
            jurisdiction:`BR/UF/${shard.uf}`,municipalityCode:null,temporal:normalized.period,
            fields:["agencyCode","agencyName","amountCents","beneficiaryCode","beneficiaryName","documentCode","issuedAt","period"],
            knownGaps:["synthetic-row-not-observed-in-official-dataset","uf-attribution-unverified",
              "payment-to-procurement-link-not-proven","payment-may-affect-multiple-commitments"]
          }
        });
      });
      for(const impactRecord of shard.impactRecords??[]){
        if(impactRecord.sourceUrl!==PORTAL_EXPENSE_CATALOG_URL)
          throw new Error("ARCA_PORTAL_EXPENSE_CATALOG_URL_REQUIRED");
        const normalized=normalizePortalPaymentImpactFixture(impactRecord.relation);
        records.push(createEvidenceEnvelope({
          source,rawRecord:impactRecord.relation,normalizedRecord:normalized,recordKey:normalized.recordKey,
          sourceUrl:impactRecord.sourceUrl,acquiredAt:impactRecord.retrievedAt,
          transformations:["portal-payment-impact-semantic-fixture-v1"],
          coverage:{
            jurisdiction:`BR/UF/${shard.uf}`,municipalityCode:null,temporal:textPeriod(shard,impactRecord),
            fields:["commitmentCode","dataset","paidAmountCents","paymentDocumentCode","subitem"],
            knownGaps:["synthetic-impact-relation-not-observed-in-official-dataset","csv-layout-not-asserted",
              "uf-attribution-unverified","commitment-to-procurement-link-not-proven"]
          }
        }));
      }
      return Object.freeze({uf:shard.uf,status:"AVAILABLE",records:Object.freeze(records),gap:null});
    }
  });
}
