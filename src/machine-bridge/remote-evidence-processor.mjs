import {
  meshIncomingOwnershipBinding,
  verifyMeshEnvelope,
  verifyMeshResult
} from "./mesh.mjs";

export const ARCA_REMOTE_EVIDENCE_PROCESSOR_FORMAT="arca-remote-evidence-processor-v1";

const SAFE_ID=/^[A-Za-z0-9._-]{1,120}$/;
const REJECTION_CATEGORIES=new Set([
  "invalid-request",
  "policy",
  "capability",
  "unavailable",
  "not-accepted",
  "unknown"
]);

function safeId(value,label){
  if(typeof value!=="string"||!SAFE_ID.test(value))throw new Error("invalid "+label);
  return value;
}
function safeTime(value,label="time"){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("invalid "+label);
  return date;
}
function normalizeMailbox(mailbox){
  for(const method of ["listEnvelopes","claimEnvelope","getResult","writeResult"]){
    if(typeof mailbox?.[method]!=="function")throw new TypeError("remote evidence processor mailbox."+method+"() required");
  }
  return mailbox;
}
function normalizeEvidenceLedger(ledger,nodeId){
  for(const method of ["status","accept","reject","complete"]){
    if(typeof ledger?.[method]!=="function")throw new TypeError("remote evidence processor evidenceLedger."+method+"() required");
  }
  if(ledger.nodeId!==undefined&&ledger.nodeId!==nodeId)throw new Error("remote evidence processor ledger node mismatch");
  return ledger;
}
function normalizePolicy(policy){
  if(policy===null||policy===undefined)return async()=>Object.freeze({accept:true,category:null});
  if(typeof policy!=="function")throw new TypeError("remote evidence processor acceptancePolicy must be a function");
  return async context=>{
    const value=await policy(context);
    if(value===undefined||value===true)return Object.freeze({accept:true,category:null});
    if(value===false)return Object.freeze({accept:false,category:"policy"});
    if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid remote evidence acceptance policy result");
    if(value.accept===true)return Object.freeze({accept:true,category:null});
    if(value.accept!==false)throw new Error("invalid remote evidence acceptance policy result");
    const category=String(value.category??"policy").trim().toLowerCase();
    if(!REJECTION_CATEGORIES.has(category))throw new Error("invalid remote evidence rejection category");
    return Object.freeze({accept:false,category});
  };
}
function unwrapResult(value){
  if(value==null)return null;
  return value?.result&&value?.path!==undefined?value.result:value;
}
function processorError(code,message,cause=null){
  const error=new Error(message);
  error.code=code;
  if(cause)error.cause=cause;
  return error;
}
function publicEvent(fields){
  return Object.freeze({
    format:ARCA_REMOTE_EVIDENCE_PROCESSOR_FORMAT,
    version:1,
    ...fields
  });
}

export class RemoteEvidenceProcessor{
  constructor({
    nodeId,
    mailbox,
    evidenceLedger,
    trustStore,
    execute,
    acceptancePolicy=null,
    now=()=>new Date(),
    requireSignedReceipts=true
  }={}){
    this.nodeId=safeId(nodeId,"remote evidence processor nodeId");
    this.mailbox=normalizeMailbox(mailbox);
    this.evidenceLedger=normalizeEvidenceLedger(evidenceLedger,this.nodeId);
    if(!trustStore||typeof trustStore.verify!=="function")throw new TypeError("remote evidence processor trustStore.verify() required");
    if(typeof execute!=="function")throw new TypeError("remote evidence processor execute() required");
    if(typeof now!=="function")throw new TypeError("remote evidence processor clock required");
    if(requireSignedReceipts!==true&&requireSignedReceipts!==false)throw new TypeError("remote evidence processor requireSignedReceipts must be boolean");
    this.trustStore=trustStore;
    this.execute=execute;
    this.acceptancePolicy=normalizePolicy(acceptancePolicy);
    this.now=now;
    this.requireSignedReceipts=requireSignedReceipts;
  }

  snapshot(){
    return Object.freeze({
      format:ARCA_REMOTE_EVIDENCE_PROCESSOR_FORMAT,
      version:1,
      nodeId:this.nodeId,
      signedReceiptsRequired:this.requireSignedReceipts,
      remoteEvidenceEnabled:true
    });
  }

