import {createHash,randomBytes} from "node:crypto";
import {
  verifyV41AttestedResult,
  validateV41Request
} from "./vince-v4-1-attestation.mjs";
import {
  appendV41AcceptedChallenge,
  createV41DurableChallengeLedger,
  hasV41AcceptedChallenge,
  validateV41AcceptedChallengeRegistry,
  v41ChallengeSha256
} from "./vince-v4-1-durable-challenge-registry.mjs";
import {
  loadTermuxV41Identity,
  makeGhChannelClient,
  runTermuxV41OneShot,
  TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  TERMUX_V41_DEFAULT_CHANNEL_REPO
} from "./vince-v4-1-termux-worker.mjs";

export const ARCA_VINCE_V5_V411_DISPATCH_FORMAT="arca-vince-v5-v4.1.1-selected-dispatch-v1";
export const ARCA_VINCE_V5_V411_ACCEPTANCE_FORMAT="arca-vince-v5-v4.1.1-selected-acceptance-v1";
export const ARCA_VINCE_V411_REGISTRY_PATH="remote-jobs/v4.1/control/accepted-challenges.json";

const HASH=/^[a-f0-9]{64}$/;
const NODE=/^[A-Za-z0-9._-]{1,120}$/;
const JOB=/^vince-v41-[A-Za-z0-9._-]{1,96}$/;
const PATH=/^remote-jobs\/[A-Za-z0-9._\/-]{1,300}\.json$/;

