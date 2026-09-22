import fs from "node:fs";
import path from "node:path";
import {
  canonicalJson,
  createEvidenceEnvelope,
  createPublicSourceRegistry,
  sha256
} from "./public-source-contract.mjs";
import {createDurableInvestigationQueue} from "../machine-bridge/investigation-queue.mjs";
import {createOfflinePortalExpensesAdapter} from "./portal-expenses-offline-adapter.mjs";
import {FINANCIAL_CORRELATION_REPORT_SCHEMA} from "./financial-correlation-offline.mjs";

export const MULTISOURCE_OFFLINE_GATE_SCHEMA="arca.multisource-offline-gate.v1";
export const MULTISOURCE_FIXTURE_SCHEMA="arca.multisource-offline-fixture.v1";

const UF_CODES=new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
]);

function clone(value){return JSON.parse(JSON.stringify(value))}
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
  }
  return value;
}
function text(value,field,max=256){
  const normalized=String(value??"").normalize("NFKC").trim();
  if(!normalized||normalized.length>max||/[\u0000-\u001f\u007f]/.test(normalized))throw new Error(`ARCA_MULTISOURCE_INVALID_${field}`);
  return normalized;
}
function validateUf(value){
  const uf=text(value,"UF",2).toUpperCase();
  if(!UF_CODES.has(uf))throw new Error("ARCA_MULTISOURCE_INVALID_UF");
  return uf;
}
function bindCorrelationToEvidence(report,envelopes){
  const paymentEvidence=new Map();
  const procurementEvidence=new Map();
  const commitmentEvidence=new Map();
  const pairEvidence=new Map();
  const paymentsByCommitment=new Map();

  const add=(map,key,value)=>{
    const set=map.get(key)??new Set();
    set.add(value);map.set(key,set);
  };

  for(const envelope of envelopes){
    if(envelope.sourceId==="br.portal-transparencia.download-despesas"){
      const payment=/^portal-payment:([^:]+)$/.exec(envelope.recordKey);
      if(payment){
        paymentEvidence.set(`payment:sha256:${sha256(payment[1])}`,envelope.envelopeSha256);
        continue;
      }
      const impact=/^portal-payment-impact:([^:]+):([^:]+):([^:]+)$/.exec(envelope.recordKey);
      if(impact){
        const paymentRef=`payment:sha256:${sha256(impact[1])}`;
        const commitmentRef=`commitment:sha256:${sha256(impact[2])}`;
        add(commitmentEvidence,commitmentRef,envelope.envelopeSha256);
        add(pairEvidence,`${paymentRef}|${commitmentRef}`,envelope.envelopeSha256);
        add(paymentsByCommitment,commitmentRef,paymentRef);
      }
    }else if(envelope.sourceId==="br.pncp.public-api"){
      procurementEvidence.set(`procurement:sha256:${sha256(envelope.recordKey)}`,envelope.envelopeSha256);
    }
  }

  const bindings=[];
  for(const relation of report.paymentCommitmentRelations??[]){
    const paymentEnvelope=paymentEvidence.get(relation.fromRef);
    const impactEnvelopes=pairEvidence.get(`${relation.fromRef}|${relation.toRef}`);
    if(!paymentEnvelope||!impactEnvelopes?.size)
      throw new Error("ARCA_MULTISOURCE_CORRELATION_EVIDENCE_BINDING_MISSING");
    bindings.push(Object.freeze({
      relationId:relation.relationId,
      evidenceEnvelopeRefs:Object.freeze([...new Set([paymentEnvelope,...impactEnvelopes])].sort())
    }));
  }

  for(const relation of report.procurementFinancialRelations??[]){
    const refs=[];
    if(relation.state==="NOT_OBSERVED"){
      const procurementEnvelope=procurementEvidence.get(relation.fromRef);
      if(!procurementEnvelope)throw new Error("ARCA_MULTISOURCE_CORRELATION_EVIDENCE_BINDING_MISSING");
      refs.push(procurementEnvelope);
    }else{
      const commitmentEnvelopes=commitmentEvidence.get(relation.fromRef);
      const procurementEnvelope=procurementEvidence.get(relation.toRef);
      if(!commitmentEnvelopes?.size||!procurementEnvelope)
        throw new Error("ARCA_MULTISOURCE_CORRELATION_EVIDENCE_BINDING_MISSING");
      refs.push(...commitmentEnvelopes,procurementEnvelope);
      for(const paymentRef of paymentsByCommitment.get(relation.fromRef)??[]){
        const paymentEnvelope=paymentEvidence.get(paymentRef);
        if(!paymentEnvelope)throw new Error("ARCA_MULTISOURCE_CORRELATION_EVIDENCE_BINDING_MISSING");
        refs.push(paymentEnvelope);
      }
    }
    bindings.push(Object.freeze({
      relationId:relation.relationId,
      evidenceEnvelopeRefs:Object.freeze([...new Set(refs)].sort())
    }));
  }

  const expected=(report.paymentCommitmentRelations?.length??0)+(report.procurementFinancialRelations?.length??0);
  if(bindings.length!==expected||new Set(bindings.map(item=>item.relationId)).size!==expected)
    throw new Error("ARCA_MULTISOURCE_CORRELATION_EVIDENCE_BINDING_INCOMPLETE");
  const sorted=bindings.sort((a,b)=>a.relationId.localeCompare(b.relationId));
  return Object.freeze({
    boundRelationCount:sorted.length,
    bindings:Object.freeze(sorted),
    bindingSha256:sha256(sorted)
  });
}

