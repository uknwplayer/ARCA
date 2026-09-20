import {createHash} from "node:crypto";
import {inspectA2aReference} from "../packages/agent/src/a2a-reference-inspection.ts";

const references=String(process.env.ARCA_A2A_REFERENCE_URLS??"")
  .split(",")
  .map(value=>value.trim())
  .filter(Boolean);
if(references.length<1||references.length>5)throw new Error("ARCA_A2A_REFERENCE_URLS must contain between 1 and 5 URLs");

const results=[];
for(let index=0;index<references.length;index++){
  const reference=references[index];
  const result=await inspectA2aReference({
    sourceId:"live-a2a-reference-"+(index+1),
    referenceUrl:reference,
    networkEnabled:true,
    timeoutMs:15000,
    maxResponseBytes:512*1024
  });
  results.push(result);
}

const completed=results.filter(result=>result.inspectionStatus==="completed");
if(completed.length<1)throw new Error("live A2A reference inspection yielded no direct Agent Card candidate");
for(const result of results){
  if(
    result.rawAgentCardPersisted!==false||
    result.candidateExecuted!==false||
    result.trustGranted!==false||
    result.admissionGranted!==false||
    result.dispatchAuthorized!==false
  )throw new Error("live A2A reference inspection crossed trust boundary");
  if(result.candidate){
    if(
      result.candidate.trustState!=="untrusted"||
      result.candidate.capabilityState!=="declared"||
      result.candidate.admissionState!=="not-admitted"
    )throw new Error("live A2A candidate crossed trust boundary");
  }
}

process.stdout.write(JSON.stringify({
  ok:true,
  referenceCount:results.length,
  directInspectionCount:completed.length,
  classifications:results.map(result=>({
    referenceSha256:createHash("sha256").update(result.classification.normalizedUrl).digest("hex"),
    kind:result.classification.kind,
    repository:result.classification.repository,
    inspectionStatus:result.inspectionStatus
  })),
  candidates:completed.map(result=>({
    advertisedId:result.candidate.advertisedId,
    name:result.candidate.name,
    provider:result.candidate.provider,
    endpointOrigin:new URL(result.candidate.endpoint).origin,
    declaredCapabilityCount:result.candidate.declaredCapabilities.length,
    trustState:result.candidate.trustState,
    capabilityState:result.candidate.capabilityState,
    admissionState:result.candidate.admissionState
  })),
  rawAgentCardPersisted:false,
  candidateExecuted:false,
  trustGranted:false,
  admissionGranted:false,
  dispatchAuthorized:false
})+"\n");