  #verifyIncoming(envelope){
    verifyMeshEnvelope(envelope,{
      requireSignedReceipts:this.requireSignedReceipts,
      trustStore:this.trustStore
    });
    const ownership=meshIncomingOwnershipBinding(envelope,{nodeId:this.nodeId});
    if(this.requireSignedReceipts&&!ownership.signed)throw new Error("signed ownership binding receipt required");
    if(ownership.requestId!==envelope.requestId||ownership.jobId!==envelope.job.jobId)throw new Error("remote ownership receipt correlation mismatch");
    return ownership;
  }

  #evidenceInput(envelope,ownership,now){
    return Object.freeze({
      requestId:envelope.requestId,
      jobId:envelope.job.jobId,
      payloadHash:envelope.payloadHash,
      ownerBindingHash:ownership.bindingHash,
      now
    });
  }

  #verifyResult(result,envelope){
    verifyMeshResult(result,{
      requireSignedReceipts:this.requireSignedReceipts,
      trustStore:this.trustStore
    });
    if(result.requestId!==envelope.requestId||result.jobId!==envelope.job.jobId)throw new Error("remote evidence processor result correlation mismatch");
    return result;
  }

  async #existingResult(envelope){
    const loaded=unwrapResult(await this.mailbox.getResult(envelope.requestId));
    if(!loaded)return null;
    return this.#verifyResult(loaded,envelope);
  }

  async #completeFromDurable(envelope,ownership,result,{recovered=false}={}){
    const at=safeTime(this.now(),"remote evidence completion time");
    const completion=await this.evidenceLedger.complete({
      ...this.#evidenceInput(envelope,ownership,at),
      resultHash:result.resultHash
    });
    return publicEvent({
      state:"completed",
      requestId:envelope.requestId,
      jobId:envelope.job.jobId,
      resultHash:result.resultHash,
      evidenceStatementHash:completion.statement.statementHash,
      recovered,
      executed:false,
      automaticFailoverAllowed:false
    });
  }

  async processEnvelope(envelope){
    const ownership=this.#verifyIncoming(envelope);
    const at=safeTime(this.now(),"remote evidence processing time");
    const evidenceInput=this.#evidenceInput(envelope,ownership,at);
    let evidenceState=await this.evidenceLedger.status(envelope.requestId);
    const durable=await this.#existingResult(envelope);

    if(evidenceState.state==="rejected"){
      if(durable)throw processorError("ARCA_REMOTE_EVIDENCE_CONTRADICTION","rejected remote request has durable result");
      return publicEvent({
        state:"rejected",
        requestId:envelope.requestId,
        jobId:envelope.job.jobId,
        rejectionCategory:evidenceState.decision?.payload?.rejectionCategory??"unknown",
        evidenceStatementHash:evidenceState.decision?.statementHash??null,
        executed:false,
        automaticFailoverAllowed:false
      });
    }

    if(evidenceState.state==="completed"){
      if(!durable)throw processorError("ARCA_REMOTE_EVIDENCE_RESULT_MISSING","completed remote evidence has no durable result");
      const expected=evidenceState.completion?.payload?.resultHash;
      if(expected!==durable.resultHash)throw processorError("ARCA_REMOTE_EVIDENCE_RESULT_CONFLICT","durable result does not match signed completion evidence");
      return publicEvent({
        state:"completed",
        requestId:envelope.requestId,
        jobId:envelope.job.jobId,
        resultHash:durable.resultHash,
        evidenceStatementHash:evidenceState.completion.statementHash,
        recovered:true,
        executed:false,
        automaticFailoverAllowed:false
      });
    }

    if(durable){
      if(evidenceState.state==="unseen"){
        throw processorError(
          "ARCA_REMOTE_EVIDENCE_ACCEPTANCE_MISSING",
          "durable result exists without prior signed acceptance evidence"
        );
      }
      return this.#completeFromDurable(envelope,ownership,durable,{recovered:true});
    }

    if(evidenceState.state==="accepted"){
      return publicEvent({
        state:"accepted-uncertain",
        requestId:envelope.requestId,
        jobId:envelope.job.jobId,
        evidenceStatementHash:evidenceState.decision?.statementHash??null,
        executed:false,
        automaticFailoverAllowed:false,
        reason:"accepted-without-durable-result"
      });
    }

    const decision=await this.acceptancePolicy(Object.freeze({
      nodeId:this.nodeId,
      requestId:envelope.requestId,
      jobId:envelope.job.jobId,
      payloadHash:envelope.payloadHash,
      ownerBindingHash:ownership.bindingHash,
      requiredCapabilities:Object.freeze([...envelope.requiredCapabilities]),
      envelope
    }));

    if(!decision.accept){
      const rejected=await this.evidenceLedger.reject({
        ...evidenceInput,
        rejectionCategory:decision.category
      });
      return publicEvent({
        state:"rejected",
        requestId:envelope.requestId,
        jobId:envelope.job.jobId,
        rejectionCategory:decision.category,
        evidenceStatementHash:rejected.statement.statementHash,
        executed:false,
        automaticFailoverAllowed:false
      });
    }

    const accepted=await this.evidenceLedger.accept(evidenceInput);
    if(!accepted.created){
      const racedResult=await this.#existingResult(envelope);
      if(racedResult)return this.#completeFromDurable(envelope,ownership,racedResult,{recovered:true});
      return publicEvent({
        state:"accepted-uncertain",
        requestId:envelope.requestId,
        jobId:envelope.job.jobId,
        evidenceStatementHash:accepted.statement.statementHash,
        executed:false,
        automaticFailoverAllowed:false,
        reason:"accepted-by-another-processor"
      });
    }

    let result;
    try{
      result=this.#verifyResult(await this.execute(envelope),envelope);
    }catch(error){
      throw processorError(
        "ARCA_REMOTE_EVIDENCE_EXECUTION_UNCERTAIN",
        "remote execution outcome uncertain after signed acceptance",
        error
      );
    }

    try{
      const created=await this.mailbox.writeResult(result);
      if(!created){
        const existing=await this.#existingResult(envelope);
        if(!existing)throw new Error("durable result write conflict without readable result");
        if(existing.resultHash!==result.resultHash)throw processorError(
          "ARCA_REMOTE_EVIDENCE_RESULT_CONFLICT",
          "durable result conflicts with local execution result"
        );
        result=existing;
      }
    }catch(error){
      if(error?.code==="ARCA_REMOTE_EVIDENCE_RESULT_CONFLICT")throw error;
      throw processorError(
        "ARCA_REMOTE_EVIDENCE_RESULT_PERSIST_UNCERTAIN",
        "remote result persistence outcome uncertain after execution",
        error
      );
    }

    try{
      const completed=await this.evidenceLedger.complete({
        ...this.#evidenceInput(envelope,ownership,safeTime(this.now(),"remote evidence completion time")),
        resultHash:result.resultHash
      });
      return publicEvent({
        state:"completed",
        requestId:envelope.requestId,
        jobId:envelope.job.jobId,
        resultHash:result.resultHash,
        evidenceStatementHash:completed.statement.statementHash,
        recovered:false,
        executed:true,
        automaticFailoverAllowed:false
      });
    }catch(error){
      throw processorError(
        "ARCA_REMOTE_EVIDENCE_COMPLETION_PENDING",
        "durable result exists but signed completion evidence is pending",
        error
      );
    }
  }

  async runOnce({
    processorId,
    leaseMs=120_000,
    maxItems=20
  }={}){
    const consumer=safeId(processorId,"remote evidence processorId");
    if(!Number.isSafeInteger(leaseMs)||leaseMs<5000||leaseMs>15*60*1000)throw new Error("invalid remote evidence processor leaseMs");
    if(!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>100)throw new Error("invalid remote evidence processor maxItems");
    const queued=(await this.mailbox.listEnvelopes(this.nodeId)).slice(0,maxItems);
    const events=[];
    for(const item of queued){
      const envelope=item?.envelope;
      if(!envelope)continue;
      const claimed=await this.mailbox.claimEnvelope(this.nodeId,envelope.requestId,consumer,{
        leaseMs,
        now:safeTime(this.now(),"remote evidence claim time")
      });
      if(!claimed)continue;
      try{
        events.push(await this.processEnvelope(envelope));
      }catch(error){
        events.push(publicEvent({
          state:"error",
          requestId:envelope.requestId,
          jobId:envelope.job?.jobId??null,
          errorCode:typeof error?.code==="string"?error.code:"ARCA_REMOTE_EVIDENCE_PROCESSOR_FAILED",
          executed:error?.code==="ARCA_REMOTE_EVIDENCE_EXECUTION_UNCERTAIN"||
            error?.code==="ARCA_REMOTE_EVIDENCE_RESULT_PERSIST_UNCERTAIN"||
            error?.code==="ARCA_REMOTE_EVIDENCE_COMPLETION_PENDING",
          automaticFailoverAllowed:false
        }));
      }
    }
    return Object.freeze({
      format:"arca-remote-evidence-processor-scan-v1",
      version:1,
      nodeId:this.nodeId,
      scanned:queued.length,
      processed:events.length,
      events:Object.freeze(events)
    });
  }
}
