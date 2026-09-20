import {createDurableInvestigationQueue} from "./investigation-queue.mjs";
import {createAgentDispatchPolicy} from "./event-agent-dispatch-policy.mjs";
import {createEventFabricRuntime} from "./event-fabric-runtime.mjs";

export const INVESTIGATION_WAKEUP_SCHEMA="arca.investigation-wakeup.v0.1";
export const PRIVATE_INVESTIGATIVE_WORK_SCHEMA="arca.private-investigative-work.v0.1";

const EVENT_TYPES=Object.freeze(["case.candidate","investigation.updated"]);
const SAFE_ID=/^investigation-[0-9a-f]{24}$/;
const SAFE_REASON=/^(?:[0-9a-f]{64}|investigation-[0-9a-f]{24}:retry:[1-9][0-9]*)$/;

function dateFromClock(clock){
  const value=clock();
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error("ARCA_INVESTIGATION_RUNTIME_INVALID_CLOCK");
  return date;
}

function wakeDescriptor(record,reasonId){
  const trigger=record.triggers.find(item=>item.triggerId===reasonId);
  if(trigger)return {type:"case.candidate",kind:trigger.kind,createdAt:trigger.receivedAt};
  const contribution=record.contributions.find(item=>item.contributionId===reasonId);
  if(contribution)return {type:"investigation.updated",kind:contribution.kind,createdAt:contribution.receivedAt};
  throw new Error("ARCA_INVESTIGATION_RUNTIME_WAKE_REASON_NOT_FOUND");
}

function validateWakeEvent(event){
  const payload=event?.payload;
  if(!EVENT_TYPES.includes(event?.type)||payload?.schema!==INVESTIGATION_WAKEUP_SCHEMA)
    throw new Error("ARCA_INVESTIGATION_RUNTIME_EVENT_INVALID");
  if(!SAFE_ID.test(payload.investigationId)||event.subject!==payload.investigationId)
    throw new Error("ARCA_INVESTIGATION_RUNTIME_SUBJECT_INVALID");
  if(!SAFE_REASON.test(payload.reasonId)||typeof payload.reasonKind!=="string"||payload.reasonKind.length>64)
    throw new Error("ARCA_INVESTIGATION_RUNTIME_REASON_INVALID");
  if(!Number.isInteger(payload.priority)||payload.priority<0||payload.priority>100)
    throw new Error("ARCA_INVESTIGATION_RUNTIME_PRIORITY_INVALID");
  if(payload.humanReviewRequired!==true)
    throw new Error("ARCA_INVESTIGATION_RUNTIME_REVIEW_GATE_REQUIRED");
  return payload;
}

