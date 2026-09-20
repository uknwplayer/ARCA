const API="https://api.github.com";
const enc=s=>encodeURIComponent(String(s));
export function createGitHubReadOnlyAuditClient({token,fetchImpl=globalThis.fetch}={}){
 if(typeof fetchImpl!=="function") throw new Error("ARCA_AUDITOR_GITHUB_FETCH_UNAVAILABLE");
 const headers={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"arca-auditor-gateway"};
 if(token) headers.Authorization="Bearer "+token;
 async function get(path,{accept}={}){
  const r=await fetchImpl(API+path,{method:"GET",headers:{...headers,...(accept?{Accept:accept}:{})}});
  if(r.status===404)return null;if(!r.ok)throw new Error("ARCA_AUDITOR_GITHUB_READ_FAILED_"+r.status);
  const ct=r.headers?.get?.("content-type")??"";return ct.includes("application/json")?r.json():r.text();
 }
 return Object.freeze({async fetchResource(q){
  const [owner,name]=q.repo.split("/"); const root="/repos/"+enc(owner)+"/"+enc(name);
  switch(q.kind){
   case "file": {const ref=q.ref?"?ref="+enc(q.ref):"";return get(root+"/contents/"+String(q.path??"").split("/").map(enc).join("/")+ref);}
   case "commit": return get(root+"/commits/"+enc(q.sha));
   case "pull": return get(root+"/pulls/"+enc(q.number));
   case "workflow-run": return get(root+"/actions/runs/"+enc(q.runId));
   case "workflow-job-log": return get(root+"/actions/jobs/"+enc(q.jobId)+"/logs",{accept:"application/vnd.github+json"});
   default: throw new Error("ARCA_AUDITOR_GITHUB_KIND_UNSUPPORTED");
  }
 }});
}
