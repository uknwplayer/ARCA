import {resolveA2aGithubRepository} from "../packages/agent/src/a2a-github-repository-resolution.ts";

const referenceUrl=String(process.env.ARCA_A2A_GITHUB_REFERENCE_URL??"").trim();
const allowedAgentOrigins=String(process.env.ARCA_A2A_ALLOWED_AGENT_ORIGINS??"")
  .split(",")
  .map(value=>value.trim())
  .filter(Boolean);
if(!referenceUrl)throw new Error("ARCA_A2A_GITHUB_REFERENCE_URL is required");
if(allowedAgentOrigins.length<1||allowedAgentOrigins.length>5){
  throw new Error("ARCA_A2A_ALLOWED_AGENT_ORIGINS must contain between 1 and 5 origins");
}

const result=await resolveA2aGithubRepository({
  sourceId:"live-a2a-github-repository",
  referenceUrl,
  networkEnabled:true,
  allowedAgentOrigins,
  timeoutMs:15000,
  maxCardBytes:512*1024
});

if(result.cardStatus!=="candidate-created"||result.candidateCreated!==true||!result.candidate){
  throw new Error("live GitHub A2A repository resolution did not create a candidate");
}
if(
  result.candidate.trustState!=="untrusted"||
  result.candidate.capabilityState!=="declared"||
  result.candidate.admissionState!=="not-admitted"||
  result.rawAgentCardPersisted!==false||
  result.candidateExecuted!==false||
  result.trustGranted!==false||
  result.admissionGranted!==false||
  result.dispatchAuthorized!==false
){
  throw new Error("live GitHub A2A repository resolution crossed trust boundary");
}

process.stdout.write(JSON.stringify({
  ok:true,
  sourceKind:result.sourceKind,
  repository:result.repository,
  repositoryUrl:result.repositoryUrl,
  defaultBranch:result.defaultBranch,
  cardStatus:result.cardStatus,
  cardPath:result.cardPath,
  cardSha256:result.cardSha256,
  contentSha:result.contentSha,
  advertisedEndpointOrigin:result.advertisedEndpointOrigin,
  endpointOriginAuthorized:result.endpointOriginAuthorized,
  candidate:{
    candidateKey:result.candidate.candidateKey,
    advertisedId:result.candidate.advertisedId,
    name:result.candidate.name,
    provider:result.candidate.provider,
    protocol:result.candidate.protocol,
    endpoint:result.candidate.endpoint,
    declaredCapabilities:result.candidate.declaredCapabilities,
    declaredCapabilityCount:result.candidate.declaredCapabilities.length,
    trustState:result.candidate.trustState,
    capabilityState:result.candidate.capabilityState,
    admissionState:result.candidate.admissionState
  },
  rawAgentCardPersisted:false,
  candidateExecuted:false,
  trustGranted:false,
  admissionGranted:false,
  dispatchAuthorized:false
})+"\n");