function correlationSummary(report,envelopes){
  if(report===null||report===undefined)return null;
  if(report?.schema!==FINANCIAL_CORRELATION_REPORT_SCHEMA)
    throw new Error("ARCA_MULTISOURCE_CORRELATION_SCHEMA_INVALID");
  if(!/^[0-9a-f]{64}$/.test(String(report.reportSha256??"")))
    throw new Error("ARCA_MULTISOURCE_CORRELATION_HASH_INVALID");
  if(report.network?.used!==false||report.publication?.attempted!==false||
     report.safety?.humanReviewRequired!==true||report.safety?.adverseFinding!==false||
     report.safety?.notObservedIsNotDisappearance!==true)
    throw new Error("ARCA_MULTISOURCE_CORRELATION_SAFETY_INVALID");
  if(!Array.isArray(report.procurementFinancialRelations)||!Array.isArray(report.paymentCommitmentRelations))
    throw new Error("ARCA_MULTISOURCE_CORRELATION_RELATIONS_INVALID");
  const states={CANDIDATE:0,CONFIRMED:0,CONFLICTING:0,NOT_OBSERVED:0};
  for(const relation of report.procurementFinancialRelations){
    if(!(relation?.state in states)||relation.humanReviewRequired!==true||
       relation.adverseFinding!==false||!Array.isArray(relation.provenanceRefs)||
       relation.provenanceRefs.length<1)
      throw new Error("ARCA_MULTISOURCE_CORRELATION_RELATION_INVALID");
    states[relation.state]+=1;
  }
  for(const [state,count] of Object.entries(states))
    if(Number(report.relationStateCounts?.[state]??-1)!==count)
      throw new Error("ARCA_MULTISOURCE_CORRELATION_STATE_COUNT_MISMATCH");
  const evidenceBinding=bindCorrelationToEvidence(report,envelopes);
  return Object.freeze({
    schema:"arca.multisource-correlation-summary.v1",
    reportSha256:report.reportSha256,
    relationCount:report.procurementFinancialRelations.length,
    paymentCommitmentRelationCount:report.paymentCommitmentRelations.length,
    relationStateCounts:Object.freeze(states),
    oneToMany:Object.freeze({
      paymentsWithMultipleCommitments:Number(report.oneToMany?.paymentsWithMultipleCommitments??0),
      maximumCommitmentsPerPayment:Number(report.oneToMany?.maximumCommitmentsPerPayment??0)
    }),
    evidenceBinding,
    humanReviewRequired:true,
    adverseFinding:false
  });
}
function advanceQueueRecord(queue,record,targetState){
  const chain=["LEAD","TRIAGE","COLLECTION","ANALYSIS","ADVERSARIAL_VERIFICATION","HUMAN_REVIEW"];
  const current=chain.indexOf(record.state),target=chain.indexOf(targetState);
  if(current<0||target<0||current>target)
    throw new Error("ARCA_MULTISOURCE_EXISTING_STATE_UNSAFE");
  let next=record;
  for(let index=current+1;index<=target;index++)
    next=queue.transition(next.investigationId,chain[index]);
  return next;
}

