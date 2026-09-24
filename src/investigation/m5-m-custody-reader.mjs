import {createHash} from "node:crypto";

const sha256=v=>createHash("sha256").update(v).digest("hex");
const SAFE_REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BRANCH=/^[A-Za-z0-9._-]{1,128}$/;

function req(value,code,max=512){
  const out=String(value??"").trim();
  if(!out||out.length>max)throw new Error(code);
  return out;
}
function token(value){
  const out=String(value??"");
  if(out.length<20||out.length>4096||/\s/.test(out))throw new Error("ARCA_M5_M_DIAG_TOKEN_INVALID");
  return out;
}
function encoded(p){return p.split("/").map(encodeURIComponent).join("/")}

export function createM5MCustodyReader({
  repository,targetBranch="main",githubToken,fetchImpl=globalThis.fetch
}={}){
  const repo=req(repository,"ARCA_M5_M_DIAG_REPO_INVALID",256);
  if(!SAFE_REPO.test(repo))throw new Error("ARCA_M5_M_DIAG_REPO_INVALID");
  const branch=req(targetBranch,"ARCA_M5_M_DIAG_BRANCH_INVALID",128);
  if(!SAFE_BRANCH.test(branch))throw new Error("ARCA_M5_M_DIAG_BRANCH_INVALID");
  const auth=token(githubToken);
  if(typeof fetchImpl!=="function")throw new Error("ARCA_M5_M_DIAG_FETCH_INVALID");
  const [owner,name]=repo.split("/");

  async function request(url){
    const res=await fetchImpl(url,{
      method:"GET",
      headers:{
        accept:"application/vnd.github+json",
        authorization:`Bearer ${auth}`,
        "x-github-api-version":"2022-11-28",
        "user-agent":"ARCA-M5-M-DIAG"
      },
      redirect:"error"
    });
    const text=await res.text();
    let parsed=null;try{parsed=text?JSON.parse(text):null}catch{}
    if(!res.ok)throw new Error(`ARCA_M5_M_DIAG_GITHUB_HTTP_${res.status}`);
    return parsed;
  }

  return Object.freeze({
    async readExactEnvelope({path,expectedEnvelopeSha256}={}){
      const p=req(path,"ARCA_M5_M_DIAG_PATH_INVALID");
      const expected=req(expectedEnvelopeSha256,"ARCA_M5_M_DIAG_HASH_INVALID",64).toLowerCase();
      if(!/^custody\/[a-f0-9]{2}\/[a-f0-9]{64}\.envelope\.json$/.test(p)||
         !/^[a-f0-9]{64}$/.test(expected))
        throw new Error("ARCA_M5_M_DIAG_PATH_OR_HASH_INVALID");
      const meta=await request(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      if(meta?.private!==true||meta?.archived===true)throw new Error("ARCA_M5_M_DIAG_VAULT_INVALID");
      const content=await request(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encoded(p)}?ref=${encodeURIComponent(branch)}`
      );
      if(content?.type!=="file"||content?.encoding!=="base64"||typeof content?.content!=="string")
        throw new Error("ARCA_M5_M_DIAG_CONTENT_INVALID");
      let envelope;
      try{envelope=JSON.parse(Buffer.from(content.content.replace(/\s+/g,""),"base64").toString("utf8"))}
      catch{throw new Error("ARCA_M5_M_DIAG_ENVELOPE_JSON_INVALID")}
      if(sha256(JSON.stringify(envelope))!==expected)
        throw new Error("ARCA_M5_M_DIAG_ENVELOPE_HASH_MISMATCH");
      return Object.freeze({envelope,envelopeSha256:expected});
    }
  });
}
