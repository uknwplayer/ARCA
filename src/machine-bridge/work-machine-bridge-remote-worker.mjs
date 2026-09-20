import {buildWorkDispatchPayload,signWorkDispatchPayload,verifyWorkDispatchEnvelope,verifyWorkDispatchResult} from "./work-dispatch-v1.mjs";
import {machineBridgeJobTaskHash,wakeExecutionEndpointForJob} from "./execution-endpoint.mjs";
import {assertMachineBridgeJobV3} from "./protocol-v3.mjs";
import {ARCA_REPOSITORY_VERIFY_REF_ACTION,normalizeRepositoryVerifyRefParams} from "./repository-verify-ref.mjs";

export class WorkMachineBridgeRemoteWorker{
  constructor({endpointRegistry,endpointId,dispatchTransport,signer,trustedFingerprints,reply,preferredWorkerIds=["work:primary"],allowFailover=false,allowedVerificationRepositories=[]}={}){
    if(!endpointRegistry?.wake||!endpointRegistry?.result)throw new Error("ARCA_WORK_REMOTE_ENDPOINT_REGISTRY_REQUIRED");
    if(typeof endpointId!=="string"||!endpointId)throw new Error("ARCA_WORK_REMOTE_ENDPOINT_ID_REQUIRED");
    if(!dispatchTransport?.getEnvelope||!dispatchTransport?.publishEnvelope)throw new Error("ARCA_WORK_REMOTE_TRANSPORT_REQUIRED");
    if(!signer?.sign)throw new Error("ARCA_WORK_REMOTE_SIGNER_REQUIRED");
    if(!Array.isArray(trustedFingerprints)||trustedFingerprints.length===0)throw new Error("ARCA_WORK_REMOTE_TRUST_ANCHOR_REQUIRED");
    if(!reply?.repository||!reply?.pullRequest)throw new Error("ARCA_WORK_REMOTE_REPLY_REQUIRED");
    this.endpointRegistry=endpointRegistry;this.endpointId=endpointId;this.transport=dispatchTransport;this.signer=signer;this.trustedFingerprints=[...trustedFingerprints];this.reply=reply;this.preferredWorkerIds=[...preferredWorkerIds];this.allowFailover=allowFailover===true;this.allowedVerificationRepositories=[...allowedVerificationRepositories];
  }
  async dispatch(job,{createdAt=new Date(),ttlMs=5*60*1000,eventId=null}={}){
    assertMachineBridgeJobV3(job);
    if(job.action===ARCA_REPOSITORY_VERIFY_REF_ACTION)normalizeRepositoryVerifyRefParams(job.params,{allowedRepositories:this.allowedVerificationRepositories});
    const existing=await this.transport.getEnvelope(job.jobId);
    if(existing){
      const verified=verifyWorkDispatchEnvelope(existing.envelope,{trustedFingerprints:this.trustedFingerprints});
      if(verified.machineBridgeJobHash!==machineBridgeJobTaskHash(job))throw new Error("ARCA_WORK_REMOTE_JOB_ID_CONFLICT");
      const observed=await this.endpointRegistry.result(this.endpointId,{jobId:job.jobId,requestId:job.requestId??job.jobId});
      if(observed?.receipt?.found===true){
        const result=verifyWorkDispatchResult(observed.receipt.result,existing.envelope,{allowedWorkerIds:this.preferredWorkerIds,trustedFingerprints:this.trustedFingerprints});
        return Object.freeze({format:"arca-work-remote-dispatch-v1",status:"terminal-existing",jobId:job.jobId,wakeSent:false,result});
      }
      return Object.freeze({format:"arca-work-remote-dispatch-v1",status:"pending-or-ambiguous-existing",jobId:job.jobId,wakeSent:false,reason:"existing signed envelope without one verified terminal result; automatic replay forbidden"});
    }
    const payload=buildWorkDispatchPayload(job,{createdAt,ttlMs,preferredWorkerIds:this.preferredWorkerIds,allowFailover:this.allowFailover,reply:this.reply});
    const envelope=await signWorkDispatchPayload(payload,{signer:this.signer});
    const verified=verifyWorkDispatchEnvelope(envelope,{trustedFingerprints:this.trustedFingerprints,now:createdAt});
    const stored=await this.transport.publishEnvelope(envelope,{trustedFingerprints:this.trustedFingerprints});
    const wake=await wakeExecutionEndpointForJob({registry:this.endpointRegistry,endpointId:this.endpointId,job,eventId,createdAt:new Date(createdAt).toISOString()});
    return Object.freeze({format:"arca-work-remote-dispatch-v1",status:"dispatched",jobId:job.jobId,requestId:payload.requestId,payloadSha256:verified.payloadSha256,keyFingerprint:verified.keyFingerprint,envelopePath:stored.path,envelopeCommitSha:stored.commitSha,wakeSent:true,wake});
  }
  async observe(jobId,{requestId=null}={}){
    const stored=await this.transport.getEnvelope(jobId);
    if(!stored)return Object.freeze({format:"arca-work-remote-observation-v1",status:"not-dispatched",jobId});
    const verified=verifyWorkDispatchEnvelope(stored.envelope,{trustedFingerprints:this.trustedFingerprints});
    if(stored.envelope.payload.action===ARCA_REPOSITORY_VERIFY_REF_ACTION)normalizeRepositoryVerifyRefParams(stored.envelope.payload.params,{allowedRepositories:this.allowedVerificationRepositories});
    const observed=await this.endpointRegistry.result(this.endpointId,{jobId,requestId:requestId??verified.requestId});
    if(observed?.receipt?.found!==true)return Object.freeze({format:"arca-work-remote-observation-v1",status:"pending-or-ambiguous",jobId,requestId:verified.requestId});
    const result=verifyWorkDispatchResult(observed.receipt.result,stored.envelope,{allowedWorkerIds:this.preferredWorkerIds,trustedFingerprints:this.trustedFingerprints});
    return Object.freeze({format:"arca-work-remote-observation-v1",status:"terminal",jobId,requestId:verified.requestId,result,commentId:observed.receipt.commentId??null,commentUrl:observed.receipt.commentUrl??null});
  }
}
