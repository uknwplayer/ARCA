import {claimExpired,makeClaim,renewClaim} from "./lease.mjs";
import {assertMachineBridgeJobV3} from "./protocol-v3.mjs";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function encodePath(path){return path.split("/").map(encodeURIComponent).join("/")}
function decodeContent(item){return Buffer.from(String(item.content||"").replace(/\n/g,""),"base64").toString("utf8")}

export class GitHubMachineBridgeTransport{
  constructor({repository,ref="arca-runtime",token,root="remote-jobs",apiBase="https://api.github.com",fetchImpl=globalThis.fetch}={}){
    if(!REPOSITORY.test(repository||""))throw new Error("invalid GitHub repository");
    if(!ref||typeof ref!=="string")throw new Error("GitHub ref required");
    if(!token||typeof token!=="string")throw new Error("GitHub token required");
    if(typeof fetchImpl!=="function")throw new Error("fetch implementation required");
    this.repository=repository;this.ref=ref;this.token=token;this.root=root.replace(/^\/+|\/+$/g,"");this.apiBase=apiBase.replace(/\/$/,"");this.fetch=fetchImpl;
  }

  headers(){return {Accept:"application/vnd.github+json",Authorization:`Bearer ${this.token}`,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"arca-machine-bridge-v3"}}
  contentUrl(path,withRef=true){const suffix=withRef?`?ref=${encodeURIComponent(this.ref)}`:"";return `${this.apiBase}/repos/${this.repository}/contents/${encodePath(path)}${suffix}`}
  repoUrl(path){return `${this.apiBase}/repos/${this.repository}/${path}`}

  async request(url,options={}){
    const response=await this.fetch(url,{...options,headers:{...this.headers(),...(options.headers||{})}});
    if(response.status===404)return null;
    const text=await response.text();
    let body=null;try{body=text?JSON.parse(text):null}catch{body={message:text}}
    if(!response.ok){const error=new Error(`GitHub API ${response.status}: ${body?.message||response.statusText}`);error.status=response.status;error.body=body;throw error}
    return body;
  }

  async get(path){return this.request(this.contentUrl(path))}
  async getJson(path){const item=await this.get(path);if(!item||Array.isArray(item))return null;return {value:JSON.parse(decodeContent(item)),sha:item.sha}}
  async list(path){const body=await this.get(path);return Array.isArray(body)?body:[]}

  async putJson(path,value,{sha,message}={}){
    const body={message:message||`remote: update ${path}`,content:Buffer.from(JSON.stringify(value,null,2)+"\n").toString("base64"),branch:this.ref};
    if(sha)body.sha=sha;
    try{
      await this.request(this.contentUrl(path,false),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      return true;
    }catch(error){if(error.status===409||error.status===422)return false;throw error}
  }

  validateId(id,label="id"){if(!SAFE_ID.test(id||""))throw new Error(`invalid ${label}`)}
  path(...parts){return [this.root,...parts].join("/")}

  async init(workerId){this.validateId(workerId,"worker id")}

  async enqueue(job,{queue="shared",notify=true}={}){
    assertMachineBridgeJobV3(job);
    if(queue!=="shared")this.validateId(queue,"queue id");
    const path=this.path("queues",queue,`${job.jobId}.json`);
    if(await this.get(path))return false;
    const stored=await this.putJson(path,job,{message:`remote: enqueue ${job.jobId} for ${queue}`});
    if(stored&&notify)await this.notifyController();
    return stored;
  }

  async notifyController(){
    await this.request(this.repoUrl("dispatches"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event_type:"arca_job_available",client_payload:{target_ref:this.ref}})});
    return true;
  }

  async registerWorker(worker,{now=new Date()}={}){
    this.validateId(worker.workerId,"worker id");
    const registration={
      format:"arca-worker-registration-v1",protocolVersion:3,
      worker:{format:worker.format||"arca-worker-v1",workerId:worker.workerId,capabilities:[...(worker.capabilities||[])].sort(),heartbeatAt:worker.heartbeatAt,startedAt:worker.startedAt},
      transport:{kind:"github",repository:this.repository,ref:this.ref,authentication:"repository-bearer-token"},
      registeredAt:now.toISOString()
    };
    const path=this.path("workers",`${worker.workerId}.json`);
    const current=await this.getJson(path);
    const stored=await this.putJson(path,registration,{sha:current?.sha,message:`remote: register worker ${worker.workerId}`});
    if(!stored)throw new Error("worker registration conflict");
    return registration;
  }

  async listJobs(workerId){
    await this.init(workerId);
    const jobs=[];
    for(const queue of [workerId,"shared"]){
      for(const item of (await this.list(this.path("queues",queue))).filter(x=>x?.name?.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name))){
        try{const loaded=await this.getJson(item.path);if(loaded)jobs.push({path:item.path,job:loaded.value,sha:loaded.sha})}catch{}
      }
    }
    return jobs;
  }

  async listResults(){
    const results=[];
    for(const item of (await this.list(this.path("results"))).filter(x=>x?.name?.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name))){
      try{const loaded=await this.getJson(item.path);if(loaded)results.push({path:item.path,result:loaded.value,sha:loaded.sha})}catch{}
    }
    return results;
  }

  async getResult(jobId){
    this.validateId(jobId,"job id");
    const path=this.path("results",`${jobId}.json`);
    const loaded=await this.getJson(path);
    return loaded?{path,result:loaded.value,sha:loaded.sha}:null;
  }

  async hasResult(jobId){return Boolean(await this.getResult(jobId))}

  async claim(job,worker,{leaseMs,now=new Date()}={}){
    assertMachineBridgeJobV3(job);this.validateId(job.jobId,"job id");
    const path=this.path("claims",`${job.jobId}.json`);
    const current=await this.getJson(path);
    if(current&&!claimExpired(current.value,now))return null;
    const attempt=current?(Number(current.value.attempt)||0)+1:1;
    const claim=makeClaim(job,worker,{attempt,leaseMs,now});
    const stored=await this.putJson(path,claim,{sha:current?.sha,message:`remote: claim ${job.jobId} by ${worker.workerId}`});
    return stored?claim:null;
  }

  async renew(jobId,workerId,{leaseMs,now=new Date()}={}){
    this.validateId(jobId,"job id");this.validateId(workerId,"worker id");
    const path=this.path("claims",`${jobId}.json`);
    const current=await this.getJson(path);
    if(!current)throw new Error("claim not found");
    if(current.value.workerId!==workerId)throw new Error("claim belongs to another worker");
    const renewed=renewClaim(current.value,{leaseMs,now});
    const stored=await this.putJson(path,renewed,{sha:current.sha,message:`remote: renew claim ${jobId}`});
    if(!stored)throw new Error("claim renewal conflict");
    return renewed;
  }

  async writeResult(result){
    this.validateId(result.jobId,"job id");
    const path=this.path("results",`${result.jobId}.json`);
    if(await this.get(path))return false;
    return this.putJson(path,result,{message:`remote: result ${result.jobId} ${result.status}`});
  }
}
