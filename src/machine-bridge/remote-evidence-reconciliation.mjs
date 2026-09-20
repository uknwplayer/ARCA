import {
  observeRemoteRequestEvidence,
  readRemoteRequestEvidence
} from "./remote-request-evidence.mjs";

export const ARCA_REMOTE_EVIDENCE_RECONCILIATION_FORMAT="arca-remote-evidence-reconciliation-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const MAX_BATCH=100;

function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function safeNow(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid reconciliation time");
  return date;
}
function normalizeSources(values){
  if(!Array.isArray(values)||values.length===0)throw new TypeError("remote evidence sources required");
  const out=new Map();
  for(const value of values){
    if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("invalid remote evidence source");
    const nodeId=safeId(value.nodeId,"remote evidence source nodeId");
    if(typeof value.storage?.read!=="function")throw new TypeError("remote evidence source storage.read() required");
    if(out.has(nodeId))throw new Error("duplicate remote evidence source: "+nodeId);
    out.set(nodeId,Object.freeze({nodeId,storage:value.storage}));
  }
  return out;
}
function conflict(code,message){
  const error=new Error(message);
  error.code=code;
  return error;
}
function publicResult(fields){
  return Object.freeze({
    format:ARCA_REMOTE_EVIDENCE_RECONCILIATION_FORMAT,
    version:1,
    ...fields,
    reDispatchPerformed:false,
    automaticFailoverAllowed:false
  });
}

export class RemoteEvidenceReconciliationController{
  #ownershipStore;
  #trustStore;
  #sources;
  #now;
  #clockSkewMs;

  constructor({
    ownershipStore,
    trustStore,
    remoteSources,
    now=()=>new Date(),
    clockSkewMs=60_000
  }={}){
    if(typeof ownershipStore?.status!=="function"||typeof ownershipStore?.markCompleted!=="function"){
      throw new TypeError("remote evidence reconciliation ownershipStore status/markCompleted required");
    }
    if(!trustStore||typeof trustStore.verify!=="function")throw new TypeError("remote evidence reconciliation trustStore.verify() required");
    if(typeof now!=="function")throw new TypeError("remote evidence reconciliation clock required");
    if(!Number.isSafeInteger(clockSkewMs)||clockSkewMs<0||clockSkewMs>5*60*1000)throw new Error("invalid remote evidence reconciliation clock skew");
    this.#ownershipStore=ownershipStore;
    this.#trustStore=trustStore;
    this.#sources=normalizeSources(remoteSources);
    this.#now=now;
    this.#clockSkewMs=clockSkewMs;
  }