export function loadPublicSourceRegistry(file){return createPublicSourceRegistry(JSON.parse(fs.readFileSync(file,"utf8")))}
export function loadOfflineFixture(file){
  const fixture=JSON.parse(fs.readFileSync(file,"utf8"));
  if(fixture.schema!==MULTISOURCE_FIXTURE_SCHEMA)throw new Error("ARCA_MULTISOURCE_FIXTURE_SCHEMA_INVALID");
  return fixture;
}

export function createOfflinePncpAdapter(){
  return Object.freeze({
    sourceId:"br.pncp.public-api",
    mode:"OFFLINE_FIXTURE",
    async collect({source,shard}){
      if(source.id!==this.sourceId||source.adapterStatus!=="ACTIVE"||!source.executableModes.includes(this.mode))
        throw new Error("ARCA_MULTISOURCE_ADAPTER_SOURCE_MISMATCH");
      const uf=validateUf(shard.uf);
      if(shard.status==="SOURCE_UNAVAILABLE"){
        return Object.freeze({uf,status:"SOURCE_UNAVAILABLE",records:Object.freeze([]),gap:Object.freeze({
          category:"SOURCE_UNAVAILABLE",reason:text(shard.reason,"UNAVAILABLE_REASON",160),suspicion:false
        })});
      }
      if(shard.status!=="AVAILABLE"||!Array.isArray(shard.records))throw new Error("ARCA_MULTISOURCE_INVALID_SHARD_STATUS");
      const records=shard.records.map(record=>{
        const raw=clone(record);
        const normalized={
          format:"arca-pncp-offline-normalized-v1",
          recordKey:text(record.recordKey,"RECORD_KEY"),
          uf,
          orgaoRef:text(record.orgaoRef,"ORGAO_REF"),
          year:Number(record.year),
          sequential:Number(record.sequential),
          modalityId:Number(record.modalityId),
          estimatedValue:Number(record.estimatedValue),
          municipalityCode:record.municipalityCode??null
        };
        if(!Number.isSafeInteger(normalized.year)||!Number.isSafeInteger(normalized.sequential)||!Number.isFinite(normalized.estimatedValue))
          throw new Error("ARCA_MULTISOURCE_INVALID_PNCP_NUMERIC_FIELD");
        return createEvidenceEnvelope({
          source,rawRecord:raw,normalizedRecord:normalized,recordKey:normalized.recordKey,
          sourceUrl:record.sourceUrl,acquiredAt:record.retrievedAt,
          transformations:["pncp-offline-normalizer-v1"],
          coverage:{
            jurisdiction:`BR/UF/${uf}`,
            municipalityCode:normalized.municipalityCode,
            temporal:String(normalized.year),
            fields:["estimatedValue","modalityId","orgaoRef","recordKey","sequential","uf","year"],
            knownGaps:["payment-execution-not-provided","physical-delivery-not-provided"]
          }
        });
      });
      return Object.freeze({uf,status:"AVAILABLE",records:Object.freeze(records),gap:null});
    }
  });
}

function provenanceAgent(context){
  const observations=[
    `${context.envelopes.length} envelopes have source and content hashes`,
    `${context.gaps.length} source availability gaps remain explicit`
  ];
  if(context.correlation)
    observations.push(`${context.correlation.relationCount} sanitized cross-source relations preserve provenance`);
  return Object.freeze({
    agentId:"offline-provenance-analyst-v1",
    role:"PROVENANCE_ANALYST",
    inputDigest:context.inputDigest,
    assessment:"PROVENANCE_INTACT",
    evidenceRefs:Object.freeze(context.envelopes.map(item=>item.envelopeSha256)),
    observations:Object.freeze(observations),
    adverseFinding:false,humanReviewRequired:true
  });
}

