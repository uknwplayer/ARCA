import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign
} from "node:crypto";
import {spawnSync} from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  chmod,
  stat
} from "node:fs/promises";
import {homedir} from "node:os";
import {join,resolve} from "node:path";
import {
  ARCA_VINCE_V41_RESULT_FORMAT,
  signedV41Bytes,
  validateV41Request
} from "./vince-v4-1-attestation.mjs";
import {sha256Canonical} from "./vince-v4-replit.mjs";

export const TERMUX_V41_DEFAULT_IDENTITY_DIR=join(homedir(),".arca","vince-v41");
export const TERMUX_V41_DEFAULT_CHANNEL_REPO="uknwplayer/ARCA";
export const TERMUX_V41_DEFAULT_CHANNEL_BRANCH="vince-v41-termux-channel";
export const TERMUX_V41_WORKER_KIND="termux-android";
const JOB_ID=/^vince-v41-[A-Za-z0-9._-]{1,96}$/;
const NODE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const MAX_OUTPUT_BYTES=128*1024;

function sha256Bytes(value){return createHash("sha256").update(value).digest("hex")}
function run(command,args,{cwd,env=process.env,timeout=15_000,maxBuffer=MAX_OUTPUT_BYTES}={}){
  const out=spawnSync(command,args,{cwd,env,encoding:"utf8",shell:false,timeout,maxBuffer});
  if(out.error)throw out.error;
  if(out.status!==0){
    const detail=(out.stderr||out.stdout||"").slice(0,4000);
    throw new Error(`TERMUX_V41_COMMAND_FAILED:${command}:${out.status}:${detail}`);
  }
  return {stdout:out.stdout??"",stderr:out.stderr??""};
}
async function exists(path){try{await stat(path);return true}catch{return false}}
function safeJobId(jobId){
  if(typeof jobId!=="string"||!JOB_ID.test(jobId))throw new Error("TERMUX_V41_JOB_ID_INVALID");
  return jobId;
}
function identityPaths(directory){
  const dir=resolve(directory||TERMUX_V41_DEFAULT_IDENTITY_DIR);
  return {
    dir,
    privateKey:join(dir,"ed25519-private.pem"),
    identity:join(dir,"identity.json"),
    ledger:join(dir,"used-challenges.json")
  };
}
function identityFromPublicKey(publicKey,{nodeId}){
  const der=Buffer.from(publicKey.export({type:"spki",format:"der"}));
  return Object.freeze({
    nodeId,
    algorithm:"Ed25519",
    publicKeySpki:der.toString("base64"),
    keyFingerprint:sha256Bytes(der)
  });
}

