import {spawn} from "node:child_process";
import {
  buildHypothesisSet,
  buildProcurementProfile,
  detectConcentration,
  detectLowCompetition,
  detectRobustOutliers,
  normalizeProcurementDataset
} from "../../packages/aie/src/index.ts";
import {buildPncpProcurementRequestPlan} from "../../packages/pncp-connector/src/index.ts";
import {acquirePncpPublicWithCustody} from "../../packages/pncp-connector/src/network-custody.ts";
import {runPncpDiscoveryPlanAction,runPncpDiscoveryPublicAction} from "./pncp-discovery-actions.mjs";

const ACTION_NAME=/^[A-Za-z0-9._-]{1,80}$/;
const OUTPUT_LIMIT=500000;
const AIE_MAX_RECORDS=10000;
const MUTATION_CLASSES=new Set(["none","code"]);

function normalizeRequires(requires=[]){
  if(!Array.isArray(requires))throw new TypeError("requires must be an array");
  return [...new Set(requires.map(String).map(x=>x.trim()).filter(Boolean))].sort();
}
function normalizeMutationClass(value="none"){
  const mutationClass=String(value??"none").trim().toLowerCase();
  if(!MUTATION_CLASSES.has(mutationClass))throw new Error(`invalid mutation class: ${mutationClass}`);
  return mutationClass;
}
function normalizeCreatorAuthorizationResult(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  if(value.authorized!==true||value.creatorVerified!==true||value.singleUse!==true)return null;
  if(typeof value.authorizationId!=="string"||!value.authorizationId.trim())return null;
  return Object.freeze({
    authorized:true,
    creatorVerified:true,
    singleUse:true,
    authorizationId:value.authorizationId.trim()
  });
}
function runFixedCommand(root,args,{signal}={}){
  const command=process.platform==="win32"?"npm.cmd":"npm";
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,env:process.env,stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="",settled=false;
    const append=(current,chunk)=>(current+chunk).slice(-OUTPUT_LIMIT);
    const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener("abort",abort);error?reject(error):resolve(value)};
    const abort=()=>{child.kill("SIGTERM");finish(signal?.reason instanceof Error?signal.reason:new Error("action aborted"))};
    if(signal?.aborted)return abort();signal?.addEventListener("abort",abort,{once:true});
    child.stdout.on("data",chunk=>stdout=append(stdout,chunk));child.stderr.on("data",chunk=>stderr=append(stderr,chunk));child.on("error",error=>finish(error));
    child.on("close",exitCode=>{const value={exitCode,stdout,stderr};exitCode===0?finish(null,value):finish(new Error(`repository command failed with exit code ${exitCode}: ${stderr.slice(-4000)||stdout.slice(-4000)}`))});
  });
}
function boundedRecords(params,action){const records=params?.records;if(!Array.isArray(records))throw new TypeError(`${action} requires params.records array`);if(records.length>AIE_MAX_RECORDS)throw new Error(`${action} accepts at most ${AIE_MAX_RECORDS} records per job`);return records}
function runAieAnalysis(params={}){
  const records=boundedRecords(params,"aie.analyze");const requested=Array.isArray(params.detectors)&&params.detectors.length?params.detectors:["outlier","low-competition","concentration"];const allowed=new Set(["outlier","low-competition","concentration"]);for(const detector of requested)if(!allowed.has(detector))throw new Error(`unsupported AIE detector: ${detector}`);const options=params.options&&typeof params.options==="object"&&!Array.isArray(params.options)?params.options:{};const findings=[];
  if(requested.includes("outlier"))findings.push(...detectRobustOutliers(records,options.outlier||{}));if(requested.includes("low-competition"))findings.push(...detectLowCompetition(records,options.lowCompetition||{}));if(requested.includes("concentration"))findings.push(...detectConcentration(records,options.concentration||{}));
  return {format:"arca-aie-analysis-v1",engineVersion:"0.4.0",recordCount:records.length,detectors:[...requested],findingCount:findings.length,findings,hypotheses:findings.map(finding=>buildHypothesisSet(finding)),humanReviewRequired:true,limitations:["Analytical signals are exploratory and are not findings of guilt, fraud, crime or legal irregularity.","Comparability, source quality and legitimate explanations must be reviewed before escalation."]};
}
function runProcurementProfile(params={}){
  const rawRecords=boundedRecords(params,"aie.procurement-profile");const options=params.options&&typeof params.options==="object"&&!Array.isArray(params.options)?params.options:{};const records=normalizeProcurementDataset(rawRecords,{sourceRef:params.sourceRef||"machine-bridge-job"});const profile=buildProcurementProfile(records,options);
  return {format:"arca-aie-procurement-analysis-v1",engineVersion:"0.4.0",rawRecordCount:rawRecords.length,normalizedRecordCount:records.length,profile,limitations:["The profile is an offline analytical triage over records supplied by the job; it does not acquire or verify network sources.","Signals require human review of comparability, source quality, contractual context and legitimate explanations."],humanReviewRequired:true};
}
function runPncpPlan(params={}){
  if(params.allowNetwork===true||params.network===true)throw new Error("pncp.plan never enables network; use a separately authorized network action when available");
  const target=params.target&&typeof params.target==="object"?params.target:params;
  return {...buildPncpProcurementRequestPlan(target,{includeBudgetSources:params.includeBudgetSources!==false}),execution:"plan-only",networkUsed:false,humanReviewRequired:true};
}