function comparabilityAgent(context){
  const assessment=context.sourceIds.length<2
    ?"SECOND_SOURCE_REQUIRED"
    :context.correlation?"CROSS_SOURCE_CORRELATION_AVAILABLE":"MULTISOURCE_COMPARISON_AVAILABLE";
  const observations=[
    context.sourceIds.includes("br.pncp.public-api")
      ?"PNCP describes procurement records but does not prove payment or physical delivery"
      :"Portal payment fixture does not prove a procurement link or physical delivery",
    "No automated adverse conclusion is permitted from this offline gate"
  ];
  if(context.correlation){
    const states=context.correlation.relationStateCounts;
    observations.push(`correlation states confirmed=${states.CONFIRMED} candidate=${states.CANDIDATE} conflicting=${states.CONFLICTING} notObserved=${states.NOT_OBSERVED}`);
  }
  return Object.freeze({
    agentId:"offline-comparability-analyst-v1",
    role:"COMPARABILITY_ANALYST",
    inputDigest:context.inputDigest,
    assessment,
    evidenceRefs:Object.freeze(context.envelopes.map(item=>item.envelopeSha256)),
    observations:Object.freeze(observations),
    adverseFinding:false,humanReviewRequired:true
  });
}

export function createIndependentOfflineAgents(){return Object.freeze([provenanceAgent,comparabilityAgent])}

function runIndependentAgents(agents,context){
  if(!Array.isArray(agents)||agents.length<2)throw new Error("ARCA_MULTISOURCE_TWO_AGENTS_REQUIRED");
  const reports=agents.map(agent=>{
    if(typeof agent!=="function")throw new Error("ARCA_MULTISOURCE_INVALID_AGENT");
    return agent(deepFreeze(clone(context)));
  });
  const ids=reports.map(report=>text(report.agentId,"AGENT_ID",128));
  const roles=reports.map(report=>text(report.role,"AGENT_ROLE",128));
  if(new Set(ids).size!==reports.length||new Set(roles).size!==reports.length)throw new Error("ARCA_MULTISOURCE_AGENTS_NOT_INDEPENDENT");
  if(reports.some(report=>report.inputDigest!==context.inputDigest))throw new Error("ARCA_MULTISOURCE_AGENT_INPUT_DIGEST_MISMATCH");
  if(reports.some(report=>report.adverseFinding!==false||report.humanReviewRequired!==true))throw new Error("ARCA_MULTISOURCE_UNSAFE_AGENT_REPORT");
  return Object.freeze(reports);
}

function adversarialVerify({reports,envelopes,gaps,correlation=null}){
  const provenanceComplete=reports.every(report=>report.evidenceRefs.every(ref=>envelopes.some(item=>item.envelopeSha256===ref)));
  const challenges=[
    {kind:"MISSING_PROVENANCE",critical:true,resolved:provenanceComplete,provenanceRefs:envelopes.map(item=>item.envelopeSha256)},
    correlation
      ?{kind:"CROSS_SOURCE_CORRELATION_IS_OFFLINE",critical:false,resolved:false,provenanceRefs:[correlation.reportSha256],note:"Synthetic correlation does not establish a live finding"}
      :{kind:"SOURCE_NOT_INDEPENDENT",critical:false,resolved:false,provenanceRefs:[],note:"Offline fixture does not prove cross-source correlation or a live finding"},
    ...gaps.map(gap=>({kind:"SOURCE_UNAVAILABLE_OR_STALE",critical:false,resolved:false,provenanceRefs:[],note:`${gap.uf}:${gap.reason}`}))
  ];
  if(correlation?.relationStateCounts.CONFLICTING>0)
    challenges.push({kind:"CROSS_SOURCE_CONFLICT_PRESERVED",critical:false,resolved:false,provenanceRefs:[correlation.reportSha256],note:"Conflicting relation remains unresolved for human review"});
  if(correlation?.relationStateCounts.NOT_OBSERVED>0)
    challenges.push({kind:"CROSS_SOURCE_NOT_OBSERVED_PRESERVED",critical:false,resolved:false,provenanceRefs:[correlation.reportSha256],note:"Not observed remains a coverage gap, not a disappearance finding"});
  const blocking=challenges.some(challenge=>challenge.critical&&!challenge.resolved);
  return Object.freeze({
    outcome:blocking?"HOLD_FOR_MORE_EVIDENCE":"ADVANCE_TO_HUMAN_REVIEW",
    challenges:Object.freeze(challenges.map(item=>Object.freeze(item))),
    counterEvidencePreserved:true,
    outcomeIsNotGuiltFinding:true,
    humanReviewRequired:true
  });
}

