const SAFE_KIND=new Set(["file","commit","pull","workflow-run","workflow-job-log"]);

function normalizeAllowedRepos(values){
 if(!Array.isArray(values)||values.length<1) throw new Error("ARCA_AUDITOR_GITHUB_ALLOWED_REPOS_REQUIRED");
 const repos=new Set();
 for(const value of values){
  const repo=String(value??"").trim();
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("ARCA_AUDITOR_GITHUB_INVALID_REPO");
  repos.add(repo);
 }
 return repos;
}

export function createGitHubAuditSource({fetchResource,allowedRepos}){
 if(typeof fetchResource!=="function") throw new Error("ARCA_AUDITOR_GITHUB_INVALID_CLIENT");
 const safeRepos=normalizeAllowedRepos(allowedRepos);
 return Object.freeze({async read({resource}){
  let q; try{q=JSON.parse(resource)}catch{throw new Error("ARCA_AUDITOR_GITHUB_INVALID_RESOURCE")}
  if(!safeRepos.has(q.repo)||!SAFE_KIND.has(q.kind)) throw new Error("ARCA_AUDITOR_GITHUB_SCOPE_DENIED");
  if(q.kind==="file" && /(^|\/)(\.env|secrets?)(\/|$)/i.test(q.path??"")) throw new Error("ARCA_AUDITOR_GITHUB_SENSITIVE_PATH");
  return fetchResource(Object.freeze({...q}));
 }});
}
