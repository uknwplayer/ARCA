import {createHash} from "node:crypto";
import {AgentDiscoveryCandidateRegistry,AgentDiscoveryFabric} from "../packages/agent/src/agent-discovery.ts";
import {createA2aWellKnownDiscoverySource} from "../packages/agent/src/a2a-discovery.ts";

const origin=String(process.env.ARCA_A2A_DISCOVERY_ORIGIN??"").trim();
if(!origin)throw new Error("ARCA_A2A_DISCOVERY_ORIGIN is required");
const allowLoopback=process.env.ARCA_A2A_ALLOW_LOOPBACK==="true";
const allowedAgentOrigins=String(process.env.ARCA_A2A_ALLOWED_AGENT_ORIGINS??"")
  .split(",")
  .map(value=>value.trim())
  .filter(Boolean);

const registry=new AgentDiscoveryCandidateRegistry();
const source=createA2aWellKnownDiscoverySource({
  sourceId:"live-a2a",
  origin,
  networkEnabled:true,
  allowedAgentOrigins,
  allowLoopback,
  timeoutMs:15000,
  maxResponseBytes:512*1024
});
const fabric=new AgentDiscoveryFabric({
  registry,
  sources:[source]
});
const run=await fabric.run({runId:"A2A-LIVE-DISCOVERY"});
if(run.observedCandidateCount!==1||run.registryCandidateCount!==1){
  throw new Error("live A2A discovery did not yield exactly one candidate");
}
const candidate=registry.list()[0];
if(
  candidate.protocol!=="a2a"||
  candidate.trustState!=="untrusted"||
  candidate.capabilityState!=="declared"||
  candidate.admissionState!=="not-admitted"
){
  throw new Error("live A2A candidate crossed the discovery trust boundary");
}
const endpoint=new URL(candidate.endpoint);
const capabilityDigest=createHash("sha256")
  .update(JSON.stringify([...candidate.declaredCapabilities].sort()))
  .digest("hex");

process.stdout.write(JSON.stringify({
  ok:true,
  sourceKind:source.kind,
  sourceOrigin:new URL(origin).origin,
  protocol:candidate.protocol,
  candidateKey:candidate.candidateKey,
  advertisedId:candidate.advertisedId,
  provider:candidate.provider,
  trustState:candidate.trustState,
  capabilityState:candidate.capabilityState,
  admissionState:candidate.admissionState,
  declaredCapabilityCount:candidate.declaredCapabilities.length,
  declaredCapabilitiesSha256:capabilityDigest,
  advertisedEndpointOrigin:endpoint.origin,
  rawAgentCardPersisted:false,
  candidateExecuted:false,
  trustGranted:false,
  admissionGranted:false,
  dispatchAuthorized:false
})+"\n");