export async function runMultisourceOfflineGate({registry,fixture,queueRoot,adapters=[createOfflinePncpAdapter(),createOfflinePortalExpensesAdapter()],agents=createIndependentOfflineAgents(),correlationReport=null,triggerKind="SCHEDULED_REVIEW",triggerRef=null,participantRef=null,networkEnabled=false,publicationEnabled=false,clock=()=>new Date()}={}){
  if(networkEnabled!==false)throw new Error("ARCA_MULTISOURCE_NETWORK_FORBIDDEN");
  if(publicationEnabled!==false)throw new Error("ARCA_MULTISOURCE_PUBLICATION_FORBIDDEN");
  if(!registry||registry.schema!=="arca.public-source-registry.v1")throw new Error("ARCA_MULTISOURCE_REGISTRY_REQUIRED");
  if(!fixture||fixture.schema!==MULTISOURCE_FIXTURE_SCHEMA)throw new Error("ARCA_MULTISOURCE_FIXTURE_REQUIRED");
  if(!queueRoot)throw new Error("ARCA_MULTISOURCE_QUEUE_ROOT_REQUIRED");
  const pilotId=text(fixture.pilotId,"PILOT_ID",128);
  const shards=fixture.shards;
  if(!Array.isArray(shards)||shards.length<1||shards.length>6)throw new Error("ARCA_MULTISOURCE_SHARD_BUDGET_EXCEEDED");
  const shardUfs=shards.map(shard=>validateUf(shard.uf));
  const ufs=[...new Set(shardUfs)];
  if(ufs.length>3)throw new Error("ARCA_MULTISOURCE_UF_BUDGET_EXCEEDED");
  const shardKeys=shards.map((shard,index)=>`${text(shard.sourceId,"SOURCE_ID",160)}|${shardUfs[index]}`);
  if(new Set(shardKeys).size!==shardKeys.length)throw new Error("ARCA_MULTISOURCE_DUPLICATE_SOURCE_UF");
  const adapterBySource=new Map(adapters.map(adapter=>[adapter.sourceId,adapter]));
  const requestedSourceIds=[...new Set(shards.map(shard=>text(shard.sourceId,"SOURCE_ID",160)))].sort();
  const results=[];
  for(const shard of shards){
    const source=registry.get(shard.sourceId);
    if(!source)throw new Error("ARCA_MULTISOURCE_UNKNOWN_SOURCE");
    const adapter=adapterBySource.get(source.id);
    if(!adapter)throw new Error("ARCA_MULTISOURCE_ADAPTER_NOT_IMPLEMENTED");
    const collected=await adapter.collect({source,shard:deepFreeze(clone(shard))});
    results.push(Object.freeze({sourceId:source.id,...collected}));
  }
  const byKey=new Map();
  for(const result of results)for(const envelope of result.records){
    const key=`${envelope.sourceId}:${envelope.recordKey}`;
    const previous=byKey.get(key);
    if(previous&&previous.normalizedSha256!==envelope.normalizedSha256)throw new Error("ARCA_MULTISOURCE_DUPLICATE_RECORD_CONFLICT");
    if(!previous)byKey.set(key,envelope);
  }
  const envelopes=[...byKey.values()].sort((a,b)=>a.recordKey.localeCompare(b.recordKey));
  const correlation=correlationSummary(correlationReport,envelopes);
  const multiSource=requestedSourceIds.length>1;
  const gaps=results.filter(result=>result.gap).map(result=>Object.freeze(multiSource
    ?{sourceId:result.sourceId,uf:result.uf,...result.gap}
    :{uf:result.uf,...result.gap}));
  const digestBody={pilotId,requestedSourceIds,ufs,envelopes:envelopes.map(item=>item.envelopeSha256),gaps};
  if(correlation)digestBody.correlationReportSha256=correlation.reportSha256;
  const inputDigest=sha256(digestBody);
  const contextBase={pilotId,inputDigest,sourceIds:requestedSourceIds,envelopes:clone(envelopes),gaps:clone(gaps)};
  if(correlation)contextBase.correlation=clone(correlation);
  const agentContext=deepFreeze(contextBase);
  const reports=runIndependentAgents(agents,agentContext);
  const verification=adversarialVerify({reports,envelopes,gaps,correlation});

  const queue=createDurableInvestigationQueue({root:queueRoot,clock});
  const request=queue.request({
    scope:{
      jurisdiction:"BR/NATIONAL",subjectRef:`multisource-pilot:${pilotId}`,
      topic:"national-public-data-multisource-pilot",timeWindow:text(fixture.timeWindow,"TIME_WINDOW",80),
      sourceScopes:requestedSourceIds
    },
    triggerKind,
    triggerRef:triggerRef??`offline-gate:${pilotId}:${inputDigest}`,
    participantRef,
    priority:50
  });
  const targetState=verification.outcome==="ADVANCE_TO_HUMAN_REVIEW"?"HUMAN_REVIEW":"ADVERSARIAL_VERIFICATION";
  const record=advanceQueueRecord(queue,request.record,targetState);

  const coverage={
    country:"BR",
    requestedUfs:ufs,
    availableUfs:[...new Set(results.filter(item=>item.status==="AVAILABLE").map(item=>item.uf))],
    unavailableUfs:[...new Set(gaps.map(item=>item.uf))],
    municipalityDefault:null
  };
  if(multiSource)coverage.availabilityBySource=Object.fromEntries(requestedSourceIds.map(sourceId=>[
    sourceId,Object.freeze({
      availableUfs:[...new Set(results.filter(item=>item.sourceId===sourceId&&item.status==="AVAILABLE").map(item=>item.uf))],
      unavailableUfs:[...new Set(results.filter(item=>item.sourceId===sourceId&&item.status==="SOURCE_UNAVAILABLE").map(item=>item.uf))]
    })
  ]));
  const reportBase={
    schema:MULTISOURCE_OFFLINE_GATE_SCHEMA,pilotId,inputDigest,
    coverage,
    sources:{requested:requestedSourceIds,executable:registry.executable().map(source=>source.id),declaredOnly:registry.sources.filter(source=>source.adapterStatus==="DECLARED_ONLY").map(source=>source.id)},
    evidence:{receivedCount:results.reduce((sum,item)=>sum+item.records.length,0),deduplicatedCount:envelopes.length,envelopes},
    gaps,reports,verification,
    investigation:{investigationId:record.investigationId,state:record.state,deduplicated:request.created===false},
    network:{enabled:false,used:false},
    publication:{enabled:false,attempted:false},
    safety:{anomalyIsNotIrregularity:true,adverseFinding:false,humanReviewRequired:true,sourceFailureCreatesSuspicion:false}
  };
  if(correlation)reportBase.correlation=correlation;
  return Object.freeze({...reportBase,reportSha256:sha256(canonicalJson(reportBase))});
}

export function defaultMultisourcePaths(root=process.cwd()){
  return Object.freeze({
    registry:path.join(root,"config","public-source-registry-v1.json"),
    fixture:path.join(root,"examples","multisource-offline-fixtures","pncp-three-uf-v1.json")
  });
}
