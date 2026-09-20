import test from "node:test";
import assert from "node:assert/strict";
import {
  createPncpNationalOfflineAttestation,
  verifyPncpNationalOfflineAttestation
} from "../src/machine-bridge/pncp-national-offline-attestation.mjs";
import {PNCP_NATIONAL_CHECKPOINT_FORMAT} from "../src/machine-bridge/pncp-national-scheduler.mjs";

const hash=n=>String(n).padStart(64,"0").slice(-64);
const planFingerprint="a".repeat(64);

function checkpoint(){
  const completed={};
  const ufs=["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
  ufs.sort().forEach((uf,index)=>{
    completed[`BR-UF-${uf}`]={
      completedAt:"2026-09-21T02:00:00.000Z",
      resultHash:hash(index+1),
      targetCount:1,
      observationCount:0,
      createdCount:0,
      awakenedCount:0
    };
  });
  return {
    format:PNCP_NATIONAL_CHECKPOINT_FORMAT,
    planFingerprint,
    status:"COMPLETED",
    completed,
    failed:{},
    createdAt:"2026-09-21T02:00:00.000Z",
    updatedAt:"2026-09-21T02:00:00.000Z"
  };
}

function cycle(){
  return {
    schema:"arca.pncp-national-scheduler-cycle-result.v0.1",
    planFingerprint,
    status:"COMPLETED",
    processed:27,
    succeeded:27,
    failed:0,
    observations:0,
    investigationsCreated:0,
    investigationsAwakened:0,
    totals:{shards:27,completed:27,failed:0,remaining:0},
    humanReviewRequired:true,
    anomalyIsNotIrregularity:true
  };
}

const custody=()=>({
  manifests:27,
  missing:0,
  invalid:0,
  custodyBeforeParsing:true
});

test("offline attestation verifies a complete 27-UF proof",()=>{
  const attestation=createPncpNationalOfflineAttestation({
    repository:"uknwplayer/ARCA",
    revision:"249332e40f98b7519b522847fc4f8b2bdef15ea9",
    cycleResult:cycle(),
    checkpoint:checkpoint(),
    custodySummary:custody(),
    networkUsed:false,
    generatedAt:"2026-09-21T02:10:00.000Z"
  });
  assert.equal(attestation.status,"VERIFIED_OFFLINE");
  assert.equal(attestation.proof.shards,27);
  assert.equal(attestation.proof.custodyManifests,27);
  assert.equal(attestation.proof.networkUsed,false);
  assert.equal(attestation.gates.publicNetworkAuthorized,false);
  assert.equal(attestation.gates.realCollectionAuthorized,false);
  assert.equal(attestation.gates.executionAuthorized,false);
  assert.equal(attestation.gates.humanReviewRequired,true);
  assert.equal(verifyPncpNationalOfflineAttestation(attestation),true);
});

test("attestation is deterministic for the same proof and timestamp",()=>{
  const args={
    repository:"uknwplayer/ARCA",
    revision:"249332e40f98b7519b522847fc4f8b2bdef15ea9",
    cycleResult:cycle(),
    checkpoint:checkpoint(),
    custodySummary:custody(),
    networkUsed:false,
    generatedAt:"2026-09-21T02:10:00.000Z"
  };
  assert.equal(
    createPncpNationalOfflineAttestation(args).attestationHash,
    createPncpNationalOfflineAttestation(args).attestationHash
  );
});

test("network use is rejected fail-closed",()=>{
  assert.throws(()=>createPncpNationalOfflineAttestation({
    repository:"uknwplayer/ARCA",
    revision:"249332e40f98b7519b522847fc4f8b2bdef15ea9",
    cycleResult:cycle(),
    checkpoint:checkpoint(),
    custodySummary:custody(),
    networkUsed:true
  }),/NETWORK_MUST_BE_OFFLINE/);
});

test("incomplete checkpoint cannot be attested",()=>{
  const broken=checkpoint();
  delete broken.completed["BR-UF-SP"];
  assert.throws(()=>createPncpNationalOfflineAttestation({
    repository:"uknwplayer/ARCA",
    revision:"249332e40f98b7519b522847fc4f8b2bdef15ea9",
    cycleResult:cycle(),
    checkpoint:broken,
    custodySummary:custody(),
    networkUsed:false
  }),/CHECKPOINT_INCOMPLETE/);
});

test("tampering invalidates the attestation hash",()=>{
  const attestation=createPncpNationalOfflineAttestation({
    repository:"uknwplayer/ARCA",
    revision:"249332e40f98b7519b522847fc4f8b2bdef15ea9",
    cycleResult:cycle(),
    checkpoint:checkpoint(),
    custodySummary:custody(),
    networkUsed:false,
    generatedAt:"2026-09-21T02:10:00.000Z"
  });
  const tampered={
    ...attestation,
    proof:{...attestation.proof,failed:1}
  };
  assert.equal(verifyPncpNationalOfflineAttestation(tampered),false);
});