export async function initTermuxV41Identity({
  directory=TERMUX_V41_DEFAULT_IDENTITY_DIR,
  nodeId="vince-termux-android-1"
}={}){
  if(!NODE_ID.test(nodeId))throw new Error("TERMUX_V41_NODE_ID_INVALID");
  const paths=identityPaths(directory);
  await mkdir(paths.dir,{recursive:true,mode:0o700});
  if(await exists(paths.privateKey)||await exists(paths.identity))
    throw new Error("TERMUX_V41_IDENTITY_ALREADY_EXISTS");
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const privatePem=privateKey.export({type:"pkcs8",format:"pem"});
  const identity=identityFromPublicKey(publicKey,{nodeId});
  await writeFile(paths.privateKey,privatePem,{encoding:"utf8",mode:0o600,flag:"wx"});
  await chmod(paths.privateKey,0o600);
  await writeFile(paths.identity,JSON.stringify(identity,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  await chmod(paths.identity,0o600);
  await writeFile(paths.ledger,JSON.stringify({version:1,challenges:[]},null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  await chmod(paths.ledger,0o600);
  return {identity,paths:{directory:paths.dir,identity:paths.identity,ledger:paths.ledger}};
}

export async function loadTermuxV41Identity({
  directory=TERMUX_V41_DEFAULT_IDENTITY_DIR
}={}){
  const paths=identityPaths(directory);
  const [privatePem,identityRaw]=await Promise.all([
    readFile(paths.privateKey,"utf8"),
    readFile(paths.identity,"utf8")
  ]);
  const stored=JSON.parse(identityRaw);
  if(!stored||!NODE_ID.test(stored.nodeId)||stored.algorithm!=="Ed25519")
    throw new Error("TERMUX_V41_IDENTITY_INVALID");
  const privateKey=createPrivateKey(privatePem);
  if(privateKey.asymmetricKeyType!=="ed25519")throw new Error("TERMUX_V41_PRIVATE_KEY_INVALID");
  const derived=identityFromPublicKey(createPublicKey(privateKey),{nodeId:stored.nodeId});
  for(const key of ["nodeId","algorithm","publicKeySpki","keyFingerprint"]){
    if(stored[key]!==derived[key])throw new Error("TERMUX_V41_IDENTITY_MISMATCH");
  }
  return {privateKey,identity:derived,paths};
}

export function inspectGitStatus({repoPath=process.cwd(),runImpl=run}={}){
  const root=resolve(repoPath);
  const status=runImpl("git",["-C",root,"status","--porcelain=v1","--branch"],{timeout:10_000,maxBuffer:MAX_OUTPUT_BYTES});
  const head=runImpl("git",["-C",root,"rev-parse","HEAD"],{timeout:10_000,maxBuffer:4096}).stdout.trim();
  const branch=runImpl("git",["-C",root,"branch","--show-current"],{timeout:10_000,maxBuffer:4096}).stdout.trim();
  if(!/^[a-f0-9]{40}$/.test(head))throw new Error("TERMUX_V41_GIT_HEAD_INVALID");
  if(!branch)throw new Error("TERMUX_V41_GIT_BRANCH_INVALID");
  const lines=status.stdout.split(/\r?\n/).filter(Boolean);
  const gitDirty=lines.some(line=>!line.startsWith("## "));
  return Object.freeze({
    stdout:status.stdout,
    stderr:status.stderr,
    gitBranch:branch,
    gitHead:head,
    gitDirty
  });
}

export function buildSignedTermuxV41Result({
  request,
  identity,
  privateKey,
  git,
  startedAt,
  finishedAt
}={}){
  const {requestSha256}=validateV41Request(request,{now:new Date(startedAt)});
  if(!identity||identity.algorithm!=="Ed25519")throw new Error("TERMUX_V41_IDENTITY_INVALID");
  const base={
    format:ARCA_VINCE_V41_RESULT_FORMAT,
    protocolVersion:"4.1",
    jobId:request.jobId,
    action:request.action,
    challenge:request.challenge,
    requestSha256,
    startedAt:new Date(startedAt).toISOString(),
    finishedAt:new Date(finishedAt).toISOString(),
    status:"completed",
    exitCode:0,
    timedOut:false,
    stdout:String(git.stdout??"").slice(0,MAX_OUTPUT_BYTES),
    stderr:String(git.stderr??"").slice(0,MAX_OUTPUT_BYTES),
    stdoutTruncated:String(git.stdout??"").length>MAX_OUTPUT_BYTES,
    stderrTruncated:String(git.stderr??"").length>MAX_OUTPUT_BYTES,
    gitBranch:git.gitBranch,
    gitHead:git.gitHead,
    gitDirty:git.gitDirty,
    workerIdentity:identity
  };
  if(base.stdoutTruncated||base.stderrTruncated)throw new Error("TERMUX_V41_OUTPUT_BUDGET_EXCEEDED");
  const resultSha256=sha256Canonical(base);
  const withHash={...base,resultSha256};
  const signature=cryptoSign(null,signedV41Bytes(withHash),privateKey).toString("base64url");
  return Object.freeze({...withHash,signature});
}

async function readLedger(path){
  try{
    const parsed=JSON.parse(await readFile(path,"utf8"));
    if(parsed?.version!==1||!Array.isArray(parsed.challenges))throw new Error();
    return parsed;
  }catch(error){
    if(error?.code==="ENOENT")return {version:1,challenges:[]};
    throw new Error("TERMUX_V41_LEDGER_INVALID");
  }
}
async function assertChallengeUnused(paths,challenge){
  const ledger=await readLedger(paths.ledger);
  if(ledger.challenges.includes(challenge))throw new Error("TERMUX_V41_CHALLENGE_REPLAY");
  return ledger;
}
async function markChallengeUsed(paths,ledger,challenge){
  const next={version:1,challenges:[...ledger.challenges,challenge].slice(-256)};
  await writeFile(paths.ledger,JSON.stringify(next,null,2)+"\n",{encoding:"utf8",mode:0o600});
  await chmod(paths.ledger,0o600);
}
function ghApi(args,{runImpl=run}={}){
  return runImpl("gh",["api",...args],{timeout:30_000,maxBuffer:512*1024}).stdout;
}
export function makeGhChannelClient({runImpl=run}={}){
  function decodeResponse(raw){
    const response=JSON.parse(raw);
    if(response?.encoding!=="base64"||typeof response.content!=="string"||
       typeof response.sha!=="string"||!/^[a-f0-9]{40}$/.test(response.sha))
      throw new Error("TERMUX_V41_CHANNEL_RESPONSE_INVALID");
    return {
      value:JSON.parse(Buffer.from(response.content.replace(/\n/g,""),"base64").toString("utf8")),
      blobSha:response.sha
    };
  }
  return {
    async readJsonWithMeta({repository,branch,path}){
      const raw=ghApi([
        "--method","GET",
        `repos/${repository}/contents/${path}`,
        "-f",`ref=${branch}`
      ],{runImpl});
      return decodeResponse(raw);
    },
    async readJson(input){
      return (await this.readJsonWithMeta(input)).value;
    },
    async createJson({repository,branch,path,message,value}){
      const content=Buffer.from(JSON.stringify(value,null,2)+"\n","utf8").toString("base64");
      const raw=ghApi([
        "--method","PUT",
        `repos/${repository}/contents/${path}`,
        "-f",`message=${message}`,
        "-f",`content=${content}`,
        "-f",`branch=${branch}`
      ],{runImpl});
      return JSON.parse(raw);
    },
    async updateJsonCas({repository,branch,path,message,value,sha}){
      if(typeof sha!=="string"||!/^[a-f0-9]{40}$/.test(sha))
        throw new Error("TERMUX_V41_CHANNEL_CAS_SHA_INVALID");
      const content=Buffer.from(JSON.stringify(value,null,2)+"\n","utf8").toString("base64");
      const raw=ghApi([
        "--method","PUT",
        `repos/${repository}/contents/${path}`,
        "-f",`message=${message}`,
        "-f",`content=${content}`,
        "-f",`sha=${sha}`,
        "-f",`branch=${branch}`
      ],{runImpl});
      return JSON.parse(raw);
    }
  };
}

export async function publishTermuxV41Identity({
  identityDirectory=TERMUX_V41_DEFAULT_IDENTITY_DIR,
  channelRepository=TERMUX_V41_DEFAULT_CHANNEL_REPO,
  channelBranch=TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  channelClient=makeGhChannelClient()
}={}){
  const loaded=await loadTermuxV41Identity({directory:identityDirectory});
  const path=`remote-jobs/v4.1/identities/${loaded.identity.nodeId}.json`;
  await channelClient.createJson({
    repository:channelRepository,
    branch:channelBranch,
    path,
    message:`vince v4.1 termux public identity: ${loaded.identity.nodeId}`,
    value:{
      format:"arca-vince-v4.1-worker-identity",
      protocolVersion:"4.1",
      workerKind:TERMUX_V41_WORKER_KIND,
      identity:loaded.identity
    }
  });
  return Object.freeze({
    status:"PUBLIC_IDENTITY_PUBLISHED",
    workerKind:TERMUX_V41_WORKER_KIND,
    channelRepository,
    channelBranch,
    path,
    identity:loaded.identity
  });
}

export async function runTermuxV41OneShot({
  jobId,
  repoPath=process.cwd(),
  identityDirectory=TERMUX_V41_DEFAULT_IDENTITY_DIR,
  channelRepository=TERMUX_V41_DEFAULT_CHANNEL_REPO,
  channelBranch=TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  channelClient=makeGhChannelClient(),
  clock=()=>new Date(),
  expectedRequestSha256=null,
  expectedWorkerNodeId=null,
  expectedWorkerKeyFingerprint=null
}={}){
  safeJobId(jobId);
  const requestPath=`remote-jobs/v4.1/requests/${jobId}.json`;
  const resultPath=`remote-jobs/v4.1/results/${jobId}.json`;
  const request=await channelClient.readJson({
    repository:channelRepository,
    branch:channelBranch,
    path:requestPath
  });
  if(request.jobId!==jobId)throw new Error("TERMUX_V41_REQUEST_PATH_MISMATCH");
  const {requestSha256}=validateV41Request(request,{now:clock()});
  if(expectedRequestSha256!==null&&requestSha256!==expectedRequestSha256)
    throw new Error("TERMUX_V41_SELECTED_REQUEST_HASH_MISMATCH");
  const loaded=await loadTermuxV41Identity({directory:identityDirectory});
  if(expectedWorkerNodeId!==null&&loaded.identity.nodeId!==expectedWorkerNodeId)
    throw new Error("TERMUX_V41_SELECTED_WORKER_NODE_MISMATCH");
  if(expectedWorkerKeyFingerprint!==null&&loaded.identity.keyFingerprint!==expectedWorkerKeyFingerprint)
    throw new Error("TERMUX_V41_SELECTED_WORKER_FINGERPRINT_MISMATCH");
  const ledger=await assertChallengeUnused(loaded.paths,request.challenge);

  const startedAt=clock();
  const git=inspectGitStatus({repoPath});
  const finishedAt=clock();
  const result=buildSignedTermuxV41Result({
    request,
    identity:loaded.identity,
    privateKey:loaded.privateKey,
    git,
    startedAt,
    finishedAt
  });
  await channelClient.createJson({
    repository:channelRepository,
    branch:channelBranch,
    path:resultPath,
    message:`vince v4.1 termux result: ${jobId}`,
    value:result
  });
  await markChallengeUsed(loaded.paths,ledger,request.challenge);
  return Object.freeze({
    workerKind:TERMUX_V41_WORKER_KIND,
    jobId,
    resultSha256:result.resultSha256,
    workerIdentity:loaded.identity,
    channelRepository,
    channelBranch,
    requestPath,
    resultPath,
    requestSha256
  });
}
