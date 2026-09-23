import {createHash} from "node:crypto";

const SAFE_REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BRANCH=/^[A-Za-z0-9._-]{1,128}$/;
const SAFE_SHA40=/^[a-f0-9]{40}$/;
const SAFE_SHA64=/^[a-f0-9]{64}$/;

function sha256(value){return createHash("sha256").update(value).digest("hex")}
function gitBlobSha(bytes){
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  return createHash("sha1").update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest("hex");
}
function text(value,code,max=512){
  const out=String(value??"").trim();
  if(!out||out.length>max||/[\u0000-\u001f\u007f]/.test(out))throw new Error(code);
  return out;
}
function repo(value){
  const out=text(value,"ARCA_M5_H_STORE_REPOSITORY_INVALID",256);
  if(!SAFE_REPO.test(out))throw new Error("ARCA_M5_H_STORE_REPOSITORY_INVALID");
  return out;
}
function branch(value){
  const out=text(value??"main","ARCA_M5_H_STORE_BRANCH_INVALID",128);
  if(!SAFE_BRANCH.test(out))throw new Error("ARCA_M5_H_STORE_BRANCH_INVALID");
  return out;
}
function token(value){
  const out=String(value??"");
  if(out.length<20||out.length>4096||/\s/.test(out))throw new Error("ARCA_M5_H_STORE_TOKEN_INVALID");
  return out;
}
function encoded(path){return path.split("/").map(encodeURIComponent).join("/")}
function validProof(proof,envelope){
  if(envelope?.schema!=="arca.encrypted-custody-envelope.v0.1"||
     envelope?.status!=="SEALED"||
     envelope?.algorithm!=="AES-256-GCM"||
     envelope?.plaintextIncluded!==false||
     !SAFE_SHA64.test(envelope?.contentRootHash??"")||
     proof?.schema!=="arca.m5-portal-custodial-normalization-proof.v1"||
     proof?.status!=="NORMALIZED_CUSTODIAL_OFFLINE"||
     proof?.sourceNetworkUsed!==false||
     proof?.portalRequestUsed!==false||
     proof?.publicationAttempted!==false||
     proof?.correlationAttempted!==false||
     proof?.normalizedValuesIncludedInProof!==false||
     proof?.rawBytesIncludedInProof!==false||
     proof?.humanReviewRequired!==true||
     proof?.adverseFinding!==false||
     !SAFE_SHA64.test(proof?.normalizationSha256??"")||
     !SAFE_SHA64.test(proof?.normalizedEnvelopeSha256??"")||
     !SAFE_SHA64.test(proof?.proofSha256??"")||
     !SAFE_SHA64.test(proof?.normalizedContentRootSha256??"")||
     proof.normalizedEnvelopeSha256!==sha256(JSON.stringify(envelope))||
     proof.normalizedContentRootSha256!==envelope.contentRootHash||
     (proof.executorRevision!==undefined&&!SAFE_SHA40.test(proof.executorRevision)))
    throw new Error("ARCA_M5_H_STORE_PROOF_INVALID");
}

