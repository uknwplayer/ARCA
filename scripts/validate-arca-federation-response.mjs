import {generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";
import {createArcaFederationIntroduction,createArcaNodeManifest} from "../src/machine-bridge/arca-node-manifest.mjs";
import {
  createArcaFederationResponse,
  signArcaFederationResponse,
  verifyArcaFederationResponse,
  verifySignedArcaFederationResponse
} from "../src/machine-bridge/arca-federation-response.mjs";

const arca=generateMeshNodeIdentity("arca-validation-node");
const remote=generateMeshNodeIdentity("remote-validation-node");
const manifest=createArcaNodeManifest({
  nodeId:arca.identity.nodeId,
  identity:arca.identity,
  capabilities:["federation-introduction"],
  repositoryUrl:"https://github.com/example/arca"
});
const now=new Date("2026-09-20T03:00:00Z");
const introduction=createArcaFederationIntroduction({
  manifest,
  candidateKey:"validation-candidate",
  advertisedId:"validation-agent",
  discoverySourceKind:"validation-only",
  discoveryReferenceSha256:"a".repeat(64),
  introductionId:"validation-response-intro-01",
  issuedAt:now,
  ttlMs:60000
});
const response=createArcaFederationResponse({
  introduction,
  responderNodeId:remote.identity.nodeId,
  responderIdentity:remote.identity,
  decision:"accept-evaluation",
  responseId:"validation-response-01",
  issuedAt:new Date("2026-09-20T03:00:10Z")
});
if(!verifyArcaFederationResponse(response,{introduction}))throw new Error("response verification failed");
const signed=signArcaFederationResponse(response,remote,{
  nonce:"response-validation-0001",
  issuedAt:new Date("2026-09-20T03:00:10Z"),
  ttlMs:60000
});
verifySignedArcaFederationResponse(signed,{
  introduction,
  now:new Date("2026-09-20T03:00:20Z"),
  clockSkewMs:0
});
if(response.trustGranted||response.admissionGranted||response.dispatchGranted||response.executionGranted){
  throw new Error("response escalated authority");
}
process.stdout.write(JSON.stringify({
  ok:true,
  validationOnly:true,
  externalContact:false,
  decision:response.decision,
  evaluationConsent:response.evaluationConsent,
  responseHash:response.responseHash,
  statementHash:signed.statementHash,
  trustGranted:false,
  admissionGranted:false,
  dispatchGranted:false,
  executionGranted:false
})+"\n");
