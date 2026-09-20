import test from "node:test";
import assert from "node:assert/strict";
import {generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";
import {
  createArcaFederationIntroduction,
  createArcaNodeManifest
} from "../src/machine-bridge/arca-node-manifest.mjs";
import {
  deliverArcaFederationIntroduction
} from "../packages/agent/src/arca-federation-introduction-delivery.ts";

function fixture(){
  const generated=generateMeshNodeIdentity("arca-intro-test");
  const manifest=createArcaNodeManifest({
    nodeId:generated.identity.nodeId,
    identity:generated.identity,
    capabilities:["federation-introduction"],
    repositoryUrl:"https://github.com/example/arca"
  });
  const introduction=createArcaFederationIntroduction({
    manifest,
    candidateKey:"candidate-01",
    advertisedId:"a2a-test",
    discoverySourceKind:"test-source",
    discoveryReferenceSha256:"1".repeat(64),
    introductionId:"intro-delivery-01",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60000
  });
  return {manifest,introduction};
}

test("introduction delivery is network-off by default",async()=>{
  const {manifest,introduction}=fixture();
  await assert.rejects(
    ()=>deliverArcaFederationIntroduction({
      endpoint:"https://agent.example/",
      allowedOrigins:["https://agent.example"],
      manifest,
      introduction
    }),
    error=>error.code==="ARCA_FEDERATION_INTRODUCTION_NETWORK_DISABLED"
  );
});

test("introduction delivery refuses private DNS before POST",async()=>{
  const {manifest,introduction}=fixture();
  let posts=0;
  await assert.rejects(
    ()=>deliverArcaFederationIntroduction({
      endpoint:"https://agent.example/",
      allowedOrigins:["https://agent.example"],
      manifest,
      introduction,
      networkEnabled:true,
      lookupImpl:async()=>[{address:"10.0.0.4",family:4}],
      postImpl:async()=>{posts+=1;return{statusCode:200}}
    }),
    /forbidden IPv4/
  );
  assert.equal(posts,0);
});

test("introduction delivery transmits only the ARCA introduction envelope and preserves authority boundary",async()=>{
  const {manifest,introduction}=fixture();
  let observed=null;
  const result=await deliverArcaFederationIntroduction({
    endpoint:"https://agent.example/",
    allowedOrigins:["https://agent.example"],
    manifest,
    introduction,
    networkEnabled:true,
    lookupImpl:async()=>[{address:"93.184.216.34",family:4}],
    postImpl:async input=>{
      observed=input;
      return{
        statusCode:202,
        tlsAuthorized:true,
        tlsProtocol:"TLSv1.3",
        remoteAddress:"93.184.216.34",
        contentType:"application/json"
      };
    }
  });
  assert.equal(observed.url,"https://agent.example/");
  const payload=JSON.parse(observed.body.toString("utf8"));
  assert.equal(payload.format,"arca-federation-introduction-delivery-v1");
  assert.equal(payload.purpose,"federation-introduction-only");
  assert.equal(payload.introduction.proposal.taskIncluded,false);
  assert.equal(payload.introduction.proposal.executionRequested,false);
  assert.equal(result.introductionTransmitted,true);
  assert.equal(result.authenticationSent,false);
  assert.equal(result.jsonRpcSent,false);
  assert.equal(result.taskSent,false);
  assert.equal(result.deliveryState,"http-accepted-unverified");
  assert.equal(result.recipientAcknowledged,false);
  assert.equal(result.trustGranted,false);
  assert.equal(result.admissionGranted,false);
  assert.equal(result.dispatchAuthorized,false);
  assert.equal(result.executionAuthorized,false);
});

test("cross-origin access redirect is classified and never followed",async()=>{
  const {manifest,introduction}=fixture();
  const result=await deliverArcaFederationIntroduction({
    endpoint:"https://agent.example/",
    allowedOrigins:["https://agent.example"],
    manifest,
    introduction,
    networkEnabled:true,
    lookupImpl:async()=>[{address:"93.184.216.34",family:4}],
    postImpl:async()=>({
      statusCode:302,
      location:"https://team.cloudflareaccess.com/cdn-cgi/access/login/agent.example?state=opaque",
      tlsAuthorized:true,
      remoteAddress:"93.184.216.34"
    })
  });
  assert.equal(result.redirectReceived,true);
  assert.equal(result.redirectFollowed,false);
  assert.equal(result.accessGate.detected,true);
  assert.equal(result.deliveryState,"access-gated-before-recipient");
  assert.equal(result.recipientAcknowledged,false);
});

test("remote address mismatch fails closed",async()=>{
  const {manifest,introduction}=fixture();
  await assert.rejects(
    ()=>deliverArcaFederationIntroduction({
      endpoint:"https://agent.example/",
      allowedOrigins:["https://agent.example"],
      manifest,
      introduction,
      networkEnabled:true,
      lookupImpl:async()=>[{address:"93.184.216.34",family:4}],
      postImpl:async()=>({
        statusCode:202,
        tlsAuthorized:true,
        remoteAddress:"93.184.216.35"
      })
    }),
    /did not match pinned DNS/
  );
});
