import {canonicalJson,sha256} from "./public-source-contract.mjs";

export const FINANCIAL_CORRELATION_FIXTURE_SCHEMA="arca.financial-correlation-fixture.v1";
export const FINANCIAL_CORRELATION_REPORT_SCHEMA="arca.financial-correlation-report.v1";
export const FINANCIAL_RELATION_SCHEMA="arca.financial-relation.v1";

const RELATION_STATES=new Set(["CONFIRMED","CANDIDATE","CONFLICTING","NOT_OBSERVED"]);
const IDENTIFIER_NAMESPACES=new Set([
  "CNPJ","SIAFI_ORG","SIAFI_UG","SIAFI_GESTAO","FIXTURE_ORG","FIXTURE_SUPPLIER"
]);

function text(value,field,max=320){
  const normalized=String(value??"").normalize("NFKC").trim();
  if(!normalized||normalized.length>max||/[\u0000-\u001f\u007f]/.test(normalized))
    throw new Error(`ARCA_FINANCIAL_CORRELATION_INVALID_${field}`);
  return normalized;
}
function array(value,field,{min=0,max=100}={}){
  if(!Array.isArray(value)||value.length<min||value.length>max)
    throw new Error(`ARCA_FINANCIAL_CORRELATION_INVALID_${field}`);
  return value;
}
function refs(value,field,{min=1,max=24}={}){
  const items=array(value,field,{min,max}).map(item=>text(item,field,320));
  if(new Set(items).size!==items.length)
    throw new Error(`ARCA_FINANCIAL_CORRELATION_DUPLICATE_${field}`);
  return Object.freeze([...items].sort());
}
function positiveInt(value,field,{allowZero=false}={}){
  const number=Number(value);
  if(!Number.isSafeInteger(number)||(allowZero?number<0:number<1))
    throw new Error(`ARCA_FINANCIAL_CORRELATION_INVALID_${field}`);
  return number;
}
function dateOnly(value,field){
  const raw=text(value,field,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))
    throw new Error(`ARCA_FINANCIAL_CORRELATION_INVALID_${field}`);
  const date=new Date(raw+"T00:00:00.000Z");
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==raw)
    throw new Error(`ARCA_FINANCIAL_CORRELATION_INVALID_${field}`);
  return raw;
}
function normalizeIdentifierValue(namespace,value){
  const raw=text(value,"IDENTIFIER",160);
  if(namespace==="CNPJ"){
    const digits=raw.replace(/\D/g,"");
    if(digits.length!==14)throw new Error("ARCA_FINANCIAL_CORRELATION_INVALID_CNPJ");
    return digits;
  }
  if(namespace==="SIAFI_ORG"){
    const digits=raw.replace(/\D/g,"");
    if(digits.length!==5)throw new Error("ARCA_FINANCIAL_CORRELATION_INVALID_SIAFI_ORG");
    return digits;
  }
  if(namespace==="SIAFI_UG"){
    const digits=raw.replace(/\D/g,"");
    if(digits.length!==6)throw new Error("ARCA_FINANCIAL_CORRELATION_INVALID_SIAFI_UG");
    return digits;
  }
  if(namespace==="SIAFI_GESTAO"){
    const digits=raw.replace(/\D/g,"");
    if(digits.length!==5)throw new Error("ARCA_FINANCIAL_CORRELATION_INVALID_SIAFI_GESTAO");
    return digits;
  }
  const fixture=raw.toUpperCase();
  if(!/^[A-Z0-9._:-]{3,120}$/.test(fixture))
    throw new Error("ARCA_FINANCIAL_CORRELATION_INVALID_FIXTURE_IDENTIFIER");
  return fixture;
}

export function canonicalEntityIdentifier(input={}){
  const entityType=text(input.entityType,"ENTITY_TYPE",24).toUpperCase();
  if(!["AGENCY","SUPPLIER"].includes(entityType))
    throw new Error("ARCA_FINANCIAL_CORRELATION_INVALID_ENTITY_TYPE");
  const namespace=text(input.namespace,"IDENTIFIER_NAMESPACE",32).toUpperCase();
  if(!IDENTIFIER_NAMESPACES.has(namespace))
    throw new Error("ARCA_FINANCIAL_CORRELATION_UNSUPPORTED_IDENTIFIER_NAMESPACE");
  const identifier=normalizeIdentifierValue(namespace,input.value);
  const provenanceRef=text(input.provenanceRef,"IDENTIFIER_PROVENANCE",320);
  return Object.freeze({
    entityType,
    namespace,
    ref:`entity:${entityType.toLowerCase()}:${namespace.toLowerCase()}:sha256:${sha256({entityType,namespace,identifier})}`,
    provenanceRef
  });
}

