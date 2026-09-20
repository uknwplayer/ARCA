import {CapabilityRegistry} from "./capability-registry.ts";

export const ARCA_CAPABILITY_GAP_REPORT_FORMAT="arca-capability-gap-report-v1";
export const ARCA_CAPABILITY_PLAN_FORMAT="arca-capability-plan-v1";

const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;

function plainObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function text(value,field,max,{required=true}={}){const normalized=String(value??"").trim();if(required&&!normalized)throw new TypeError(`${field} obrigatorio`);if(normalized.length>max)throw new RangeError(`${field} excede ${max} caracteres`);return normalized}
function identifier(value,field){const normalized=text(value,field,120);if(!IDENTIFIER.test(normalized))throw new TypeError(`${field} invalido`);return normalized}
function unique(values,field,{lowercase=false}={}){if(!Array.isArray(values))throw new TypeError(`${field} deve ser array`);return [...new Set(values.map(value=>{const item=identifier(value,field);return lowercase?item.toLowerCase():item}))].sort()}
function isoTimestamp(value=new Date().toISOString()){const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new TypeError("timestamp invalido");return parsed.toISOString()}

function capabilityObservations(registry,capabilityId){
  const rows=[];
  for(const passport of registry.listPassports()){
    const capability=passport.capabilities.find(item=>item.id===capabilityId);
    if(capability)rows.push({participantId:passport.participantId,kind:passport.kind,provider:passport.provider,model:passport.model,status:capability.status,version:capability.version,riskClass:capability.riskClass});
  }
  return rows.sort((a,b)=>a.participantId.localeCompare(b.participantId));
}
function gapType(rows){
  const statuses=new Set(rows.map(row=>row.status));
  if(statuses.has("verified"))return null;
  if(statuses.has("verification-needed"))return "verification-needed";
  if(statuses.has("degraded"))return "degraded";
  if(statuses.has("declared"))return "unverified";
  if(statuses.has("unknown"))return "unknown";
  if(statuses.has("unavailable"))return "unavailable";
  return "missing";
}

export function detectCapabilityGaps(capabilityRegistry,requiredCapabilities=[],options={}){
  if(!(capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
  const required=unique(requiredCapabilities,"requiredCapabilities",{lowercase:true});
  const available=[];
  const gaps=[];
  for(const capabilityId of required){
    const observations=capabilityObservations(capabilityRegistry,capabilityId);
    const verified=observations.filter(row=>row.status==="verified");
    if(verified.length){available.push({capabilityId,participantIds:verified.map(row=>row.participantId),observations});continue}
    gaps.push({capabilityId,type:gapType(observations),observations});
  }
  return Object.freeze({
    format:ARCA_CAPABILITY_GAP_REPORT_FORMAT,
    generatedAt:isoTimestamp(options.generatedAt),
    requiredCapabilities:required,
    available,
    gaps,
    blocked:gaps.length>0,
    authorizationIncluded:false,
    executionPerformed:false
  });
}

function normalizeSteps(input){
  if(!Array.isArray(input)||!input.length)throw new TypeError("steps deve ser array nao vazio");
  const steps=input.map((raw,index)=>{
    if(!plainObject(raw))throw new TypeError(`steps[${index}] invalido`);
    const stepId=identifier(raw.stepId??`step-${index+1}`,`steps[${index}].stepId`);
    const capabilityId=identifier(raw.capabilityId??raw.capability,`steps[${index}].capabilityId`).toLowerCase();
    const dependsOn=raw.dependsOn==null?[]:unique(raw.dependsOn,`steps[${index}].dependsOn`);
    return {stepId,capabilityId,dependsOn,optional:raw.optional===true};
  });
  const ids=new Set();
  for(const step of steps){if(ids.has(step.stepId))throw new Error(`step duplicado: ${step.stepId}`);ids.add(step.stepId)}
  for(const step of steps)for(const dep of step.dependsOn){if(dep===step.stepId)throw new Error(`step nao pode depender de si mesmo: ${step.stepId}`);if(!ids.has(dep))throw new Error(`dependencia desconhecida ${dep} em ${step.stepId}`)}
  const visiting=new Set();const visited=new Set();const byId=new Map(steps.map(step=>[step.stepId,step]));
  function visit(id){if(visited.has(id))return;if(visiting.has(id))throw new Error(`ciclo de dependencias detectado em ${id}`);visiting.add(id);for(const dep of byId.get(id).dependsOn)visit(dep);visiting.delete(id);visited.add(id)}
  for(const step of steps)visit(step.stepId);
  return steps;
}

export function buildCapabilityPlan(capabilityRegistry,input={},options={}){
  if(!(capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
  if(!plainObject(input))throw new TypeError("plan input invalido");
  const taskId=identifier(input.taskId??"capability-plan","taskId");
  const steps=normalizeSteps(input.steps);
  const allowDeclaredForPlanning=options.allowDeclaredForPlanning===true;
  const plannedSteps=steps.map(step=>{
    const verified=capabilityRegistry.findCompatible([step.capabilityId]);
    if(verified.length)return {...step,status:"ready",candidateParticipantIds:verified.map(item=>item.participantId),gap:null};
    const observations=capabilityObservations(capabilityRegistry,step.capabilityId);
    const declared=allowDeclaredForPlanning?observations.filter(row=>row.status==="declared").map(row=>row.participantId):[];
    const type=gapType(observations);
    if(declared.length)return {...step,status:"needs-verification",candidateParticipantIds:declared,gap:{type:"unverified",observations}};
    return {...step,status:step.optional?"optional-gap":"blocked",candidateParticipantIds:[],gap:{type,observations}};
  });
  const requiredCapabilities=[...new Set(plannedSteps.filter(step=>!step.optional).map(step=>step.capabilityId))].sort();
  const blockedSteps=plannedSteps.filter(step=>step.status==="blocked");
  const verificationSteps=plannedSteps.filter(step=>step.status==="needs-verification");
  const status=blockedSteps.length?"blocked":verificationSteps.length?"verification-needed":"ready";
  return Object.freeze({
    format:ARCA_CAPABILITY_PLAN_FORMAT,
    taskId,
    generatedAt:isoTimestamp(options.generatedAt),
    status,
    requiredCapabilities,
    steps:clone(plannedSteps),
    missingCapabilities:[...new Set(blockedSteps.map(step=>step.capabilityId))].sort(),
    verificationNeeded:[...new Set(verificationSteps.map(step=>step.capabilityId))].sort(),
    authorizationIncluded:false,
    executionPerformed:false,
    schedulerSelectionPerformed:false,
    humanReviewRequired:true
  });
}
