const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const CAPABILITY_MAX=160;
const MAX_OBJECTIVE=12000;
const MAX_TEXT=12000;
const MAX_SOURCE_REF=2000;
const MAX_DIGEST=512;
const MAX_CLAIMS=128;
const MAX_EVIDENCE=128;
const MAX_UNCERTAINTIES=64;
const MAX_FOLLOWUPS=32;

export const MEGA_BRAIN_TASK_FORMAT="arca-mega-brain-task-v1";
export const MEGA_BRAIN_DISPATCH_RESULT_FORMAT="arca-mega-brain-dispatch-result-v1";
export const MEGA_BRAIN_DISPATCH_ACTION="mega-brain.dispatch";
export const MEGA_BRAIN_TASK_CAPABILITY="mega-brain-task";

function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function exactKeys(value,allowed,label){
  for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`${label} contains unsupported field: ${key}`);
}
function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error(`invalid ${label}`);
  return value;
}
function boundedText(value,label,max=MAX_TEXT){
  if(typeof value!=="string"||!value.trim()||value.length>max)throw new Error(`invalid ${label}`);
  return value;
}
function stringArray(value,label,{maxItems=64,maxLength=CAPABILITY_MAX,safeIds=false}={}){
  if(!Array.isArray(value)||value.length>maxItems)throw new Error(`invalid ${label}`);
  const out=[];
  const seen=new Set();
  for(const raw of value){
    if(typeof raw!=="string"||!raw.trim()||raw.length>maxLength)throw new Error(`invalid ${label}`);
    const normalized=raw.trim();
    if(safeIds&&!SAFE_ID.test(normalized))throw new Error(`invalid ${label}`);
    if(seen.has(normalized))throw new Error(`duplicate ${label}: ${normalized}`);
    seen.add(normalized);out.push(normalized);
  }
  return Object.freeze(out.sort());
}

export function normalizeMegaBrainTask(value){
  if(!plain(value))throw new TypeError("mega brain task object required");
  exactKeys(value,new Set([
    "format","version","missionId","taskId","objective","requiredCapabilities",
    "dependencies","assignedNodeId","createdFromResultId"
  ]),"mega brain task");
  if(value.format!==MEGA_BRAIN_TASK_FORMAT||value.version!==1)throw new Error("unsupported mega brain task format");
  const missionId=safeId(value.missionId,"missionId");
  const taskId=safeId(value.taskId,"taskId");
  const assignedNodeId=safeId(value.assignedNodeId,"assignedNodeId");
  const createdFromResultId=value.createdFromResultId===null||value.createdFromResultId===undefined
    ?null:safeId(value.createdFromResultId,"createdFromResultId");
  return Object.freeze({
    format:MEGA_BRAIN_TASK_FORMAT,
    version:1,
    missionId,
    taskId,
    objective:boundedText(value.objective,"objective",MAX_OBJECTIVE),
    requiredCapabilities:stringArray(value.requiredCapabilities,"requiredCapabilities"),
    dependencies:stringArray(value.dependencies,"dependencies",{safeIds:true,maxLength:120}),
    assignedNodeId,
    createdFromResultId
  });
}

function normalizeClaim(value){
  if(!plain(value))throw new Error("invalid mega brain claim");
  exactKeys(value,new Set(["claimId","text"]),"mega brain claim");
  return Object.freeze({
    claimId:safeId(value.claimId,"claimId"),
    text:boundedText(value.text,"claim.text")
  });
}
function normalizeEvidence(value){
  if(!plain(value))throw new Error("invalid mega brain evidence");
  exactKeys(value,new Set(["evidenceId","sourceRef","contentDigest","claimIds"]),"mega brain evidence");
  return Object.freeze({
    evidenceId:safeId(value.evidenceId,"evidenceId"),
    sourceRef:boundedText(value.sourceRef,"evidence.sourceRef",MAX_SOURCE_REF),
    contentDigest:boundedText(value.contentDigest,"evidence.contentDigest",MAX_DIGEST),
    claimIds:stringArray(value.claimIds??[],"evidence.claimIds",{safeIds:true,maxLength:120,maxItems:MAX_CLAIMS})
  });
}
function normalizeFollowup(value){
  if(!plain(value))throw new Error("invalid mega brain followup");
  exactKeys(value,new Set(["objective","requiredCapabilities"]),"mega brain followup");
  return Object.freeze({
    objective:boundedText(value.objective,"followup.objective",MAX_OBJECTIVE),
    requiredCapabilities:stringArray(value.requiredCapabilities,"followup.requiredCapabilities")
  });
}