function paymentRef(documentCode){
  return `payment:sha256:${sha256(text(documentCode,"PAYMENT_DOCUMENT_CODE",80))}`;
}
function commitmentRef(commitmentCode){
  return `commitment:sha256:${sha256(text(commitmentCode,"COMMITMENT_CODE",80))}`;
}
function procurementRef(recordKey){
  return `procurement:sha256:${sha256(text(recordKey,"PROCUREMENT_RECORD_KEY",256))}`;
}
function daysBetween(first,second){
  const a=Date.parse(first+"T00:00:00.000Z");
  const b=Date.parse(second+"T00:00:00.000Z");
  return Math.trunc((b-a)/86400000);
}
function relation({kind,fromRef,toRef,state,basis,provenanceRefs,counterEvidenceRefs=[],signals={},temporalDistanceDays=null,alternativeExplanations=[]}){
  if(!RELATION_STATES.has(state))throw new Error("ARCA_FINANCIAL_CORRELATION_INVALID_RELATION_STATE");
  const base={
    schema:FINANCIAL_RELATION_SCHEMA,
    kind:text(kind,"RELATION_KIND",64),
    fromRef:text(fromRef,"RELATION_FROM",320),
    toRef:text(toRef,"RELATION_TO",320),
    state,
    basis:text(basis,"RELATION_BASIS",160),
    provenanceRefs:refs(provenanceRefs,"RELATION_PROVENANCE",{min:1,max:40}),
    counterEvidenceRefs:refs(counterEvidenceRefs,"COUNTER_EVIDENCE",{min:0,max:24}),
    signals:Object.freeze({...signals}),
    temporalDistanceDays:temporalDistanceDays===null?null:Number(temporalDistanceDays),
    alternativeExplanations:Object.freeze(array(alternativeExplanations,"ALTERNATIVE_EXPLANATIONS",{max:12}).map(item=>text(item,"ALTERNATIVE_EXPLANATION",240))),
    humanReviewRequired:true,
    adverseFinding:false,
    anomalyIsNotIrregularity:true
  };
  return Object.freeze({...base,relationId:sha256(base)});
}

function normalizePayment(input){
  const documentCode=text(input.documentCode,"PAYMENT_DOCUMENT_CODE",80);
  return Object.freeze({
    sourceId:text(input.sourceId,"PAYMENT_SOURCE_ID",160),
    documentCode,
    ref:paymentRef(documentCode),
    issuedAt:dateOnly(input.issuedAt,"PAYMENT_ISSUED_AT"),
    amountCents:positiveInt(input.amountCents,"PAYMENT_AMOUNT",{allowZero:true}),
    agency:canonicalEntityIdentifier({...input.agencyIdentifier,entityType:"AGENCY"}),
    beneficiary:canonicalEntityIdentifier({...input.beneficiaryIdentifier,entityType:"SUPPLIER"}),
    provenanceRefs:refs(input.provenanceRefs,"PAYMENT_PROVENANCE",{min:1,max:20})
  });
}
function normalizeImpact(input){
  const paymentDocumentCode=text(input.paymentDocumentCode,"IMPACT_PAYMENT_CODE",80);
  const commitmentCode=text(input.commitmentCode,"IMPACT_COMMITMENT_CODE",80);
  return Object.freeze({
    sourceId:text(input.sourceId,"IMPACT_SOURCE_ID",160),
    dataset:text(input.dataset,"IMPACT_DATASET",120),
    paymentDocumentCode,
    paymentRef:paymentRef(paymentDocumentCode),
    commitmentCode,
    commitmentRef:commitmentRef(commitmentCode),
    subitem:text(input.subitem,"IMPACT_SUBITEM",40),
    paidAmountCents:positiveInt(input.paidAmountCents,"IMPACT_PAID_AMOUNT",{allowZero:true}),
    provenanceRefs:refs(input.provenanceRefs,"IMPACT_PROVENANCE",{min:1,max:20})
  });
}
function normalizeProcurement(input){
  const recordKey=text(input.recordKey,"PROCUREMENT_RECORD_KEY",256);
  return Object.freeze({
    sourceId:text(input.sourceId,"PROCUREMENT_SOURCE_ID",160),
    recordKey,
    ref:procurementRef(recordKey),
    publishedAt:dateOnly(input.publishedAt,"PROCUREMENT_PUBLISHED_AT"),
    agency:canonicalEntityIdentifier({...input.agencyIdentifier,entityType:"AGENCY"}),
    supplier:canonicalEntityIdentifier({...input.supplierIdentifier,entityType:"SUPPLIER"}),
    provenanceRefs:refs(input.provenanceRefs,"PROCUREMENT_PROVENANCE",{min:1,max:20})
  });
}
function normalizeBinding(input){
  return Object.freeze({
    commitmentCode:text(input.commitmentCode,"BINDING_COMMITMENT_CODE",80),
    commitmentRef:commitmentRef(input.commitmentCode),
    procurementRecordKey:text(input.procurementRecordKey,"BINDING_PROCUREMENT_KEY",256),
    procurementRef:procurementRef(input.procurementRecordKey),
    basis:text(input.basis,"BINDING_BASIS",120),
    provenanceRefs:refs(input.provenanceRefs,"BINDING_PROVENANCE",{min:1,max:20}),
    conflictRefs:refs(input.conflictRefs??[],"BINDING_CONFLICT",{min:0,max:20})
  });
}