export function createGitHubPrivateNormalizationStore({
  repository,
  targetBranch="main",
  githubToken,
  fetchImpl=globalThis.fetch
}={}){
  const targetRepo=repo(repository), targetBranchName=branch(targetBranch), auth=token(githubToken);
  if(typeof fetchImpl!=="function")throw new Error("ARCA_M5_H_STORE_FETCH_UNAVAILABLE");
  const [owner,name]=targetRepo.split("/");

  async function request(method,path,body=null){
    const response=await fetchImpl("https://api.github.com"+path,{
      method,
      headers:{
        accept:"application/vnd.github+json",
        authorization:`Bearer ${auth}`,
        "x-github-api-version":"2022-11-28",
        "user-agent":"ARCA-M5-H"
      },
      ...(body===null?{}:{body:JSON.stringify(body),headers:{
        accept:"application/vnd.github+json",
        authorization:`Bearer ${auth}`,
        "x-github-api-version":"2022-11-28",
        "user-agent":"ARCA-M5-H",
        "content-type":"application/json"
      }}),
      redirect:"error"
    });
    const payload=await response.text();
    let parsed=null; try{parsed=payload?JSON.parse(payload):null}catch{}
    if(!response.ok)throw new Error(`ARCA_M5_H_STORE_GITHUB_HTTP_${response.status}`);
    return parsed;
  }

  async function getPrivateHead(){
    const meta=await request("GET",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
    if(meta?.private!==true)throw new Error("ARCA_M5_H_STORE_TARGET_NOT_PRIVATE");
    if(meta?.archived===true)throw new Error("ARCA_M5_H_STORE_TARGET_ARCHIVED");
    const ref=await request("GET",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${encodeURIComponent(targetBranchName)}`);
    const head=String(ref?.object?.sha??"").toLowerCase();
    if(!SAFE_SHA40.test(head))throw new Error("ARCA_M5_H_STORE_HEAD_INVALID");
    return head;
  }

  return Object.freeze({
    async persist({envelope,proof}={}){
      validProof(proof,envelope);
      const head=await getPrivateHead();
      const normalizationSha=proof.normalizationSha256;
      const prefix=normalizationSha.slice(0,2);
      const envelopePath=`derived/m5-h/${prefix}/${normalizationSha}.envelope.json`;
      const proofPath=`derived/m5-h/${prefix}/${normalizationSha}.proof.json`;
      const receiptPath=`derived/m5-h/${prefix}/${normalizationSha}.receipt.json`;

      const receiptBase={
        schema:"arca.m5-private-normalization-store-receipt.v1",
        repositorySha256:sha256(targetRepo),
        branch:targetBranchName,
        normalizationSha256:normalizationSha,
        normalizedEnvelopeSha256:proof.normalizedEnvelopeSha256,
        proofSha256:proof.proofSha256,
        candidateSha256:proof.candidateSha256,
        decisionSha256:proof.decisionSha256,
        executorRevision:proof.executorRevision??null,
        plaintextStored:false,
        publicationAuthorized:false,
        correlationAuthorized:false
      };
      const receipt={...receiptBase,receiptSha256:sha256(JSON.stringify(receiptBase))};

      const files=[
        {path:envelopePath,bytes:Buffer.from(JSON.stringify(envelope)+"\n")},
        {path:proofPath,bytes:Buffer.from(JSON.stringify(proof,null,2)+"\n")},
        {path:receiptPath,bytes:Buffer.from(JSON.stringify(receipt,null,2)+"\n")}
      ];

      const commit=await request("GET",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/commits/${head}`);
      const baseTree=String(commit?.tree?.sha??"").toLowerCase();
      if(!SAFE_SHA40.test(baseTree))throw new Error("ARCA_M5_H_STORE_TREE_INVALID");

      const treeItems=[];
      for(const file of files){
        const expected=gitBlobSha(file.bytes);
        const blob=await request("POST",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/blobs`,{
          content:file.bytes.toString("base64"),encoding:"base64"
        });
        if(blob?.sha!==expected)throw new Error("ARCA_M5_H_STORE_BLOB_HASH_MISMATCH");
        treeItems.push({path:file.path,mode:"100644",type:"blob",sha:expected});
      }

      const tree=await request("POST",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/trees`,{
        base_tree:baseTree,tree:treeItems
      });
      const treeSha=String(tree?.sha??"").toLowerCase();
      if(!SAFE_SHA40.test(treeSha))throw new Error("ARCA_M5_H_STORE_NEW_TREE_INVALID");
      const created=await request("POST",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/commits`,{
        message:`custody: store m5-h ${normalizationSha.slice(0,12)}`,
        tree:treeSha,parents:[head]
      });
      const commitSha=String(created?.sha??"").toLowerCase();
      if(!SAFE_SHA40.test(commitSha))throw new Error("ARCA_M5_H_STORE_COMMIT_INVALID");
      await request("PATCH",`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/refs/heads/${encodeURIComponent(targetBranchName)}`,{
        sha:commitSha,force:false
      });

      return Object.freeze({
        status:"STORED_PRIVATE",
        commitSha,
        commitSha256:sha256(commitSha),
        envelopePath,
        proofPath,
        receiptPath,
        receiptSha256:receipt.receiptSha256,
        plaintextStored:false
      });
    }
  });
}