export function normalizeMegaBrainDispatchResult(value,{task}={}){
  const normalizedTask=normalizeMegaBrainTask(task);
  if(!plain(value))throw new TypeError("mega brain dispatch result object required");
  exactKeys(value,new Set([
    "format","version","resultId","missionId","taskId","nodeId","claims",
    "evidence","uncertainties","recommendedFollowups"
  ]),"mega brain dispatch result");
  if(value.format!==MEGA_BRAIN_DISPATCH_RESULT_FORMAT||value.version!==1)throw new Error("unsupported mega brain dispatch result format");
  if(value.missionId!==normalizedTask.missionId)throw new Error("mega brain dispatch mission mismatch");
  if(value.taskId!==normalizedTask.taskId)throw new Error("mega brain dispatch task mismatch");
  if(value.nodeId!==normalizedTask.assignedNodeId)throw new Error("mega brain dispatch node mismatch");
  if(!Array.isArray(value.claims)||value.claims.length>MAX_CLAIMS)throw new Error("invalid mega brain claims");
  if(!Array.isArray(value.evidence)||value.evidence.length>MAX_EVIDENCE)throw new Error("invalid mega brain evidence");
  if(!Array.isArray(value.uncertainties)||value.uncertainties.length>MAX_UNCERTAINTIES)throw new Error("invalid mega brain uncertainties");
  if(!Array.isArray(value.recommendedFollowups)||value.recommendedFollowups.length>MAX_FOLLOWUPS)throw new Error("invalid mega brain followups");

  const claims=value.claims.map(normalizeClaim);
  const claimIds=new Set();
  for(const claim of claims){
    if(claimIds.has(claim.claimId))throw new Error("duplicate mega brain claimId");
    claimIds.add(claim.claimId);
  }
  const evidence=value.evidence.map(normalizeEvidence);
  const evidenceIds=new Set();
  for(const item of evidence){
    if(evidenceIds.has(item.evidenceId))throw new Error("duplicate mega brain evidenceId");
    evidenceIds.add(item.evidenceId);
  }

  return Object.freeze({
    format:MEGA_BRAIN_DISPATCH_RESULT_FORMAT,
    version:1,
    resultId:safeId(value.resultId,"resultId"),
    missionId:normalizedTask.missionId,
    taskId:normalizedTask.taskId,
    nodeId:normalizedTask.assignedNodeId,
    claims:Object.freeze(claims),
    evidence:Object.freeze(evidence),
    uncertainties:Object.freeze(value.uncertainties.map(item=>boundedText(item,"uncertainty",4000))),
    recommendedFollowups:Object.freeze(value.recommendedFollowups.map(normalizeFollowup))
  });
}

export function registerMegaBrainDispatchAction(registry,{executor}={}){
  if(!registry||typeof registry.register!=="function")throw new TypeError("ActionRegistry-compatible registry required");
  if(typeof executor!=="function")throw new TypeError("explicit mega brain executor required");
  registry.register(MEGA_BRAIN_DISPATCH_ACTION,{
    requires:[MEGA_BRAIN_TASK_CAPABILITY],
    handler:async(params,{job,worker,signal}={})=>{
      if(!plain(params))throw new TypeError("mega brain dispatch params required");
      exactKeys(params,new Set(["task"]),"mega brain dispatch params");
      const task=normalizeMegaBrainTask(params.task);
      const raw=await executor(Object.freeze({task,job,worker,signal}));
      return normalizeMegaBrainDispatchResult(raw,{task});
    }
  });
  return registry;
}
