import {generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";
import {
  createArcaFederationIntroduction,
  createArcaNodeManifest,
  renderArcaFederationIntroductionText,
  signArcaFederationIntroduction,
  signArcaNodeManifest,
  verifySignedArcaFederationIntroduction,
  verifySignedArcaNodeManifest
} from "../src/machine-bridge/arca-node-manifest.mjs";

const generated=generateMeshNodeIdentity("arca-validation-node");
const manifest=createArcaNodeManifest({
  nodeId:"arca-validation-node",
  identity:generated.identity,
  version:"0.3.0",
  capabilities:["federation-introduction","signed-identity"],
  repositoryUrl:"https://github.com/example/arca"
});

const now=new Date("2026-09-20T03:00:00.000Z");
const signedManifest=signArcaNodeManifest(manifest,generated,{
  nonce:"manifest-validation-0001",
  issuedAt:now,
  ttlMs:60000
});
verifySignedArcaNodeManifest(signedManifest,{
  now:new Date("2026-09-20T03:00:30.000Z"),
  clockSkewMs:0
});

const introduction=createArcaFederationIntroduction({
  manifest,
  candidateKey:"validation-candidate",
  advertisedId:"validation-agent",
  discoverySourceKind:"validation-only",
  discoveryReferenceSha256:"a".repeat(64),
  requestedScopes:["federation-evaluation"],
  introductionId:"validation-introduction-0001",
  issuedAt:now,
  ttlMs:60000
});

const signedIntroduction=signArcaFederationIntroduction(introduction,generated,{
  nonce:"introduction-validation-0001",
  issuedAt:now,
  ttlMs:60000
});
verifySignedArcaFederationIntroduction(signedIntroduction,{
  manifest,
  now:new Date("2026-09-20T03:00:30.000Z"),
  clockSkewMs:0
});

process.stdout.write(JSON.stringify({
  ok:true,
  validationOnly:true,
  externalContact:false,
  ephemeralIdentity:true,
  nodeId:manifest.nodeId,
  identityId:manifest.identity.identityId,
  keyFingerprint:manifest.identity.keyFingerprint,
  manifestFormat:manifest.format,
  manifestHash:manifest.manifestHash,
  introductionFormat:introduction.format,
  introductionId:introduction.introductionId,
  proposal:introduction.proposal,
  responseOptions:introduction.responseOptions,
  manifestStatementHash:signedManifest.statementHash,
  introductionStatementHash:signedIntroduction.statementHash,
  humanText:renderArcaFederationIntroductionText(introduction)
})+"\n");
