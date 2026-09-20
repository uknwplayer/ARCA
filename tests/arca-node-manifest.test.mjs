import test from "node:test";
import assert from "node:assert/strict";
import {generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";
import {
  ARCA_FEDERATION_INTRODUCTION_FORMAT,
  ARCA_NODE_MANIFEST_FORMAT,
  createArcaFederationIntroduction,
  createArcaNodeManifest,
  signArcaFederationIntroduction,
  signArcaNodeManifest,
  renderArcaFederationIntroductionText,
  verifyArcaFederationIntroduction,
  verifyArcaNodeManifest,
  verifySignedArcaFederationIntroduction,
  verifySignedArcaNodeManifest
} from "../src/machine-bridge/arca-node-manifest.mjs";

const REF_HASH="1".repeat(64);

function fixture(){
  const generated=generateMeshNodeIdentity("arca-node-test");
  const manifest=createArcaNodeManifest({
    nodeId:"arca-node-test",
    identity:generated.identity,
    version:"0.3.0",
    capabilities:["discovery","federation-introduction"],
    manifestUrl:"https://arca.example/.well-known/arca-node.json",
    repositoryUrl:"https://github.com/example/arca",
    specificationUrl:"https://arca.example/docs/spec",
    securityModelUrl:"https://arca.example/docs/security"
  });
  return {generated,manifest};
}

test("ARCA node manifest is self-describing and preserves trust boundaries",()=>{
  const {manifest}=fixture();
  assert.equal(manifest.format,ARCA_NODE_MANIFEST_FORMAT);
  assert.equal(manifest.about.name,"ARCA");
  assert.match(manifest.about.description,/consent-based federation/);
  assert.equal(manifest.trustModel.discoveryCreatesTrust,false);
  assert.equal(manifest.trustModel.capabilityGrantsPermission,false);
  assert.equal(manifest.trustModel.admissionRequiredBeforeDispatch,true);
  assert.equal(manifest.trustModel.arbitraryRemoteExecution,false);
  assert.equal(manifest.trustModel.consentRequiredForFederation,true);
  assert.equal(verifyArcaNodeManifest(manifest),true);
  assert.match(manifest.manifestHash,/^[a-f0-9]{64}$/);
});

test("ARCA node manifest binds the Mesh identity and rejects tampering",()=>{
  const {manifest}=fixture();
  assert.equal(verifyArcaNodeManifest({...manifest,nodeId:"different-node"}),false);
  assert.equal(verifyArcaNodeManifest({...manifest,manifestHash:"0".repeat(64)}),false);
});

test("signed ARCA node manifest uses its dedicated signature domain",()=>{
  const {generated,manifest}=fixture();
  const statement=signArcaNodeManifest(manifest,generated,{
    nonce:"manifest-nonce-0001",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60_000
  });
  assert.equal(verifySignedArcaNodeManifest(statement,{
    now:new Date("2026-09-20T03:00:30Z"),
    clockSkewMs:0
  }),true);
  assert.equal(statement.payload.manifestHash,manifest.manifestHash);
});

test("federation introduction explains ARCA before asking for enrollment",()=>{
  const {manifest}=fixture();
  const intro=createArcaFederationIntroduction({
    manifest,
    candidateKey:"candidate-key-01",
    advertisedId:"a2a-example",
    discoverySourceKind:"a2a-github-repository",
    discoveryReferenceSha256:REF_HASH,
    requestedScopes:["federation-evaluation","capability-negotiation"],
    introductionId:"intro-0001",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60_000
  });
  assert.equal(intro.format,ARCA_FEDERATION_INTRODUCTION_FORMAT);
  assert.equal(intro.about.name,"ARCA");
  assert.match(intro.about.description,/distributed agents/);
  assert.match(intro.about.trustSummary,/Discovery is not trust/);
  assert.equal(intro.proposal.kind,"federation-enrollment-evaluation");
  assert.equal(intro.proposal.taskIncluded,false);
  assert.equal(intro.proposal.executionRequested,false);
  assert.equal(intro.proposal.trustGrantRequested,false);
  assert.equal(intro.proposal.admissionRequested,false);
  assert.equal(intro.proposal.authMaterialRequested,false);
  assert.deepEqual(intro.responseOptions,[
    "accept-evaluation",
    "decline",
    "request-info",
    "offer-endpoint",
    "offer-auth-method",
    "limit-scope"
  ]);
  assert.equal(verifyArcaFederationIntroduction(intro,{manifest}),true);
});

test("signed federation introduction is bound to sender identity and manifest hash",()=>{
  const {generated,manifest}=fixture();
  const intro=createArcaFederationIntroduction({
    manifest,
    candidateKey:"candidate-key-01",
    advertisedId:"a2a-example",
    discoverySourceKind:"a2a-github-repository",
    discoveryReferenceSha256:REF_HASH,
    introductionId:"intro-0002",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60_000
  });
  const statement=signArcaFederationIntroduction(intro,generated,{
    nonce:"intro-nonce-0000001",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60_000
  });
  assert.equal(verifySignedArcaFederationIntroduction(statement,{
    manifest,
    now:new Date("2026-09-20T03:00:30Z"),
    clockSkewMs:0
  }),true);

  const tampered={...statement,payload:{...statement.payload,about:{...statement.payload.about,name:"OTHER"}}};
  assert.throws(()=>verifySignedArcaFederationIntroduction(tampered,{
    manifest,
    now:new Date("2026-09-20T03:00:30Z"),
    clockSkewMs:0
  }));
});

test("introduction cannot silently request execution, trust, admission or auth material",()=>{
  const {manifest}=fixture();
  const intro=createArcaFederationIntroduction({
    manifest,
    candidateKey:"candidate-key-01",
    advertisedId:"a2a-example",
    discoverySourceKind:"a2a-github-repository",
    discoveryReferenceSha256:REF_HASH,
    introductionId:"intro-0003",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60_000
  });
  for(const field of ["taskIncluded","executionRequested","trustGrantRequested","admissionRequested","authMaterialRequested"]){
    const modified={...intro,proposal:{...intro.proposal,[field]:true}};
    assert.equal(verifyArcaFederationIntroduction(modified,{manifest}),false,field);
  }
});

test("human-readable introduction mirrors the signed consent boundary",()=>{
  const {manifest}=fixture();
  const intro=createArcaFederationIntroduction({
    manifest,
    candidateKey:"candidate-key-01",
    advertisedId:"a2a-example",
    discoverySourceKind:"a2a-github-repository",
    discoveryReferenceSha256:REF_HASH,
    introductionId:"intro-human-01",
    issuedAt:new Date("2026-09-20T03:00:00Z"),
    ttlMs:60_000
  });
  const text=renderArcaFederationIntroductionText(intro);
  assert.match(text,/ARCA Federation Introduction/);
  assert.match(text,/does not contain a task/);
  assert.match(text,/does not request credentials, trust, admission, or execution/);
  assert.match(text,/Federation is consent-based/);
  assert.match(text,/Public key fingerprint:/);
  assert.match(text,/accept-evaluation \| decline \| request-info/);
});