function plain(v){return !!v&&typeof v==="object"&&!Array.isArray(v)}
function canonical(v){
  if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
  if(plain(v))return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
  return JSON.stringify(v);
}
export function v5V411Sha256(value){
  return createHash("sha256").update(Buffer.from(canonical(value),"utf8")).digest("hex");
}
function exactKeys(value,keys){
  return plain(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
}
function assertIso(value,label){
  if(typeof value!=="string"||!Number.isFinite(Date.parse(value))||new Date(Date.parse(value)).toISOString()!==value)
    throw new Error(`VINCE_V5_V411_${label}_INVALID`);
  return Date.parse(value);
}
function assertPin(pin){
  if(!pin||pin.format!=="arca-vince-v4.1-worker-pin"||pin.version!==1||
     pin.workerKind!=="termux-android"||!pin.identity||!NODE.test(pin.identity.nodeId)||
     !HASH.test(pin.identity.keyFingerprint)||pin.policy?.action!=="git-status"||
     pin.policy?.automaticRetryAllowed!==false||pin.policy?.failoverAllowed!==false||
     pin.policy?.authorityExpanded!==false||pin.policy?.coreMutationAllowed!==false||
     pin.policy?.trustModificationAllowed!==false)
    throw new Error("VINCE_V5_V411_PIN_INVALID");
  return pin.identity;
}
function assertRouteProof(routeProof){
  if(!routeProof||routeProof.format!=="arca-vince-v5-termux-route-proof-v1"||routeProof.version!==1)
    throw new Error("VINCE_V5_V411_ROUTE_PROOF_INVALID");
  if(routeProof.route?.state!=="AVAILABLE"||routeProof.route?.dispatchPerformed!==false||
     routeProof.route?.eligibleCount!==1||typeof routeProof.route?.selectedEndpointId!=="string")
    throw new Error("VINCE_V5_V411_ROUTE_NOT_UNAMBIGUOUS");
  return routeProof.route.selectedEndpointId;
}

export function buildV5SelectedV41Request({
  jobId,
  challenge=randomBytes(32).toString("base64url"),
  expiresAt
}={}){
  if(!JOB.test(String(jobId??"")))throw new Error("VINCE_V5_V411_JOB_ID_INVALID");
  const request={
    format:"arca-vince-v4.1-job",
    protocolVersion:"4.1",
    jobId,
    action:"git-status",
    expiresAt:new Date(expiresAt).toISOString(),
    challenge
  };
  const {requestSha256}=validateV41Request(request,{now:new Date(Date.parse(request.expiresAt)-1)});
  return Object.freeze({request:Object.freeze(request),requestSha256});
}

export function buildV5SelectedV411Dispatch({
  routeProof,
  selectedPin,
  request,
  presencePaths,
  routePath,
  createdAt=new Date().toISOString()
}={}){
  const selectedEndpointId=assertRouteProof(routeProof);
  const identity=assertPin(selectedPin);
  if(identity.nodeId!==selectedEndpointId)throw new Error("VINCE_V5_V411_SELECTED_PIN_MISMATCH");
  if(!Array.isArray(presencePaths)||presencePaths.length<1||presencePaths.some(p=>typeof p!=="string"||!PATH.test(p)))
    throw new Error("VINCE_V5_V411_PRESENCE_PATH_INVALID");
  if(typeof routePath!=="string"||!PATH.test(routePath))
    throw new Error("VINCE_V5_V411_ROUTE_PATH_INVALID");
  const now=assertIso(new Date(createdAt).toISOString(),"CREATED_AT");
  const {requestSha256}=validateV41Request(request,{now:new Date(now)});
  const routeProofSha256=v5V411Sha256(routeProof);
  const base={
    format:ARCA_VINCE_V5_V411_DISPATCH_FORMAT,
    version:1,
    jobId:request.jobId,
    action:"git-status",
    selectedEndpointId,
    selectedWorkerKeyFingerprint:identity.keyFingerprint,
    requestSha256,
    routeProofSha256,
    routePath,
    presencePaths:[...presencePaths],
    createdAt:new Date(now).toISOString(),
    expiresAt:request.expiresAt,
    policy:Object.freeze({
      automaticRetryAllowed:false,
      automaticFailoverAllowed:false,
      exactlyOneEligibleRequired:true
    }),
    authority:Object.freeze({
      trustGranted:false,
      codeMutation:false,
      canonicalWrite:false,
      executionAuthority:false
    })
  };
  return Object.freeze({...base,dispatchSha256:v5V411Sha256(base)});
}

export function verifyV5SelectedV411Dispatch({
  dispatch,
  request,
  pin,
  routeProof,
  localIdentity=null,
  now=new Date()
}={}){
  if(!exactKeys(dispatch,[
    "format","version","jobId","action","selectedEndpointId","selectedWorkerKeyFingerprint",
    "requestSha256","routeProofSha256","routePath","presencePaths","createdAt","expiresAt",
    "policy","authority","dispatchSha256"
  ])||dispatch.format!==ARCA_VINCE_V5_V411_DISPATCH_FORMAT||dispatch.version!==1||
     !JOB.test(dispatch.jobId)||dispatch.action!=="git-status"||!NODE.test(dispatch.selectedEndpointId)||
     !HASH.test(dispatch.selectedWorkerKeyFingerprint)||!HASH.test(dispatch.requestSha256)||
     !HASH.test(dispatch.routeProofSha256)||!HASH.test(dispatch.dispatchSha256))
    throw new Error("VINCE_V5_V411_DISPATCH_SCHEMA_INVALID");
  if(!exactKeys(dispatch.policy,["automaticRetryAllowed","automaticFailoverAllowed","exactlyOneEligibleRequired"])||
     dispatch.policy.automaticRetryAllowed!==false||dispatch.policy.automaticFailoverAllowed!==false||
     dispatch.policy.exactlyOneEligibleRequired!==true)
    throw new Error("VINCE_V5_V411_DISPATCH_POLICY_INVALID");
  if(!exactKeys(dispatch.authority,["trustGranted","codeMutation","canonicalWrite","executionAuthority"])||
     Object.values(dispatch.authority).some(v=>v!==false))
    throw new Error("VINCE_V5_V411_DISPATCH_AUTHORITY_INVALID");
  if(!Array.isArray(dispatch.presencePaths)||dispatch.presencePaths.length<1||
     dispatch.presencePaths.some(p=>typeof p!=="string"||!PATH.test(p))||
     typeof dispatch.routePath!=="string"||!PATH.test(dispatch.routePath))
    throw new Error("VINCE_V5_V411_DISPATCH_PATH_INVALID");
  const base={...dispatch}; delete base.dispatchSha256;
  if(v5V411Sha256(base)!==dispatch.dispatchSha256)
    throw new Error("VINCE_V5_V411_DISPATCH_HASH_MISMATCH");
  assertIso(dispatch.createdAt,"CREATED_AT");
  assertIso(dispatch.expiresAt,"EXPIRES_AT");
  const identity=assertPin(pin);
  if(identity.nodeId!==dispatch.selectedEndpointId||
     identity.keyFingerprint!==dispatch.selectedWorkerKeyFingerprint)
    throw new Error("VINCE_V5_V411_SELECTED_PIN_MISMATCH");
  if(localIdentity!==null&&(
     localIdentity.nodeId!==dispatch.selectedEndpointId||
     localIdentity.keyFingerprint!==dispatch.selectedWorkerKeyFingerprint))
    throw new Error("VINCE_V5_V411_LOCAL_WORKER_NOT_SELECTED");
  const {requestSha256}=validateV41Request(request,{now});
  if(request.jobId!==dispatch.jobId||request.action!==dispatch.action||
     request.expiresAt!==dispatch.expiresAt||requestSha256!==dispatch.requestSha256)
    throw new Error("VINCE_V5_V411_REQUEST_BINDING_MISMATCH");
  const selected=assertRouteProof(routeProof);
  if(selected!==dispatch.selectedEndpointId||v5V411Sha256(routeProof)!==dispatch.routeProofSha256)
    throw new Error("VINCE_V5_V411_ROUTE_BINDING_MISMATCH");
  return Object.freeze({selectedEndpointId:selected,requestSha256});
}

export async function publishV5SelectedV411Dispatch({
  routeProof,
  pins,
  presencePaths,
  jobId,
  expiresAt,
  channelRepository=TERMUX_V41_DEFAULT_CHANNEL_REPO,
  channelBranch=TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  channelClient=makeGhChannelClient(),
  clock=()=>new Date()
}={}){
  const selectedEndpointId=assertRouteProof(routeProof);
  if(!Array.isArray(pins))throw new Error("VINCE_V5_V411_PINS_REQUIRED");
  const selectedPin=pins.find(pin=>pin?.identity?.nodeId===selectedEndpointId);
  if(!selectedPin)throw new Error("VINCE_V5_V411_SELECTED_PIN_NOT_FOUND");
  const built=buildV5SelectedV41Request({jobId,expiresAt});
  const routePath=`remote-jobs/v5/routes/${jobId}.json`;
  const requestPath=`remote-jobs/v4.1/requests/${jobId}.json`;
  const dispatchPath=`remote-jobs/v5/dispatches/${jobId}.json`;
  const dispatch=buildV5SelectedV411Dispatch({
    routeProof,
    selectedPin,
    request:built.request,
    presencePaths,
    routePath,
    createdAt:clock().toISOString()
  });
  await channelClient.createJson({
    repository:channelRepository,branch:channelBranch,path:routePath,
    message:`vince v5 selected route: ${jobId}`,value:routeProof
  });
  await channelClient.createJson({
    repository:channelRepository,branch:channelBranch,path:requestPath,
    message:`vince v5 selected request: ${jobId}`,value:built.request
  });
  await channelClient.createJson({
    repository:channelRepository,branch:channelBranch,path:dispatchPath,
    message:`vince v5 selected dispatch: ${jobId} -> ${selectedEndpointId}`,value:dispatch
  });
  return Object.freeze({
    status:"SELECTED_ONE_SHOT_REQUEST_PUBLISHED",
    jobId,
    selectedEndpointId,
    selectedWorkerKeyFingerprint:selectedPin.identity.keyFingerprint,
    requestPath,
    routePath,
    dispatchPath,
    requestSha256:built.requestSha256,
    dispatchSha256:dispatch.dispatchSha256,
    workerExecutionObserved:false,
    automaticRetryPerformed:false,
    automaticFailoverPerformed:false
  });
}

export async function runV5SelectedV411OneShot({
  jobId,
  pin,
  identityDirectory,
  repoPath=process.cwd(),
  channelRepository=TERMUX_V41_DEFAULT_CHANNEL_REPO,
  channelBranch=TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  channelClient=makeGhChannelClient(),
  clock=()=>new Date()
}={}){
  if(!JOB.test(String(jobId??"")))throw new Error("VINCE_V5_V411_JOB_ID_INVALID");
  const dispatchPath=`remote-jobs/v5/dispatches/${jobId}.json`;
  const requestPath=`remote-jobs/v4.1/requests/${jobId}.json`;
  const [dispatch,request,loaded]=await Promise.all([
    channelClient.readJson({repository:channelRepository,branch:channelBranch,path:dispatchPath}),
    channelClient.readJson({repository:channelRepository,branch:channelBranch,path:requestPath}),
    loadTermuxV41Identity({directory:identityDirectory})
  ]);
  const routeProof=await channelClient.readJson({
    repository:channelRepository,branch:channelBranch,path:dispatch.routePath
  });
  const bound=verifyV5SelectedV411Dispatch({
    dispatch,request,pin,routeProof,localIdentity:loaded.identity,now:clock()
  });
  const result=await runTermuxV41OneShot({
    jobId,
    repoPath,
    identityDirectory,
    channelRepository,
    channelBranch,
    channelClient,
    clock,
    expectedRequestSha256:bound.requestSha256,
    expectedWorkerNodeId:dispatch.selectedEndpointId,
    expectedWorkerKeyFingerprint:dispatch.selectedWorkerKeyFingerprint
  });
  return Object.freeze({
    status:"SELECTED_ONE_SHOT_COMPLETED",
    dispatchSha256:dispatch.dispatchSha256,
    selectedEndpointId:dispatch.selectedEndpointId,
    ...result
  });
}

export async function verifyConsumeV5SelectedV411({
  jobId,
  pin,
  channelRepository=TERMUX_V41_DEFAULT_CHANNEL_REPO,
  channelBranch=TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  registryPath=ARCA_VINCE_V411_REGISTRY_PATH,
  channelClient=makeGhChannelClient(),
  clock=()=>new Date()
}={}){
  if(!JOB.test(String(jobId??"")))throw new Error("VINCE_V5_V411_JOB_ID_INVALID");
  const dispatchPath=`remote-jobs/v5/dispatches/${jobId}.json`;
  const requestPath=`remote-jobs/v4.1/requests/${jobId}.json`;
  const resultPath=`remote-jobs/v4.1/results/${jobId}.json`;
  const acceptedPath=`remote-jobs/v5/accepted/${jobId}.json`;
  const [dispatch,request,result,registryMeta]=await Promise.all([
    channelClient.readJson({repository:channelRepository,branch:channelBranch,path:dispatchPath}),
    channelClient.readJson({repository:channelRepository,branch:channelBranch,path:requestPath}),
    channelClient.readJson({repository:channelRepository,branch:channelBranch,path:resultPath}),
    channelClient.readJsonWithMeta({repository:channelRepository,branch:channelBranch,path:registryPath})
  ]);
  const routeProof=await channelClient.readJson({
    repository:channelRepository,branch:channelBranch,path:dispatch.routePath
  });
  verifyV5SelectedV411Dispatch({dispatch,request,pin,routeProof,now:clock()});
  const registry=registryMeta.value;
  validateV41AcceptedChallengeRegistry(registry);
  if(hasV41AcceptedChallenge(registry,request.challenge))
    throw new Error("VINCE_V41_CHALLENGE_REPLAY");
  const ledger=createV41DurableChallengeLedger(registry);
  const proof=verifyV41AttestedResult({
    request,result,pinnedIdentity:pin.identity,challengeLedger:ledger,now:clock(),
    remoteEnvironment:"termux-android",transport:"github-contents-v4.1"
  });
  if(proof.workerNodeId!==dispatch.selectedEndpointId||
     proof.workerKeyFingerprint!==dispatch.selectedWorkerKeyFingerprint||
     proof.requestSha256!==dispatch.requestSha256)
    throw new Error("VINCE_V5_V411_ATTESTATION_SELECTION_MISMATCH");
  const acceptedAt=clock().toISOString();
  const nextRegistry=appendV41AcceptedChallenge(registry,proof,{acceptedAt});
  await channelClient.updateJsonCas({
    repository:channelRepository,branch:channelBranch,path:registryPath,
    message:`ops(vince): consume selected V4.1.1 challenge ${jobId}`,
    value:nextRegistry,sha:registryMeta.blobSha
  });
  const persisted=await channelClient.readJsonWithMeta({
    repository:channelRepository,branch:channelBranch,path:registryPath
  });
  validateV41AcceptedChallengeRegistry(persisted.value);
  const challengeSha256=v41ChallengeSha256(request.challenge);
  const entry=persisted.value.entries.find(x=>x.challengeSha256===challengeSha256);
  if(!entry||entry.missionId!==jobId||entry.proofSha256!==proof.proofSha256||
     entry.workerNodeId!==dispatch.selectedEndpointId)
    throw new Error("VINCE_V5_V411_DURABLE_READBACK_MISMATCH");
  const body={
    format:ARCA_VINCE_V5_V411_ACCEPTANCE_FORMAT,
    version:1,
    jobId,
    selectedEndpointId:dispatch.selectedEndpointId,
    selectedWorkerKeyFingerprint:dispatch.selectedWorkerKeyFingerprint,
    dispatchSha256:dispatch.dispatchSha256,
    routeProofSha256:dispatch.routeProofSha256,
    requestSha256:proof.requestSha256,
    resultSha256:proof.resultSha256,
    attestationProofSha256:proof.proofSha256,
    challengeSha256,
    durableRegistryBlobSha:persisted.blobSha,
    acceptedAt:entry.acceptedAt,
    state:"ATTESTED_VERIFIED_SELECTED_RESULT_DURABLY_CONSUMED",
    automaticRetryPerformed:false,
    automaticFailoverPerformed:false,
    authorityExpanded:false
  };
  const acceptance=Object.freeze({...body,acceptanceSha256:v5V411Sha256(body)});
  await channelClient.createJson({
    repository:channelRepository,branch:channelBranch,path:acceptedPath,
    message:`vince v5 selected acceptance: ${jobId}`,value:acceptance
  });
  return Object.freeze({
    status:"ATTESTED_VERIFIED_SELECTED_RESULT_DURABLY_CONSUMED",
    acceptedPath,
    acceptance,
    proof
  });
}

export async function proveV5SelectedV411ReplayRejected({
  jobId,
  channelRepository=TERMUX_V41_DEFAULT_CHANNEL_REPO,
  channelBranch=TERMUX_V41_DEFAULT_CHANNEL_BRANCH,
  registryPath=ARCA_VINCE_V411_REGISTRY_PATH,
  channelClient=makeGhChannelClient()
}={}){
  if(!JOB.test(String(jobId??"")))throw new Error("VINCE_V5_V411_JOB_ID_INVALID");
  const request=await channelClient.readJson({
    repository:channelRepository,branch:channelBranch,
    path:`remote-jobs/v4.1/requests/${jobId}.json`
  });
  const registry=await channelClient.readJson({
    repository:channelRepository,branch:channelBranch,path:registryPath
  });
  validateV41AcceptedChallengeRegistry(registry);
  if(!hasV41AcceptedChallenge(registry,request.challenge))
    throw new Error("VINCE_V5_V411_REPLAY_NOT_YET_CONSUMED");
  const entry=registry.entries.find(x=>x.challengeSha256===v41ChallengeSha256(request.challenge));
  if(!entry||entry.missionId!==jobId)throw new Error("VINCE_V5_V411_REPLAY_ENTRY_MISMATCH");
  return Object.freeze({
    status:"DURABLE_REPLAY_REJECTED",
    missionId:jobId,
    workerNodeId:entry.workerNodeId,
    challengeSha256:entry.challengeSha256,
    workerReexecuted:false,
    registryDurable:true
  });
}
