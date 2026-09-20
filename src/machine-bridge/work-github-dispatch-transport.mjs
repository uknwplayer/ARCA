import {verifyWorkDispatchEnvelope} from "./work-dispatch-v1.mjs";

const REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF=/^[A-Za-z0-9._\/-]{1,240}$/;
const SAFE_JOB=/^[A-Za-z0-9._-]{1,120}$/;

function encodePath(path){return path.split("/").map(encodeURIComponent).join("/")}
function decode(item){return JSON.parse(Buffer.from(String(item.content??"").replace(/\n/g,""),"base64").toString("utf8"))}

export class GitHubWorkDispatchTransport{
  constructor({repository,ref,pullRequestNumber,token,root="experiments/work-wakeup/jobs",apiBase="https://api.github.com",fetchImpl=globalThis.fetch}={}){
    if(!REPOSITORY.test(repository??""))throw new Error("ARCA_WORK_TRANSPORT_REPOSITORY_INVALID");
    if(typeof ref!=="string"||!REF.test(ref)||["main","master"].includes(ref.toLowerCase())||ref.includes(".."))throw new Error("ARCA_WORK_TRANSPORT_REF_INVALID");
    const pr=Number(pullRequestNumber);if(!Number.isSafeInteger(pr)||pr<1)throw new Error("ARCA_WORK_TRANSPORT_PR_INVALID");
    if(typeof token!=="string"||!token.trim())throw new Error("ARCA_WORK_TRANSPORT_TOKEN_REQUIRED");
    if(typeof fetchImpl!=="function")throw new Error("ARCA_WORK_TRANSPORT_FETCH_REQUIRED");
    this.repository=repository;this.ref=ref;this.pullRequestNumber=pr;this.token=token;this.root=root.replace(/^\/+|\/+$/g,"");this.apiBase=apiBase.replace(/\/$/,"");this.fetch=fetchImpl;
  }
  headers(){return {Accept:"application/vnd.github+json",Authorization:`Bearer ${this.token}`,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"arca-work-dispatch-v0.2"}}
  url(path){return `${this.apiBase}/repos/${this.repository}/contents/${encodePath(path)}`}
  async request(url,options={}){
    const response=await this.fetch(url,{...options,headers:{...this.headers(),...(options.headers??{})}});
    if(response.status===404)return null;
    const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{body={message:text}}
    if(!response.ok){const error=new Error(`GitHub API ${response.status}: ${body?.message||response.statusText}`);error.status=response.status;error.body=body;throw error}
    return body;
  }
  path(jobId){if(!SAFE_JOB.test(jobId??""))throw new Error("ARCA_WORK_TRANSPORT_JOB_ID_INVALID");return `${this.root}/${jobId}.json`}
  async inspectSurface(){
    const pr=await this.request(`${this.apiBase}/repos/${this.repository}/pulls/${this.pullRequestNumber}`);
    if(!pr||pr.state!=="open"||pr.head?.repo?.full_name!==this.repository||pr.head?.ref!==this.ref)throw new Error("ARCA_WORK_TRANSPORT_PR_HEAD_MISMATCH");
    return pr;
  }
  async getEnvelope(jobId){
    const path=this.path(jobId);
    const item=await this.request(`${this.url(path)}?ref=${encodeURIComponent(this.ref)}`);
    return item&&!Array.isArray(item)?Object.freeze({path,sha:item.sha,envelope:decode(item)}):null;
  }
  async publishEnvelope(envelope,{trustedFingerprints}={}){
    const verified=verifyWorkDispatchEnvelope(envelope,{trustedFingerprints});
    await this.inspectSurface();
    const existing=await this.getEnvelope(verified.jobId);
    if(existing){
      if(existing.envelope?.signature?.payloadSha256===verified.payloadSha256&&existing.envelope?.signature?.keyFingerprint===verified.keyFingerprint)return Object.freeze({status:"duplicate",path:existing.path,sha:existing.sha,commitSha:null});
      throw new Error("ARCA_WORK_TRANSPORT_JOB_CONFLICT");
    }
    const path=this.path(verified.jobId);
    const body={message:`runtime(work): queue ${verified.jobId}`,content:Buffer.from(JSON.stringify(envelope,null,2)+"\n").toString("base64"),branch:this.ref};
    const stored=await this.request(this.url(path),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const commitSha=String(stored?.commit?.sha??"").toLowerCase();
    if(!/^[a-f0-9]{40}$/.test(commitSha))throw new Error("ARCA_WORK_TRANSPORT_COMMIT_INVALID");
    return Object.freeze({status:"stored",path,sha:stored?.content?.sha??null,commitSha});
  }
}
