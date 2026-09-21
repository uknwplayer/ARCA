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
  return Object.freeze({
    agentId:"offline-provenance-analyst-v1",
    role:"PROVENANCE_ANALYST",
    inputDigest:context.inputDigest,
    assessment:"PROVENANCE_INTACT",
    evidenceRefs:Object.freeze(context.envelopes.map(item=>item.envelopeSha256)),
    observations:Object.freeze([
      `${context.envelopes.length} envelopes have source and content hashes`,
      `${context.gaps.length} source availability gaps remain explicit`
    ]),
    adverseFinding:false,humanReviewRequired:true
  });
}

function comparabilityAgent(context){
  return Object.freeze({
    agentId:"offline-comparability-analyst-v1",
    role:"COMPARABILITY_ANALYST",
    inputDigest:context.inputDigest,
    assessment:context.sourceIds.length<2?"SECOND_SOURCE_REQUIRED":"MULTISOURCE_COMPARISON_AVAILABLE",
    evidenceRefs:Object.freeze(context.envelopes.map(item=>item.envelopeSha256)),
    observations:Object.freeze([
      context.sourceIds.includes("br.pncp.public-api")
        ?"PNCP describes procurement records but does not prove payment or physical delivery"
        :"Portal payment fixture does not prove a procurement link or physical delivery",
      "No automated adverse conclusion is permitted from this offline gate"
    ]),
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

function adversarialVerify({reports,envelopes,gaps}){
  const provenanceComplete=reports.every(report=>report.evidenceRefs.every(ref=>envelopes.some(item=>item.envelopeSha256===ref)));
  const challenges=[
    {kind:"MISSING_PROVENANCE",critical:true,resolved:provenanceComplete,provenanceRefs:envelopes.map(item=>item.envelopeSha256)},
    {kind:"SOURCE_NOT_INDEPENDENT",critical:false,resolved:false,provenanceRefs:[],note:"Offline fixture does not prove cross-source correlation or a live finding"},
    ...gaps.map(gap=>({kind:"SOURCE_UNAVAILABLE_OR_STALE",critical:false,resolved:false,provenanceRefs:[],note:`${gap.uf}:${gap.reason}`}))
  ];
  const blocking=challenges.some(challenge=>challenge.critical&&!challenge.resolved);
  return Object.freeze({
    outcome:blocking?"HOLD_FOR_MORE_EVIDENCE":"ADVANCE_TO_HUMAN_REVIEW",
    challenges:Object.freeze(challenges.map(item=>Object.freeze(item))),
    counterEvidencePreserved:true,
    outcomeIsNotGuiltFinding:true,
    humanReviewRequired:true
  });
}

export async function runMultisourceOfflineGate({registry,fixture,queueRoot,adapters=[createOfflinePncpAdapter(),createOfflinePortalExpensesAdapter()],agents=createIndependentOfflineAgents(),networkEnabled=false,publicationEnabled=false,clock=()=>new Date()}={}){
  if(networkEnabled!==false)throw new Error("ARCA_MULTISOURCE_NETWORK_FORBIDDEN");
  if(publicationEnabled!==false)throw new Error("ARCA_MULTISOURCE_PUBLICATION_FORBIDDEN");
  if(!registry||registry.schema!=="arca.public-source-registry.v1")throw new Error("ARCA_MULTISOURCE_REGISTRY_REQUIRED");
  if(!fixture||fixture.schema!==MULTISOURCE_FIXTURE_SCHEMA)throw new Error("ARCA_MULTISOURCE_FIXTURE_REQUIRED");
  if(!queueRoot)throw new Error("ARCA_MULTISOURCE_QUEUE_ROOT_REQUIRED");
  const pilotId=text(fixture.pilotId,"PILOT_ID",128);
  const shards=fixture.shards;
  if(!Array.isArray(shards)||shards.length<1||shards.length>3)throw new Error("ARCA_MULTISOURCE_SHARD_BUDGET_EXCEEDED");
  const ufs=shards.map(shard=>validateUf(shard.uf));
  if(new Set(ufs).size!==ufs.length)throw new Error("ARCA_MULTISOURCE_DUPLICATE_UF");
  const adapterBySource=new Map(adapters.map(adapter=>[adapter.sourceId,adapter]));
  const requestedSourceIds=[...new Set(shards.map(shard=>text(shard.sourceId,"SOURCE_ID",160)))].sort();
  const results=[];
  for(const shard of shards){
    const source=registry.get(shard.sourceId);
    if(!source)throw new Error("ARCA_MULTISOURCE_UNKNOWN_SOURCE");
    const adapter=adapterBySource.get(source.id);
    if(!adapter)throw new Error("ARCA_MULTISOURCE_ADAPTER_NOT_IMPLEMENTED");
    results.push(await adapter.collect({source,shard:deepFreeze(clone(shard))}));
  }
  const byKey=new Map();
  for(const result of results)for(const envelope of result.records){
    const key=`${envelope.sourceId}:${envelope.recordKey}`;
    const previous=byKey.get(key);
    if(previous&&previous.normalizedSha256!==envelope.normalizedSha256)throw new Error("ARCA_MULTISOURCE_DUPLICATE_RECORD_CONFLICT");
    if(!previous)byKey.set(key,envelope);
  }
  const envelopes=[...byKey.values()].sort((a,b)=>a.recordKey.localeCompare(b.recordKey));
  const gaps=results.filter(result=>result.gap).map(result=>Object.freeze({uf:result.uf,...result.gap}));
  const inputDigest=sha256({pilotId,requestedSourceIds,ufs,envelopes:envelopes.map(item=>item.envelopeSha256),gaps});
  const agentContext=deepFreeze({pilotId,inputDigest,sourceIds:requestedSourceIds,envelopes:clone(envelopes),gaps:clone(gaps)});
  const reports=runIndependentAgents(agents,agentContext);
  const verification=adversarialVerify({reports,envelopes,gaps});

  const queue=createDurableInvestigationQueue({root:queueRoot,clock});
  const request=queue.request({
    scope:{
      jurisdiction:"BR/NATIONAL",subjectRef:`multisource-pilot:${pilotId}`,
      topic:"national-public-data-multisource-pilot",timeWindow:text(fixture.timeWindow,"TIME_WINDOW",80),
      sourceScopes:requestedSourceIds
    },
    triggerKind:"SCHEDULED_REVIEW",triggerRef:`offline-gate:${pilotId}:${inputDigest}`,priority:50
  });
  let record=request.record;
  for(const state of ["TRIAGE","COLLECTION","ANALYSIS","ADVERSARIAL_VERIFICATION"])
    record=queue.transition(record.investigationId,state);
  if(verification.outcome==="ADVANCE_TO_HUMAN_REVIEW")record=queue.transition(record.investigationId,"HUMAN_REVIEW");

  const reportBase={
    schema:MULTISOURCE_OFFLINE_GATE_SCHEMA,pilotId,inputDigest,
    coverage:{country:"BR",requestedUfs:ufs,availableUfs:results.filter(item=>item.status==="AVAILABLE").map(item=>item.uf),unavailableUfs:gaps.map(item=>item.uf),municipalityDefault:null},
    sources:{requested:requestedSourceIds,executable:registry.executable().map(source=>source.id),declaredOnly:registry.sources.filter(source=>source.adapterStatus==="DECLARED_ONLY").map(source=>source.id)},
    evidence:{receivedCount:results.reduce((sum,item)=>sum+item.records.length,0),deduplicatedCount:envelopes.length,envelopes},
    gaps,reports,verification,
    investigation:{investigationId:record.investigationId,state:record.state,deduplicated:request.created===false},
    network:{enabled:false,used:false},
    publication:{enabled:false,attempted:false},
    safety:{anomalyIsNotIrregularity:true,adverseFinding:false,humanReviewRequired:true,sourceFailureCreatesSuspicion:false}
  };
  return Object.freeze({...reportBase,reportSha256:sha256(canonicalJson(reportBase))});
}

export function defaultMultisourcePaths(root=process.cwd()){
  return Object.freeze({
    registry:path.join(root,"config","public-source-registry-v1.json"),
    fixture:path.join(root,"examples","multisource-offline-fixtures","pncp-three-uf-v1.json")
  });
}
