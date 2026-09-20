import {
  readRemoteRequestEvidence,
  verifyRemoteRequestEvidenceStatement
} from "./remote-request-evidence.mjs";

const SAFE=/^[A-Za-z0-9._:-]{1,128}$/;

function normalizeSources(values){
  if(!Array.isArray(values)||values.length===0) throw new Error("ARCA_EVENT_REMOTE_COMPLETION_SOURCES_REQUIRED");
  const out=new Map();
  for(const value of values){
    if(!value||typeof value!=="object"||Array.isArray(value)||!SAFE.test(value.nodeId)||typeof value.storage?.read!=="function"){
      throw new Error("ARCA_EVENT_REMOTE_COMPLETION_SOURCE_INVALID");
    }
    if(out.has(value.nodeId)) throw new Error("ARCA_EVENT_REMOTE_COMPLETION_SOURCE_DUPLICATE");
    out.set(value.nodeId,Object.freeze({nodeId:value.nodeId,storage:value.storage}));
  }
  return out;
}

export function createEventRemoteCompletionSource({
  bindingStore,
  remoteSources,
  trustStore,
  now=()=>new Date(),
  clockSkewMs=60_000
}={}){
  if(typeof bindingStore?.get!=="function") throw new Error("ARCA_EVENT_REMOTE_COMPLETION_BINDING_STORE_REQUIRED");
  if(!trustStore||typeof trustStore.verify!=="function") throw new Error("ARCA_EVENT_REMOTE_COMPLETION_TRUST_REQUIRED");
  if(typeof now!=="function") throw new Error("ARCA_EVENT_REMOTE_COMPLETION_CLOCK_REQUIRED");
  if(!Number.isSafeInteger(clockSkewMs)||clockSkewMs<0||clockSkewMs>5*60*1000) throw new Error("ARCA_EVENT_REMOTE_COMPLETION_CLOCK_SKEW_INVALID");
  const sources=normalizeSources(remoteSources);

  return Object.freeze({
    async lookupVerified({event,handlerId}={}){
      if(!event||typeof event.eventId!=="string"||typeof handlerId!=="string") throw new Error("ARCA_EVENT_REMOTE_COMPLETION_CONTEXT_INVALID");
      const binding=bindingStore.get(event.eventId,handlerId);
      if(!binding) return null;

      const source=sources.get(binding.nodeId);
      if(!source) throw new Error("ARCA_EVENT_REMOTE_COMPLETION_SOURCE_MISSING");
      const at=now();
      const remote=await readRemoteRequestEvidence({
        storage:source.storage,
        nodeId:binding.nodeId,
        requestId:binding.requestId,
        trustStore,
        now:at,
        clockSkewMs
      });

      if(remote.state!=="completed"||!remote.completion) return null;

      const verified=verifyRemoteRequestEvidenceStatement(remote.completion,{
        trustStore,
        expectedNodeId:binding.nodeId,
        expectedRequestId:binding.requestId,
        expectedJobId:binding.jobId,
        expectedPayloadHash:binding.payloadHash,
        expectedOwnerBindingHash:binding.ownerBindingHash,
        expectedStage:"completed",
        now:at,
        clockSkewMs
      });

      return Object.freeze({
        eventId:event.eventId,
        handlerId,
        resultHash:verified.evidence.resultHash,
        evidenceHash:remote.completion.statementHash,
        sourceId:"mesh:"+binding.nodeId
      });
    }
  });
}