  snapshot(){
    return Object.freeze({
      format:ARCA_REMOTE_EVIDENCE_RECONCILIATION_FORMAT,
      version:1,
      configuredNodeIds:Object.freeze([...this.#sources.keys()].sort()),
      sourceCount:this.#sources.size,
      observationalOnly:true,
      canDispatch:false,
      automaticFailoverAllowed:false
    });
  }

  async reconcile(requestId,{now=this.#now()}={}){
    const normalizedRequest=safeId(requestId,"remote evidence reconciliation requestId");
    const at=safeNow(now);
    const before=await this.#ownershipStore.status(normalizedRequest);

    if(before.state==="unbound"){
      return publicResult({
        state:"unbound",
        requestId:normalizedRequest,
        jobId:null,
        selectedNodeId:null,
        localStateBefore:"unbound",
        localStateAfter:"unbound",
        remoteEvidenceState:"not-read",
        decisionStatementHash:null,
        completionStatementHash:null,
        resultHash:null,
        rejectionCategory:null,
        reconciledAt:at.toISOString()
      });
    }

    const source=this.#sources.get(before.selectedNodeId);
    if(!source)throw conflict(
      "ARCA_REMOTE_EVIDENCE_SOURCE_MISSING",
      "no explicit remote evidence source for selected owner"
    );

    const remote=await readRemoteRequestEvidence({
      storage:source.storage,
      nodeId:before.selectedNodeId,
      requestId:before.requestId,
      trustStore:this.#trustStore,
      now:at,
      clockSkewMs:this.#clockSkewMs
    });

    if(before.state==="reserved"&&remote.state!=="unseen"){
      throw conflict(
        "ARCA_REMOTE_EVIDENCE_LOCAL_DISPATCH_MISSING",
        "remote evidence exists before local dispatch marker"
      );
    }

    if(remote.state==="unseen"){
      return publicResult({
        state:before.state,
        requestId:before.requestId,
        jobId:before.jobId,
        selectedNodeId:before.selectedNodeId,
        localStateBefore:before.state,
        localStateAfter:before.state,
        remoteEvidenceState:"unseen",
        decisionStatementHash:null,
        completionStatementHash:null,
        resultHash:before.resultHash??null,
        rejectionCategory:null,
        reconciledAt:at.toISOString()
      });
    }

    const decisionObservation=await observeRemoteRequestEvidence(remote.decision,{
      trustStore:this.#trustStore,
      ownershipStore:this.#ownershipStore,
      now:at,
      clockSkewMs:this.#clockSkewMs
    });

    if(remote.state==="rejected"){
      if(before.state==="completed"){
        throw conflict(
          "ARCA_REMOTE_EVIDENCE_STATE_CONFLICT",
          "remote rejection conflicts with local completion"
        );
      }
      const after=await this.#ownershipStore.status(before.requestId);
      return publicResult({
        state:"rejected",
        requestId:before.requestId,
        jobId:before.jobId,
        selectedNodeId:before.selectedNodeId,
        localStateBefore:before.state,
        localStateAfter:after.state,
        remoteEvidenceState:"rejected",
        decisionStatementHash:decisionObservation.statementHash,
        completionStatementHash:null,
        resultHash:after.resultHash??null,
        rejectionCategory:decisionObservation.rejectionCategory,
        reconciledAt:at.toISOString()
      });
    }

    if(remote.state==="accepted"){
      const after=await this.#ownershipStore.status(before.requestId);
      return publicResult({
        state:after.state==="uncertain"?"accepted-uncertain":after.state==="completed"?"completed":"accepted",
        requestId:before.requestId,
        jobId:before.jobId,
        selectedNodeId:before.selectedNodeId,
        localStateBefore:before.state,
        localStateAfter:after.state,
        remoteEvidenceState:"accepted",
        decisionStatementHash:decisionObservation.statementHash,
        completionStatementHash:null,
        resultHash:after.resultHash??null,
        rejectionCategory:null,
        reconciledAt:at.toISOString()
      });
    }

    if(remote.state!=="completed"||!remote.completion)throw new Error("unsupported remote evidence reconciliation state");

    const completionObservation=await observeRemoteRequestEvidence(remote.completion,{
      trustStore:this.#trustStore,
      ownershipStore:this.#ownershipStore,
      now:at,
      clockSkewMs:this.#clockSkewMs
    });
    const after=await this.#ownershipStore.status(before.requestId);
    if(after.state!=="completed")throw new Error("remote completion did not reconcile local ownership");

    return publicResult({
      state:"completed",
      requestId:before.requestId,
      jobId:before.jobId,
      selectedNodeId:before.selectedNodeId,
      localStateBefore:before.state,
      localStateAfter:after.state,
      remoteEvidenceState:"completed",
      decisionStatementHash:decisionObservation.statementHash,
      completionStatementHash:completionObservation.statementHash,
      resultHash:after.resultHash,
      rejectionCategory:null,
      reconciledAt:at.toISOString()
    });
  }

  async runOnce({requestIds,now=this.#now()}={}){
    if(!Array.isArray(requestIds)||requestIds.length===0)throw new TypeError("remote evidence reconciliation requestIds required");
    const unique=[...new Set(requestIds.map(value=>safeId(value,"remote evidence reconciliation requestId")))];
    if(unique.length>MAX_BATCH)throw new Error("remote evidence reconciliation batch exceeds "+MAX_BATCH);
    const at=safeNow(now);
    const results=[];
    for(const requestId of unique){
      try{
        results.push(await this.reconcile(requestId,{now:at}));
      }catch(error){
        results.push(Object.freeze({
          format:ARCA_REMOTE_EVIDENCE_RECONCILIATION_FORMAT,
          version:1,
          state:"error",
          requestId,
          errorCode:typeof error?.code==="string"?error.code:"ARCA_REMOTE_EVIDENCE_RECONCILIATION_FAILED",
          reconciledAt:at.toISOString(),
          reDispatchPerformed:false,
          automaticFailoverAllowed:false
        }));
      }
    }
    return Object.freeze({
      format:"arca-remote-evidence-reconciliation-scan-v1",
      version:1,
      reconciledAt:at.toISOString(),
      requested:unique.length,
      results:Object.freeze(results)
    });
  }
}