function fixtureShape(fixture){
  if(!fixture||fixture.schema!==FINANCIAL_CORRELATION_FIXTURE_SCHEMA)
    throw new Error("ARCA_FINANCIAL_CORRELATION_FIXTURE_SCHEMA_INVALID");
  const pilotId=text(fixture.pilotId,"PILOT_ID",128);
  const timeWindow=text(fixture.timeWindow,"TIME_WINDOW",40);
  const payments=array(fixture.payments,"PAYMENTS",{min:1,max:50}).map(normalizePayment);
  const impacts=array(fixture.commitmentImpacts,"COMMITMENT_IMPACTS",{min:1,max:100}).map(normalizeImpact);
  const procurements=array(fixture.procurements,"PROCUREMENTS",{min:1,max:50}).map(normalizeProcurement);
  const bindings=array(fixture.strongBindings??[],"STRONG_BINDINGS",{max:100}).map(normalizeBinding);

  for(const [items,key,label] of [
    [payments,item=>item.documentCode,"PAYMENT"],
    [procurements,item=>item.recordKey,"PROCUREMENT"]
  ]){
    const keys=items.map(key);
    if(new Set(keys).size!==keys.length)throw new Error(`ARCA_FINANCIAL_CORRELATION_DUPLICATE_${label}`);
  }
  const impactKeys=impacts.map(item=>`${item.paymentDocumentCode}|${item.commitmentCode}|${item.subitem}`);
  if(new Set(impactKeys).size!==impactKeys.length)
    throw new Error("ARCA_FINANCIAL_CORRELATION_DUPLICATE_IMPACT");

  const paymentCodes=new Set(payments.map(item=>item.documentCode));
  for(const impact of impacts)
    if(!paymentCodes.has(impact.paymentDocumentCode))
      throw new Error("ARCA_FINANCIAL_CORRELATION_IMPACT_PAYMENT_NOT_FOUND");

  const commitments=new Set(impacts.map(item=>item.commitmentCode));
  const procurementKeys=new Set(procurements.map(item=>item.recordKey));
  for(const binding of bindings){
    if(!commitments.has(binding.commitmentCode))
      throw new Error("ARCA_FINANCIAL_CORRELATION_BINDING_COMMITMENT_NOT_FOUND");
    if(!procurementKeys.has(binding.procurementRecordKey))
      throw new Error("ARCA_FINANCIAL_CORRELATION_BINDING_PROCUREMENT_NOT_FOUND");
  }
  const bindingKeys=bindings.map(item=>`${item.commitmentCode}|${item.procurementRecordKey}`);
  if(new Set(bindingKeys).size!==bindingKeys.length)
    throw new Error("ARCA_FINANCIAL_CORRELATION_DUPLICATE_BINDING");

  return Object.freeze({pilotId,timeWindow,payments,impacts,procurements,bindings});
}

