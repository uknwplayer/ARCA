import {AgentDiscoveryCandidateRegistry,AgentDiscoveryFabric} from "./agent-discovery.ts";
import {createA2aWellKnownDiscoverySource} from "./a2a-discovery.ts";
import {classifyA2aReference} from "./a2a-reference-classification.ts";

export const ARCA_A2A_REFERENCE_INSPECTION_FORMAT="arca-a2a-reference-inspection-v1";

export async function inspectA2aReference({
  sourceId="a2a-reference-inspection",
  referenceUrl,
  networkEnabled=false,
  allowedAgentOrigins=[],
  fetchImpl=globalThis.fetch,
  timeoutMs=10000,
  maxResponseBytes=512*1024,
  now=()=>new Date()
}={}){
  const classification=classifyA2aReference(referenceUrl);
  if(classification.kind!=="direct-agent-card"){
    return Object.freeze({
      format:ARCA_A2A_REFERENCE_INSPECTION_FORMAT,
      version:1,
      classification,
      inspectionStatus:"not-applicable",
      candidate:null,
      rawAgentCardPersisted:false,
      candidateExecuted:false,
      trustGranted:false,
      admissionGranted:false,
      dispatchAuthorized:false
    });
  }

  const registry=new AgentDiscoveryCandidateRegistry();
  const source=createA2aWellKnownDiscoverySource({
    sourceId,
    origin:classification.sourceOrigin,
    networkEnabled,
    allowedAgentOrigins,
    fetchImpl,
    timeoutMs,
    maxResponseBytes
  });
  const fabric=new AgentDiscoveryFabric({registry,sources:[source],now});
  const run=await fabric.run({runId:"A2A-REFERENCE-INSPECTION"});
  if(run.observedCandidateCount!==1||run.registryCandidateCount!==1){
    throw new Error("A2A direct reference inspection did not yield exactly one candidate");
  }
  const candidate=registry.list()[0];
  if(
    candidate.trustState!=="untrusted"||
    candidate.capabilityState!=="declared"||
    candidate.admissionState!=="not-admitted"
  ){
    throw new Error("A2A direct reference crossed the discovery trust boundary");
  }

  return Object.freeze({
    format:ARCA_A2A_REFERENCE_INSPECTION_FORMAT,
    version:1,
    classification,
    inspectionStatus:"completed",
    candidate,
    rawAgentCardPersisted:false,
    candidateExecuted:false,
    trustGranted:false,
    admissionGranted:false,
    dispatchAuthorized:false
  });
}