export class ActionRegistry{
  #actions=new Map();
  #creatorAuthorizationVerifier;
  constructor({creatorAuthorizationVerifier=null}={}){
    if(creatorAuthorizationVerifier!==null&&typeof creatorAuthorizationVerifier!=="function")throw new TypeError("creatorAuthorizationVerifier must be a function");
    this.#creatorAuthorizationVerifier=creatorAuthorizationVerifier;
  }
  register(name,{requires=[],handler,run,mutationClass="none"}={}){
    if(!ACTION_NAME.test(name))throw new Error(`invalid action name: ${name}`);
    const fn=handler||run;
    if(typeof fn!=="function")throw new TypeError(`handler required for action: ${name}`);
    if(this.#actions.has(name))throw new Error(`action already registered: ${name}`);
    const normalizedMutation=normalizeMutationClass(mutationClass);
    this.#actions.set(name,Object.freeze({name,requires:normalizeRequires(requires),handler:fn,mutationClass:normalizedMutation}));
    return this;
  }
  has(name){return this.#actions.has(name)}
  get(name){return this.#actions.get(name)||null}
  list(){return [...this.#actions.values()].map(({name,requires,mutationClass})=>mutationClass==="none"?{name,requires:[...requires]}:{name,requires:[...requires],mutationClass}).sort((a,b)=>a.name.localeCompare(b.name))}
  async #authorizeCodeMutation(entry,job,worker){
    if(entry.mutationClass!=="code")return null;
    if(typeof this.#creatorAuthorizationVerifier!=="function"){
      const error=new Error("Creator authorization required for code mutation");
      error.code="ARCA_CREATOR_CODE_AUTHORIZATION_REQUIRED";
      throw error;
    }
    const verdict=normalizeCreatorAuthorizationResult(await this.#creatorAuthorizationVerifier(Object.freeze({
      action:entry.name,
      job,
      worker,
      authorization:job?.creatorAuthorization??null
    })));
    if(!verdict){
      const error=new Error("Creator authorization rejected for code mutation");
      error.code="ARCA_CREATOR_CODE_AUTHORIZATION_REJECTED";
      throw error;
    }
    return verdict;
  }
  async run(job,{worker,signal}={}){
    const entry=this.get(job?.action);
    if(!entry)throw new Error(`unregistered action: ${job?.action||"<missing>"}`);
    await this.#authorizeCodeMutation(entry,job,worker);
    const params=job.params&&typeof job.params==="object"&&!Array.isArray(job.params)?job.params:{};
    const timeoutMs=Math.min(300000,Math.max(1000,Number(job.timeoutMs)||120000));
    const controller=new AbortController();
    const onAbort=()=>controller.abort(signal?.reason);
    if(signal){if(signal.aborted)controller.abort(signal.reason);else signal.addEventListener("abort",onAbort,{once:true})}
    let timer;
    try{
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort(new Error("action timeout"));reject(new Error(`action timeout after ${timeoutMs}ms`))},timeoutMs)});
      return await Promise.race([Promise.resolve(entry.handler(params,{job,worker,signal:controller.signal})),timeout]);
    }finally{
      clearTimeout(timer);
      if(signal)signal.removeEventListener("abort",onAbort);
    }
  }
}
export function createDefaultActionRegistry({worker,clock=()=>new Date(),root=process.cwd(),pncpNetwork=null,creatorAuthorizationVerifier=null}={}){
  const registry=new ActionRegistry({creatorAuthorizationVerifier})
    .register("worker.ping",{handler:async params=>({ok:true,workerId:worker?.workerId||null,at:clock().toISOString(),echo:params.echo??null})})
    .register("worker.describe",{handler:async()=>({format:worker?.format||"arca-worker-v1",workerId:worker?.workerId||null,capabilities:[...(worker?.capabilities||[])].sort()})})
    .register("repository.test",{requires:["node","repository"],handler:async(_params,{signal})=>runFixedCommand(root,["test"],{signal})})
    .register("repository.check",{requires:["node","repository"],handler:async(_params,{signal})=>runFixedCommand(root,["run","check"],{signal})})
    .register("aie.analyze",{requires:["aie"],handler:async params=>runAieAnalysis(params)})
    .register("aie.procurement-profile",{requires:["aie"],handler:async params=>runProcurementProfile(params)})
    .register("pncp.plan",{requires:["pncp-plan"],handler:async params=>runPncpPlan(params)})
    .register("pncp.discovery-plan",{requires:["pncp-plan"],handler:async params=>runPncpDiscoveryPlanAction(params)});
  if(pncpNetwork?.enabled===true){
    registry.register("pncp.acquire-public",{
      requires:["pncp-public-network"],
      handler:async params=>acquirePncpPublicWithCustody(params,{
        workerId:worker?.workerId,
        custodyHome:pncpNetwork.custodyHome,
        stagingRoot:pncpNetwork.stagingRoot,
        fetchImpl:pncpNetwork.fetchImpl,
        maxBytes:pncpNetwork.maxBytes,
        timeoutMs:pncpNetwork.timeoutMs,
        maxRetries:pncpNetwork.maxRetries
      })
    });
    registry.register("pncp.discovery-public",{
      requires:["pncp-public-network"],
      handler:async params=>runPncpDiscoveryPublicAction(params,{
        workerId:worker?.workerId,
        custodyHome:pncpNetwork.custodyHome,
        stagingRoot:pncpNetwork.stagingRoot,
        fetchImpl:pncpNetwork.fetchImpl,
        maxBytes:pncpNetwork.maxBytes,
        timeoutMs:pncpNetwork.timeoutMs,
        maxRetries:pncpNetwork.maxRetries
      })
    });
  }
  return registry;
}
const globalRegistry=new ActionRegistry();
export function registerAction(name,spec){globalRegistry.register(name,{requires:spec?.requires||[],run:spec?.run,mutationClass:spec?.mutationClass||"none"});return true}
export function getAction(name){return globalRegistry.get(name)}
export function listActions(){return globalRegistry.list()}
export async function executeRegistered(job,ctx={}){
  const spec=globalRegistry.get(job?.action);
  if(!spec)return {kind:"delegate",reason:"action-unavailable"};
  const worker=ctx.worker||{capabilities:[]};
  const have=new Set(worker.capabilities||[]);
  const needs=normalizeRequires([...(job?.requires||[]),...spec.requires]);
  if(needs.some(cap=>!have.has(cap)))return {kind:"delegate",reason:"capability-mismatch",requires:needs};
  return {kind:"executed",value:await globalRegistry.run(job,ctx)};
}
