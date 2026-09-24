import {createHash} from "node:crypto";

const SAFE_REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BRANCH=/^[A-Za-z0-9._-]{1,128}$/;
const SAFE_HASH=/^[a-f0-9]{64}$/;

const sha256=v=>createHash("sha256").update(v).digest("hex");
function text(value,code,max=512){
  const out=String(value??"").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/u.test(out))throw new Error(code);
  return out;
}
function repo(value){
  const out=text(value,"ARCA_M5_L_VAULT_REPOSITORY_INVALID",256);
  if(!SAFE_REPO.test(out))throw new Error("ARCA_M5_L_VAULT_REPOSITORY_INVALID");
  return out;
}
function branch(value){
  const out=text(value??"main","ARCA_M5_L_VAULT_BRANCH_INVALID",128);
  if(!SAFE_BRANCH.test(out))throw new Error("ARCA_M5_L_VAULT_BRANCH_INVALID");
  return out;
}
function token(value){
  const out=String(value??"");
  if(out.length<20||out.length>4096||/\s/.test(out))
    throw new Error("ARCA_M5_L_VAULT_TOKEN_INVALID");
  return out;
}
function safePath(value){
  const out=text(value,"ARCA_M5_L_VAULT_PATH_INVALID",512);
  if(out.startsWith("/")||out.includes("..")||!/^derived\/m5-h\/[a-f0-9]{2}\/[a-f0-9]{64}\.envelope\.json$/.test(out))
    throw new Error("ARCA_M5_L_VAULT_PATH_INVALID");
  return out;
}
function hash(value){
  const out=text(value,"ARCA_M5_L_EXPECTED_HASH_INVALID",64).toLowerCase();
  if(!SAFE_HASH.test(out))throw new Error("ARCA_M5_L_EXPECTED_HASH_INVALID");
  return out;
}
function encodedPath(p){return p.split("/").map(encodeURIComponent).join("/")}

export function createPrivateNormalizationReader({
  repository,
  targetBranch="main",
  githubToken,
  fetchImpl=globalThis.fetch
}={}){
  const targetRepo=repo(repository);
  const targetBranchName=branch(targetBranch);
  const auth=token(githubToken);
  if(typeof fetchImpl!=="function")throw new Error("ARCA_M5_L_VAULT_FETCH_UNAVAILABLE");
  const [owner,name]=targetRepo.split("/");

  async function request(url){
    const response=await fetchImpl(url,{
      method:"GET",
      headers:{
        accept:"application/vnd.github+json",
        authorization:`Bearer ${auth}`,
        "x-github-api-version":"2022-11-28",
        "user-agent":"ARCA-M5-L"
      },
      redirect:"error"
    });
    const payload=await response.text();
    let parsed=null;
    try{parsed=payload?JSON.parse(payload):null}catch{}
    if(!response.ok)throw new Error(`ARCA_M5_L_VAULT_GITHUB_HTTP_${response.status}`);
    return parsed;
  }

  return Object.freeze({
    async readEnvelope({path,expectedEnvelopeSha256}={}){
      const envelopePath=safePath(path);
      const expected=hash(expectedEnvelopeSha256);
      const meta=await request(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      if(meta?.private!==true)throw new Error("ARCA_M5_L_VAULT_NOT_PRIVATE");
      if(meta?.archived===true)throw new Error("ARCA_M5_L_VAULT_ARCHIVED");

      const content=await request(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodedPath(envelopePath)}?ref=${encodeURIComponent(targetBranchName)}`
      );
      if(content?.type!=="file"||content?.encoding!=="base64"||typeof content?.content!=="string")
        throw new Error("ARCA_M5_L_VAULT_CONTENT_INVALID");
      let envelope;
      try{
        envelope=JSON.parse(Buffer.from(content.content.replace(/\s+/g,""),"base64").toString("utf8"));
      }catch{
        throw new Error("ARCA_M5_L_VAULT_ENVELOPE_JSON_INVALID");
      }
      if(sha256(JSON.stringify(envelope))!==expected)
        throw new Error("ARCA_M5_L_VAULT_ENVELOPE_HASH_MISMATCH");
      if(envelope?.schema!=="arca.encrypted-custody-envelope.v0.1"||
         envelope?.status!=="SEALED"||
         envelope?.plaintextIncluded!==false)
        throw new Error("ARCA_M5_L_VAULT_ENVELOPE_INVALID");
      return Object.freeze({envelope,path:envelopePath,envelopeSha256:expected});
    }
  });
}