export function createInvestigationAutonomyRuntime({
  queueRoot,
  eventRoot,
  backend,
  workerId="private-investigative-backend",
  leaseMs=60000,
  source="arca.shared-investigation-queue",
  clock=()=>new Date(),
  fsImpl
}={}){
  if(!queueRoot||!eventRoot)throw new Error("ARCA_INVESTIGATION_RUNTIME_ROOTS_REQUIRED");
  if(!backend||typeof backend.acceptWork!=="function")
    throw new Error("ARCA_INVESTIGATION_RUNTIME_BACKEND_REQUIRED");
  if(typeof workerId!=="string"||!/^[A-Za-z0-9_.:-]{1,128}$/.test(workerId))
    throw new Error("ARCA_INVESTIGATION_RUNTIME_WORKER_INVALID");
  if(typeof source!=="string"||source.length<1||source.length>128)
    throw new Error("ARCA_INVESTIGATION_RUNTIME_SOURCE_INVALID");

  const queue=createDurableInvestigationQueue({root:queueRoot,clock,fsImpl});

  const handle=async event=>{
    const payload=validateWakeEvent(event);
    const claim=queue.claim(payload.investigationId,{workerId,leaseMs});
    if(!claim.acquired)return {
      accepted:false,
      status:claim.reason,
      investigationId:payload.investigationId
    };
    try{
      const receipt=await backend.acceptWork(Object.freeze({
        schema:PRIVATE_INVESTIGATIVE_WORK_SCHEMA,
        investigationId:payload.investigationId,
        eventId:event.eventId,
        eventType:event.type,
        reasonIds:Object.freeze([...claim.lease.wakeReasons]),
        attempt:claim.lease.attempt,
        humanReviewRequired:true
      }));
      if(receipt?.accepted!==true)
        throw new Error("ARCA_INVESTIGATION_RUNTIME_BACKEND_REJECTED");
      queue.complete(payload.investigationId,{workerId,outcome:"success"});
      return {
        accepted:true,
        status:"completed",
        investigationId:payload.investigationId,
        backendReceiptRef:receipt.receiptRef??null
      };
    }catch(error){
      try{queue.complete(payload.investigationId,{workerId,outcome:"failure"})}catch{}
      throw error;
    }
  };

  const policy=createAgentDispatchPolicy({routes:{
    "case.candidate":[workerId],
    "investigation.updated":[workerId]
  }});
  const eventRuntime=createEventFabricRuntime({
    root:eventRoot,
    policy,
    agents:{[workerId]:handle},
    eventTypes:EVENT_TYPES,
    clock:()=>dateFromClock(clock).toISOString(),
    fsImpl
  });

  async function publishReason(record,reasonId){
    const descriptor=wakeDescriptor(record,reasonId);
    return eventRuntime.publish({
      type:descriptor.type,
      source,
      subject:record.investigationId,
      createdAt:descriptor.createdAt,
      payload:{
        schema:INVESTIGATION_WAKEUP_SCHEMA,
        investigationId:record.investigationId,
        reasonId,
        reasonKind:descriptor.kind,
        priority:record.priority,
        humanReviewRequired:true
      }
    });
  }

  async function publishPendingRecord(record){
    const results=[];
    for(const reasonId of record.pendingWakeReasons)
      results.push(await publishReason(record,reasonId));
    return results;
  }

  return Object.freeze({
    schema:"arca.investigation-autonomy-runtime.v0.1",
    queue,
    eventRuntime,

    async request(input){
      const result=queue.request(input);
      const events=result.awakened?await publishPendingRecord(result.record):[];
      return {...result,events};
    },

    async contribute(investigationId,input){
      const result=queue.contribute(investigationId,input);
      const events=result.awakened?await publishPendingRecord(result.record):[];
      return {...result,events};
    },

    async recoverPending({authorizeFailedRetry=false}={}){
      if(typeof authorizeFailedRetry!=="boolean")
        throw new Error("ARCA_INVESTIGATION_RUNTIME_RECOVERY_AUTH_INVALID");
      const results=[];
      for(const record of queue.list()){
        if(record.pendingWakeReasons.length===0)continue;
        const replay=await publishPendingRecord(record);
        results.push(...replay.map(event=>({investigationId:record.investigationId,kind:"replay",event})));
        const lease=queue.getLease(record.investigationId);
        if(authorizeFailedRetry&&lease?.status==="released-failed"){
          const attempt=(lease.attempt??0)+1;
          const event=await eventRuntime.publish({
            type:"investigation.updated",
            source,
            subject:record.investigationId,
            createdAt:lease.completedAt,
            payload:{
              schema:INVESTIGATION_WAKEUP_SCHEMA,
              investigationId:record.investigationId,
              reasonId:`${record.investigationId}:retry:${attempt}`,
              reasonKind:"RECOVERY_RETRY",
              priority:record.priority,
              humanReviewRequired:true
            }
          });
          results.push({investigationId:record.investigationId,kind:"authorized-retry",event});
        }
      }
      return results;
    },

    get(investigationId){return queue.get(investigationId)},
    list(){return queue.list()},
    transition(investigationId,targetState,options){return queue.transition(investigationId,targetState,options)}
  });
}
