import {createExecutionEndpointDescriptor} from "./execution-endpoint.mjs";

export const ARCA_WORK_GITHUB_WAKE_RECEIPT_FORMAT="arca-work-github-wake-receipt-v1";
export const ARCA_WORK_GITHUB_ACK_FORMAT="arca-work-github-ack-v1";
export const ARCA_WORK_GITHUB_HEARTBEAT_FORMAT="arca-work-github-heartbeat-v1";
export const ARCA_WORK_GITHUB_RESULT_FORMAT="arca-work-github-result-observation-v1";

const REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF=/^[A-Za-z0-9._\/-]{1,240}$/;
const HASH40=/^[a-f0-9]{40}$/;
const SAFE_PATH=/^[A-Za-z0-9._\/-]{1,400}$/;
const WORK_RESULT_STATES=new Set(["completed","failed","rejected"]);

function encodePath(path){return path.split("/").map(encodeURIComponent).join("/")}
function cleanRef(value){const ref=String(value??"").trim();if(!REF.test(ref)||ref.includes("..")||ref.startsWith("/")||ref.endsWith("/"))throw new Error("ARCA_WORK_WAKE_REF_INVALID");if(["main","master"].includes(ref.toLowerCase()))throw new Error("ARCA_WORK_WAKE_CANONICAL_REF_FORBIDDEN");return ref}
function cleanPath(value){const path=String(value??"experiments/work-wakeup/PROBE.md").trim().replace(/^\/+/,"");if(!SAFE_PATH.test(path)||path.includes("..")||!path.startsWith("experiments/work-wakeup/"))throw new Error("ARCA_WORK_WAKE_PATH_INVALID");return path}
function probeToken(wakeId){return `ARCA-WAKE-${String(wakeId).slice(0,32).toUpperCase()}`}
function renderProbe(wake){
  const token=probeToken(wake.wakeId);
  const eventLabel=wake.eventId?"`"+wake.eventId+"`":"none";
  return `# Work Wake-up Probe\n\nExperiment: ARCA-EXECUTION-ENDPOINT-V0.1\n\nCurrent probe token:\n\n\`${token}\`\n\nMachine correlation (metadata only):\n\n- endpointId: \`${wake.endpointId}\`\n- requestId: \`${wake.requestId}\`\n- taskRef: \`${wake.taskRef}\`\n- taskHash: \`${wake.taskHash}\`\n- eventId: ${eventLabel}\n- wakeId: \`${wake.wakeId}\`\n- createdAt: \`${wake.createdAt}\`\n\nThis commit is a wake stimulus only. It carries no task payload, grants no trust, grants no code-mutation authority, and does not imply that external execution completed.\n`;
}

