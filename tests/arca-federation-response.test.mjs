import test from "node:test";
import assert from "node:assert/strict";
import {generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";
import {
  createArcaFederationIntroduction,
  createArcaNodeManifest
} from "../src/machine-bridge/arca-node-manifest.mjs";
import {
  createArcaFederationResponse,
  signArcaFederationResponse,
  verifyArcaFederationResponse,
  verifySignedArcaFederationResponse
} from "../src/machine-bridge/arca-federation-response.mjs";

function fixture(){
  const arca=generateMeshNodeIdentity("arca-node-test");
  const remote=generateMeshNodeIdentity("remote-node-test");
  const manifest=createArcaNodeManifest({
    nodeId:"arca-node-test",
    identity:arca.identity,
    capabilities:["federation-introduction"],
    repositoryUrl:"https://github.com/example/arca"
  });
  const introduction=createArcaFederationIntroduction({
    manifest,
    candidateKey:"candidate-key-01",
    advertisedId:"a2a-example",
    discoverySourceKind:"validation-only",
    discoveryReferenceSha256:"1".repeat(64),
    introductionId:"intro-response-0001",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60000
  });
  return {remote,introduction};
}

test("accept-evaluation records consent without granting authority",()=>{
  const {remote,introduction}=fixture();
  const response=createArcaFederationResponse({
    introduction,
    responderNodeId:remote.identity.nodeId,
    responderIdentity:remote.identity,
    decision:"accept-evaluation",
    responseId:"response-0001",
    issuedAt:new Date("2026-09-20T03:00:10Z")
  });
  assert.equal(response.evaluationConsent,true);
  assert.equal(response.trustGranted,false);
  assert.equal(response.admissionGranted,false);
  assert.equal(response.dispatchGranted,false);
  assert.equal(response.executionGranted,false);
  assert.equal(verifyArcaFederationResponse(response,{introduction}),true);
});

test("decline remains a valid non-consent response",()=>{
  const {introduction}=fixture();
  const response=createArcaFederationResponse({
    introduction,
    responderNodeId:"remote-unsigned",
    decision:"decline",
    responseId:"response-0002",
    issuedAt:new Date("2026-09-20T03:00:10Z")
  });
  assert.equal(response.responderIdentity,null);
  assert.equal(response.evaluationConsent,false);
  assert.equal(verifyArcaFederationResponse(response,{introduction}),true);
});

test("signed response uses the dedicated federation response domain",()=>{
  const {remote,introduction}=fixture();
  const response=createArcaFederationResponse({
    introduction,
    responderNodeId:remote.identity.nodeId,
    responderIdentity:remote.identity,
    decision:"limit-scope",
    responseId:"response-0003",
    issuedAt:new Date("2026-09-20T03:00:10Z")
  });
  const statement=signArcaFederationResponse(response,remote,{
    nonce:"response-nonce-000001",
    issuedAt:new Date("2026-09-20T03:00:10Z"),
    ttlMs:60000
  });
  assert.equal(verifySignedArcaFederationResponse(statement,{
    introduction,
    now:new Date("2026-09-20T03:00:20Z"),
    clockSkewMs:0
  }),true);
});

test("response tampering or authority escalation fails closed",()=>{
  const {remote,introduction}=fixture();
  const response=createArcaFederationResponse({
    introduction,
    responderNodeId:remote.identity.nodeId,
    responderIdentity:remote.identity,
    decision:"request-info",
    responseId:"response-0004",
    issuedAt:new Date("2026-09-20T03:00:10Z")
  });
  assert.equal(verifyArcaFederationResponse({...response,trustGranted:true},{introduction}),false);
  assert.equal(verifyArcaFederationResponse({...response,responseHash:"0".repeat(64)},{introduction}),false);
});
