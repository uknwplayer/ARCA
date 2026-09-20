import {createHash} from "node:crypto";
import {CapabilityRegistry} from "./capability-registry.ts";
import {defaultMachineBridgeContinuationRecipes} from "./machine-bridge-continuation-handler.ts";

export const ARCA_CAPABILITY_WORKFLOW_PLAN_FORMAT="arca-capability-workflow-plan-v1";
export const ARCA_CAPABILITY_WORKFLOW_POLICY_FORMAT="arca-capability-workflow-policy-v1";

const IDENTIFIER=/^[A-Za-z0-9._:-]{1,120}$/;
const SECRET_KEY=/(authorization|bearer|token|password|secret|api[_-]?key|client[_-]?secret|private[_-]?key|cookie|credential)/i;
const MAX_STEPS=50;
const MAX_PARAMS_BYTES=64*1024;

type JsonObject=Record<string,any>;
type PolicyInput={policyId:string;capabilityId:string;recipeId:string;allowNetworkPlanning?:boolean};
type PlanStepInput={stepId:string;capabilityId:string;params?:JsonObject};
type PlanInput={requestId:string;objectiveId?:string;steps:PlanStepInput[]};

function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function clean(value:any):any{if(Array.isArray(value))return value.map(clean);if(plain(value)){const out:JsonObject={};for(const [key,item] of Object.entries(value))if(item!==undefined)out[key]=clean(item);return out}return value}
function stable(value:any):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function sha256(value:any){return createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex")}
function identifier(value:unknown,label:string){const normalized=String(value??"").trim();if(!IDENTIFIER.test(normalized))throw new Error(`${label} invalido`);return normalized}
function hasSecret(value:any):boolean{if(Array.isArray(value))return value.some(hasSecret);if(!plain(value))return false;for(const [key,item] of Object.entries(value)){if(SECRET_KEY.test(key))return true;if(hasSecret(item))return true}return false}
function jsonParams(value:unknown,label:string){const raw=value===undefined?{}:value;if(!plain(raw))throw new Error(`${label} deve ser objeto`);let serialized:string;try{serialized=JSON.stringify(raw)}catch{throw new Error(`${label} deve ser JSON serializavel`)}if(serialized===undefined||Buffer.byteLength(serialized)>MAX_PARAMS_BYTES)throw new Error(`${label} excede ${MAX_PARAMS_BYTES} bytes ou e invalido`);const normalized=JSON.parse(serialized);if(!plain(normalized))throw new Error(`${label} deve permanecer objeto JSON`);if(hasSecret(normalized))throw new Error(`${label} nao pode conter secrets/credentials`);return clean(normalized)}
function iso(value=new Date().toISOString()){const date=new Date(value);if(Number.isNaN(date.getTime()))throw new Error("generatedAt invalido");return date.toISOString()}
function recipeMap(){return new Map(defaultMachineBridgeContinuationRecipes().map(recipe=>[recipe.id,recipe]))}
function recipeNeedsNetwork(recipe:any){return recipe.requires.some((capability:string)=>/network/i.test(capability))||/(acquire|discovery)-public/i.test(recipe.action)}

export function defaultCapabilityWorkflowPolicies():PolicyInput[]{return [
  {policyId:"repository.check.v1",capabilityId:"repository",recipeId:"mb.repository.check"},
  {policyId:"pncp.plan.v1",capabilityId:"pncp-plan",recipeId:"mb.pncp.plan"}
]}

export class CapabilityWorkflowPolicyRegistry{
  private policies=new Map<string,Readonly<JsonObject>>();
  private byCapability=new Map<string,Readonly<JsonObject>>();
  private recipes=recipeMap();
  constructor(entries:PolicyInput[]=defaultCapabilityWorkflowPolicies()){if(!Array.isArray(entries))throw new TypeError("policy entries deve ser array");for(const entry of entries)this.register(entry)}
  register(input:PolicyInput){
    if(!plain(input))throw new TypeError("workflow policy invalida");const policyId=identifier(input.policyId,"policyId");const capabilityId=identifier(input.capabilityId,"capabilityId").toLowerCase();const recipeId=identifier(input.recipeId,"recipeId");if(this.policies.has(policyId))throw new Error(`policy duplicada: ${policyId}`);if(this.byCapability.has(capabilityId))throw new Error(`capability possui mais de uma policy V1: ${capabilityId}`);const recipe=this.recipes.get(recipeId);if(!recipe)throw new Error(`recipe desconhecida na policy: ${recipeId}`);const networkRequired=recipeNeedsNetwork(recipe);if(networkRequired&&input.allowNetworkPlanning!==true)throw new Error(`recipe de rede exige allowNetworkPlanning explicito: ${recipeId}`);const record=Object.freeze({format:ARCA_CAPABILITY_WORKFLOW_POLICY_FORMAT,policyId,capabilityId,recipeId,networkRequired,allowNetworkPlanning:input.allowNetworkPlanning===true});this.policies.set(policyId,record);this.byCapability.set(capabilityId,record);return clean(record)
  }
  getForCapability(capabilityId:string){const record=this.byCapability.get(identifier(capabilityId,"capabilityId").toLowerCase());return record?clean(record):null}
  list(){return [...this.policies.values()].map(clean).sort((a,b)=>String(a.policyId).localeCompare(String(b.policyId)))}
}

function observations(registry:CapabilityRegistry,capabilityIds:string[]){
  const rows=[];for(const passport of registry.listPassports()){const caps=capabilityIds.map(id=>passport.capabilities.find((item:any)=>item.id===id)).filter(Boolean);if(caps.length===capabilityIds.length)rows.push({participantId:passport.participantId,statuses:caps.map((item:any)=>item.status),capabilities:caps.map((item:any)=>({id:item.id,status:item.status,riskClass:item.riskClass,networkRequired:item.networkRequired}))})}return rows.sort((a,b)=>a.participantId.localeCompare(b.participantId))
}
function gapType(registry:CapabilityRegistry,required:string[]){const rows=observations(registry,required);if(rows.some(row=>row.statuses.every(status=>status==="verified")))return null;const all=registry.listPassports().flatMap(passport=>passport.capabilities.filter((item:any)=>required.includes(item.id)).map((item:any)=>item.status));if(all.includes("verification-needed"))return "verification-needed";if(all.includes("degraded"))return "degraded";if(all.includes("declared"))return "unverified";if(all.includes("unavailable"))return "unavailable";if(all.includes("unknown"))return "unknown";return "missing"}

export function buildCapabilityWorkflowPlan(capabilityRegistry:CapabilityRegistry,input:PlanInput,options:{policyRegistry?:CapabilityWorkflowPolicyRegistry;generatedAt?:string}={}){
  if(!(capabilityRegistry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");if(!plain(input))throw new TypeError("workflow plan input invalido");const requestId=identifier(input.requestId,"requestId");const objectiveId=input.objectiveId==null?null:identifier(input.objectiveId,"objectiveId");if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>MAX_STEPS)throw new Error(`steps deve conter entre 1 e ${MAX_STEPS} itens`);const policyRegistry=options.policyRegistry??new CapabilityWorkflowPolicyRegistry();if(!(policyRegistry instanceof CapabilityWorkflowPolicyRegistry))throw new TypeError("CapabilityWorkflowPolicyRegistry invalido");const recipes=recipeMap();const seen=new Set<string>();
  const planned=input.steps.map((raw,index)=>{
    if(!plain(raw))throw new Error(`steps[${index}] invalido`);const stepId=identifier(raw.stepId,`steps[${index}].stepId`);if(seen.has(stepId))throw new Error(`step duplicado: ${stepId}`);seen.add(stepId);const capabilityId=identifier(raw.capabilityId,`steps[${index}].capabilityId`).toLowerCase();const policy=policyRegistry.getForCapability(capabilityId);if(!policy)return {stepId,capabilityId,status:"blocked",reason:"policy-missing",policyId:null,recipeId:null,requiredCapabilities:[capabilityId],candidateParticipantIds:[],params:null,networkPlanning:false,gap:"policy-missing"};const recipe=recipes.get(policy.recipeId);if(!recipe)return {stepId,capabilityId,status:"blocked",reason:"recipe-missing",policyId:policy.policyId,recipeId:policy.recipeId,requiredCapabilities:[capabilityId],candidateParticipantIds:[],params:null,networkPlanning:false,gap:"recipe-missing"};const rawParams=jsonParams(raw.params,`steps[${index}].params`);let params:JsonObject;try{params=jsonParams(recipe.normalizeParams(rawParams),`steps[${index}].normalizedParams`)}catch(error:any){throw new Error(`policy ${policy.policyId} recusou params de ${stepId}: ${String(error?.message??error)}`)}const required=[...new Set([capabilityId,...recipe.requires.map((item:string)=>String(item).toLowerCase())])].sort();const compatible=capabilityRegistry.findCompatible(required);const candidateParticipantIds=compatible.map((item:any)=>item.participantId).sort();const gap=candidateParticipantIds.length?null:gapType(capabilityRegistry,required);return {stepId,capabilityId,status:candidateParticipantIds.length?"ready":"blocked",reason:candidateParticipantIds.length?"verified-capability-and-policy":"capability-gap",policyId:policy.policyId,recipeId:policy.recipeId,requiredCapabilities:required,candidateParticipantIds,params,networkPlanning:policy.networkRequired===true,gap};
  });
  const blocked=planned.filter(step=>step.status!=="ready");const status=blocked.length?"blocked":"ready";const workflow=status==="ready"?{requestId,steps:planned.map(step=>({stepId:step.stepId,recipeId:step.recipeId,params:step.params}))}:null;const hashBody={requestId,objectiveId,status,steps:planned,workflow};return Object.freeze({format:ARCA_CAPABILITY_WORKFLOW_PLAN_FORMAT,version:"0.1.0",requestId,objectiveId,generatedAt:iso(options.generatedAt),status,steps:clean(planned),workflow:clean(workflow),blockedSteps:blocked.map(step=>step.stepId),planHash:sha256(hashBody),authorizationIncluded:false,executionPerformed:false,registrationPerformed:false,schedulerSelectionPerformed:false,networkAuthorizationIncluded:false,humanReviewRequired:true});
}