export function createChatGPTWorkGitHubTriggerEndpoint({
  endpointId="chatgpt-work",
  capabilities=[],
  repository,
  ref,
  pullRequestNumber,
  stimulusPath="experiments/work-wakeup/PROBE.md",
  token,
  apiBase="https://api.github.com",
  fetchImpl=globalThis.fetch
}={}){
  if(!REPOSITORY.test(repository??""))throw new Error("ARCA_WORK_WAKE_REPOSITORY_INVALID");
  const branch=cleanRef(ref);
  const path=cleanPath(stimulusPath);
  const prNumber=Number(pullRequestNumber);
  if(!Number.isSafeInteger(prNumber)||prNumber<1)throw new Error("ARCA_WORK_WAKE_PR_INVALID");
  if(typeof token!=="string"||!token.trim())throw new Error("ARCA_WORK_WAKE_TOKEN_REQUIRED");
  if(typeof fetchImpl!=="function")throw new Error("ARCA_WORK_WAKE_FETCH_REQUIRED");
  const base=String(apiBase).replace(/\/$/,"");
  const headers={Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"arca-work-execution-endpoint-v0.1"};
  async function request(url,options={}){
    const response=await fetchImpl(url,{...options,headers:{...headers,...(options.headers??{})}});
    const text=await response.text();
    let body=null;try{body=text?JSON.parse(text):null}catch{body={message:text}}
    if(!response.ok){const error=new Error(`GitHub API ${response.status}: ${body?.message||response.statusText}`);error.status=response.status;error.body=body;throw error}
    return body;
  }
  const prUrl=`${base}/repos/${repository}/pulls/${prNumber}`;
  const contentUrl=`${base}/repos/${repository}/contents/${encodePath(path)}`;
  const commentsUrl=`${base}/repos/${repository}/issues/${prNumber}/comments?per_page=100`;
  async function inspectTriggerSurface(){
    const pr=await request(prUrl);
    if(pr?.state!=="open")throw new Error("ARCA_WORK_WAKE_PR_NOT_OPEN");
    if(pr?.head?.repo?.full_name!==repository||pr?.head?.ref!==branch)throw new Error("ARCA_WORK_WAKE_PR_HEAD_MISMATCH");
    return pr;
  }
  const descriptor=createExecutionEndpointDescriptor({
    endpointId,
    participantKind:"agent",
    capabilities,
    operations:{wake:true,heartbeat:true,ack:true,result:true},
    transport:{
      kind:"github-pr-commit-trigger",
      repository,
      ref:branch,
      pullRequestNumber:prNumber,
      stimulusPath:path,
      nativeWorkTrigger:true,
      githubActionsRequired:false
    }
  });
  const adapter=Object.freeze({
    async wake(wake){
      await inspectTriggerSurface();
      let current=null;
      const getResponse=await fetchImpl(`${contentUrl}?ref=${encodeURIComponent(branch)}`,{headers});
      if(getResponse.status!==404){
        const text=await getResponse.text();let body=null;try{body=text?JSON.parse(text):null}catch{body={message:text}}
        if(!getResponse.ok){const error=new Error(`GitHub API ${getResponse.status}: ${body?.message||getResponse.statusText}`);error.status=getResponse.status;throw error}
        current=body;
      }
      const tokenValue=probeToken(wake.wakeId);
      const payload={
        message:`runtime(work): wake ${wake.wakeId.slice(0,12)}`,
        content:Buffer.from(renderProbe(wake)).toString("base64"),
        branch
      };
      if(current?.sha)payload.sha=current.sha;
      const updated=await request(contentUrl,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const commitSha=String(updated?.commit?.sha??"").toLowerCase();
      if(!HASH40.test(commitSha))throw new Error("ARCA_WORK_WAKE_COMMIT_SHA_INVALID");
      return Object.freeze({
        format:ARCA_WORK_GITHUB_WAKE_RECEIPT_FORMAT,
        endpointId:wake.endpointId,
        wakeId:wake.wakeId,
        probeToken:tokenValue,
        repository,
        ref:branch,
        pullRequestNumber:prNumber,
        stimulusPath:path,
        commitSha,
        trigger:"github-pr-commit-update",
        githubActionsUsed:false,
        externalExecutionObserved:false,
        authorityGranted:false
      });
    },
    async heartbeat(){
      const pr=await inspectTriggerSurface();
      return Object.freeze({format:ARCA_WORK_GITHUB_HEARTBEAT_FORMAT,endpointId,available:true,repository,ref:branch,pullRequestNumber:prNumber,observedHeadSha:String(pr?.head?.sha??"")||null,workExecutionObserved:false});
    },
    async result(input={}){
      const jobId=String(input.jobId??"").trim();
      const requestId=input.requestId===undefined||input.requestId===null?null:String(input.requestId).trim();
      if(!jobId||jobId.length>160)throw new Error("ARCA_WORK_RESULT_JOB_ID_INVALID");
      if(requestId!==null&&(!requestId||requestId.length>160))throw new Error("ARCA_WORK_RESULT_REQUEST_ID_INVALID");
      await inspectTriggerSurface();
      const comments=await request(commentsUrl);
      const matches=[];
      for(const comment of Array.isArray(comments)?comments:[]){
        const body=String(comment?.body??"");
        if(!body.startsWith("ARCA-WORK-RESULT-V1"))continue;
        const raw=body.slice("ARCA-WORK-RESULT-V1".length).trim();
        let value;try{value=JSON.parse(raw)}catch{continue}
        if(value?.format!=="arca-work-result-v1"||value?.jobId!==jobId)continue;
        if(requestId!==null&&value?.requestId!==requestId)continue;
        if(!WORK_RESULT_STATES.has(value?.status))continue;
        matches.push({comment,value});
      }
      if(matches.length>1)throw new Error("ARCA_WORK_RESULT_CONTRADICTORY_TERMINALS");
      const match=matches[0]??null;
      const safety=match?.value?.safety??{};
      const safetyPassed=match?safety.mainMutated===false&&safety.merged===false&&(safety.shellExecuted===false||safety.arbitraryShellExecuted===false):false;
      const signatureVerified=match?.value?.signatureVerified===true;
      const boundedCompletionEvidence=Boolean(match&&match.value.status==="completed"&&signatureVerified&&safetyPassed);
      return Object.freeze({
        format:ARCA_WORK_GITHUB_RESULT_FORMAT,
        endpointId,
        jobId,
        requestId:requestId??match?.value?.requestId??null,
        found:Boolean(match),
        status:match?.value?.status??null,
        signatureVerified,
        safetyPassed,
        boundedCompletionEvidence,
        trustedCompletion:false,
        workerIdentityCryptographicallyVerified:false,
        result:match?.value??null,
        commentId:match?.comment?.id??null,
        commentUrl:match?.comment?.html_url??match?.comment?.url??null,
        observedAt:match?.comment?.created_at??null,
        authorityGranted:false
      });
    },
    async ack(input={}){
      const wakeId=String(input.wakeId??"").trim().toLowerCase();
      if(!/^[a-f0-9]{64}$/.test(wakeId))throw new Error("ARCA_WORK_WAKE_ID_INVALID");
      const expectedCommit=input.commitSha===undefined||input.commitSha===null?null:String(input.commitSha).trim().toLowerCase();
      if(expectedCommit!==null&&!HASH40.test(expectedCommit))throw new Error("ARCA_WORK_WAKE_COMMIT_SHA_INVALID");
      await inspectTriggerSurface();
      const comments=await request(commentsUrl);
      const tokenValue=probeToken(wakeId);
      const match=(Array.isArray(comments)?comments:[]).find(comment=>{
        const body=String(comment?.body??"");
        return body.includes("WORK-WAKEUP-ACK")&&body.includes(tokenValue)&&(!expectedCommit||body.toLowerCase().includes(expectedCommit));
      })??null;
      return Object.freeze({
        format:ARCA_WORK_GITHUB_ACK_FORMAT,
        endpointId,
        wakeId,
        probeToken:tokenValue,
        acknowledged:Boolean(match),
        commentId:match?.id??null,
        commentUrl:match?.html_url??match?.url??null,
        observedAt:match?.created_at??null,
        authorityGranted:false
      });
    }
  });
  return Object.freeze({descriptor,adapter});
}