export function runFinancialCorrelationOffline({fixture,networkEnabled=false,publicationEnabled=false}={}){
  if(networkEnabled!==false)throw new Error("ARCA_FINANCIAL_CORRELATION_NETWORK_FORBIDDEN");
  if(publicationEnabled!==false)throw new Error("ARCA_FINANCIAL_CORRELATION_PUBLICATION_FORBIDDEN");
  const data=fixtureShape(fixture);
  const paymentsByCode=new Map(data.payments.map(item=>[item.documentCode,item]));
  const procurementsByKey=new Map(data.procurements.map(item=>[item.recordKey,item]));
  const impactsByCommitment=new Map();
  const impactsByPayment=new Map();
  for(const impact of data.impacts){
    const prior=impactsByCommitment.get(impact.commitmentCode)??[];
    prior.push(impact);impactsByCommitment.set(impact.commitmentCode,prior);
    const group=impactsByPayment.get(impact.paymentDocumentCode)??[];
    group.push(impact);impactsByPayment.set(impact.paymentDocumentCode,group);
  }

  const paymentCommitmentRelations=data.impacts
    .map(impact=>relation({
      kind:"PAYMENT_IMPACTS_COMMITMENT",
      fromRef:impact.paymentRef,
      toRef:impact.commitmentRef,
      state:"CONFIRMED",
      basis:"OFFICIAL_PAYMENT_IMPACT_RELATION_FIXTURE",
      provenanceRefs:impact.provenanceRefs,
      signals:{exactPaymentDocumentKey:true,exactCommitmentKey:true,sourceDeclaredRelationship:true},
      alternativeExplanations:[
        "The fixture confirms only the payment-to-commitment relationship represented by the source row.",
        "It does not prove procurement regularity, physical delivery, or final-beneficiary identity."
      ]
    }))
    .sort((a,b)=>a.relationId.localeCompare(b.relationId));

  const strongByProcurement=new Map();
  for(const binding of data.bindings){
    const list=strongByProcurement.get(binding.procurementRecordKey)??[];
    list.push(binding);strongByProcurement.set(binding.procurementRecordKey,list);
  }

  const procurementFinancialRelations=[];
  for(const procurement of data.procurements){
    const strong=strongByProcurement.get(procurement.recordKey)??[];
    if(strong.length){
      for(const binding of strong){
        const impacts=impactsByCommitment.get(binding.commitmentCode)??[];
        const payment=impacts.length?paymentsByCode.get(impacts[0].paymentDocumentCode):null;
        const provenance=[
          ...procurement.provenanceRefs,
          ...binding.provenanceRefs,
          ...impacts.flatMap(item=>item.provenanceRefs),
          ...(payment?.provenanceRefs??[]),
          procurement.agency.provenanceRef,
          procurement.supplier.provenanceRef,
          ...(payment?[payment.agency.provenanceRef,payment.beneficiary.provenanceRef]:[])
        ];
        const conflict=binding.conflictRefs.length>0;
        procurementFinancialRelations.push(relation({
          kind:"COMMITMENT_RELATES_TO_PROCUREMENT",
          fromRef:binding.commitmentRef,
          toRef:procurement.ref,
          state:conflict?"CONFLICTING":"CONFIRMED",
          basis:conflict?"EXPLICIT_BRIDGE_WITH_COUNTEREVIDENCE":binding.basis,
          provenanceRefs:[...new Set(provenance)],
          counterEvidenceRefs:binding.conflictRefs,
          signals:{
            explicitStrongBridge:true,
            agencyIdentifierMatch:payment?payment.agency.ref===procurement.agency.ref:null,
            supplierIdentifierMatch:payment?payment.beneficiary.ref===procurement.supplier.ref:null
          },
          temporalDistanceDays:payment?daysBetween(procurement.publishedAt,payment.issuedAt):null,
          alternativeExplanations:conflict
            ?[
              "Counterevidence conflicts with an otherwise explicit bridge and requires human resolution.",
              "No adverse conclusion is permitted while the relation is conflicting."
            ]
            :[
              "A confirmed documentary bridge does not establish that price, delivery, or conduct was regular.",
              "Payment beneficiary identity may differ from the ultimate beneficiary in some payment arrangements."
            ]
        }));
      }
      continue;
    }

    const candidates=[];
    for(const impact of data.impacts){
      const payment=paymentsByCode.get(impact.paymentDocumentCode);
      if(!payment)continue;
      const agencyMatch=payment.agency.ref===procurement.agency.ref;
      const supplierMatch=payment.beneficiary.ref===procurement.supplier.ref;
      const temporalDistance=daysBetween(procurement.publishedAt,payment.issuedAt);
      if(agencyMatch&&supplierMatch&&temporalDistance>=0&&temporalDistance<=730)
        candidates.push({impact,payment,temporalDistance});
    }

    if(candidates.length){
      for(const candidate of candidates){
        const provenance=[
          ...procurement.provenanceRefs,
          ...candidate.payment.provenanceRefs,
          ...candidate.impact.provenanceRefs,
          procurement.agency.provenanceRef,
          procurement.supplier.provenanceRef,
          candidate.payment.agency.provenanceRef,
          candidate.payment.beneficiary.provenanceRef
        ];
        procurementFinancialRelations.push(relation({
          kind:"COMMITMENT_RELATES_TO_PROCUREMENT",
          fromRef:candidate.impact.commitmentRef,
          toRef:procurement.ref,
          state:"CANDIDATE",
          basis:"MULTI_IDENTIFIER_MATCH_WITHOUT_EXPLICIT_BRIDGE",
          provenanceRefs:[...new Set(provenance)],
          signals:{explicitStrongBridge:false,agencyIdentifierMatch:true,supplierIdentifierMatch:true,amountUsedForIdentity:false,nameUsedForIdentity:false},
          temporalDistanceDays:candidate.temporalDistance,
          alternativeExplanations:[
            "The same public body and supplier may participate in multiple obligations.",
            "Temporal compatibility and entity identity do not prove that this commitment belongs to this procurement."
          ]
        }));
      }
    }else{
      procurementFinancialRelations.push(relation({
        kind:"PROCUREMENT_FINANCIAL_LINK",
        fromRef:procurement.ref,
        toRef:`financial-scope:sha256:${sha256({pilotId:data.pilotId,timeWindow:data.timeWindow})}`,
        state:"NOT_OBSERVED",
        basis:"NO_VERIFIABLE_FINANCIAL_LINK_IN_FIXTURE_SCOPE",
        provenanceRefs:[...procurement.provenanceRefs,procurement.agency.provenanceRef,procurement.supplier.provenanceRef],
        signals:{explicitStrongBridge:false,matchingCanonicalIdentifiers:false,nameOnlyMatchIgnored:true,amountOnlyMatchIgnored:true},
        alternativeExplanations:[
          "The financial source may be incomplete for this procurement or the relevant document may be outside the fixture scope.",
          "Absence of an observed link is not disappearance, diversion, or procurement irregularity."
        ]
      }));
    }
  }

  procurementFinancialRelations.sort((a,b)=>a.relationId.localeCompare(b.relationId));

  const stateCounts=Object.fromEntries([...RELATION_STATES].sort().map(state=>[
    state,procurementFinancialRelations.filter(item=>item.state===state).length
  ]));
  const multi=Array.from(impactsByPayment.values()).map(items=>items.length);
  const allocation=data.payments.map(payment=>{
    const impacts=impactsByPayment.get(payment.documentCode)??[];
    const impactedAmountCents=impacts.reduce((sum,item)=>sum+item.paidAmountCents,0);
    return Object.freeze({
      paymentRef:payment.ref,
      commitmentCount:impacts.length,
      paymentAmountCents:payment.amountCents,
      impactedAmountCents,
      deltaCents:payment.amountCents-impactedAmountCents,
      discrepancyIsNotIrregularity:true
    });
  }).sort((a,b)=>a.paymentRef.localeCompare(b.paymentRef));

  const reportBase={
    schema:FINANCIAL_CORRELATION_REPORT_SCHEMA,
    pilotId:data.pilotId,
    timeWindow:data.timeWindow,
    fixtureSha256:sha256(fixture),
    counts:{
      payments:data.payments.length,
      commitmentImpacts:data.impacts.length,
      procurements:data.procurements.length,
      strongBindings:data.bindings.length
    },
    oneToMany:{
      paymentsWithMultipleCommitments:multi.filter(count=>count>1).length,
      maximumCommitmentsPerPayment:Math.max(...multi)
    },
    paymentCommitmentRelations:Object.freeze(paymentCommitmentRelations),
    procurementFinancialRelations:Object.freeze(procurementFinancialRelations),
    relationStateCounts:Object.freeze(stateCounts),
    allocation:Object.freeze(allocation),
    network:{enabled:false,used:false},
    publication:{enabled:false,attempted:false},
    safety:{
      humanReviewRequired:true,
      adverseFinding:false,
      anomalyIsNotIrregularity:true,
      notObservedIsNotDisappearance:true,
      nameOrAmountAloneNeverConfirmsIdentity:true,
      confirmedRelationDoesNotProveRegularity:true
    }
  };
  return Object.freeze({...reportBase,reportSha256:sha256(canonicalJson(reportBase))});
}
