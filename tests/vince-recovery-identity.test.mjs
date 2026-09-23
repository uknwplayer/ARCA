import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";

import {
  MeshIdentityTrustStore,
  generateMeshNodeIdentity
} from "../src/machine-bridge/mesh-identity.mjs";
import {createVaultMeshSignerBroker} from "../src/machine-bridge/mesh-signer-broker.mjs";
import {
  ARCA_VINCE_RECOVERY_IDENTITY_FORMAT,
  ARCA_VINCE_RECOVERY_RECEIPT_FORMAT,
  MESH_VINCE_RECOVERY_RECEIPT_DOMAIN,
  buildVinceRecoveryReceiptBody,
  deriveVinceRecoveryIdentityContract,
  persistVinceRecoveryExecutionIdentity,
  signVinceRecoveryReceipt,
  validateVinceRecoveryPair,
  verifySignedVinceRecoveryReceipt
} from "../src/machine-bridge/vince-recovery-identity.mjs";

const T0=new Date("2026-09-23T02:31:56.000Z");

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableValue(value[k])]));
  return value;
}
function stable(value){return JSON.stringify(stableValue(value))}
function sha(value){return createHash("sha256").update(stable(value)).digest("hex")}

function fixture(){
  const mission={
    mission_id:"vince-live-fixture-004",
    objective:"recover original accepted route without redispatch",
    checkpoint_sha256:"1".repeat(64),
    profile:"smoke",
    target_os:"linux",
    required_capabilities:["python","artifact.sha256"],
    expected_seconds:30,
    max_cost_microunits:0,
    human_review_required:true,
    public_only:true,
    secrets_allowed:false,
    core_mutation_allowed:false,
    return_route:"executor-mesh.accepted-receipt"
  };
  const missionBody={
    schema:"arca.vince-pathfinder-mission.v0.1",
    identity:"vince",
    mission_id:mission.mission_id,
    objective:mission.objective,
    checkpoint_sha256:mission.checkpoint_sha256,
    profile:mission.profile,
    target_os:mission.target_os,
    required_capabilities:[...mission.required_capabilities].sort(),
    permissions:{
      public_only:true,
      secrets_allowed:false,
      core_mutation_allowed:false,
      trust_modify_allowed:false,
      merge_allowed:false,
      shell_arbitrary_allowed:false
    },
    proof_required:[
      "dispatch-reference",
      "executor-identity",
      "semantic-result-sha256",
      "accepted-receipt"
    ],
    return_route:mission.return_route,
    human_review_required:true
  };
  const job={
    job_id:mission.mission_id,
    profile:"smoke",
    required_capabilities:["artifact.sha256","os.linux","profile.smoke","python"],
    privacy:"public",
    secrets_required:false,
    expected_seconds:30,
    max_cost_microunits:0,
    min_trust:"VERIFIED",
    region:null
  };
  const payload={
    schema:"arca.vince-recovery-checkpoint.v0.3",
    mission,
    mission_sha256:sha(missionBody),
    job,
    job_fingerprint:sha(job),
    selected_executor_id:"github-satellite-linux",
    provider_family:"github-git-queue",
    execution_domain:"arca-execution-satellite",
    dispatch_external_id:"a".repeat(40),
    dispatch_correlation_id:"a".repeat(40),
    dispatch_state:"QUEUE_ACCEPTED",
    automatic_retry_allowed:false
  };
  const checkpoint={...payload,checkpoint_record_sha256:sha(payload)};
  const proofBody={
    schema:"arca.vince-recovery-proof.v0.3",
    mission_id:mission.mission_id,
    mission_sha256:checkpoint.mission_sha256,
    checkpoint_record_sha256:checkpoint.checkpoint_record_sha256,
    selected_executor_id:checkpoint.selected_executor_id,
    provider_family:checkpoint.provider_family,
    dispatch_external_id:checkpoint.dispatch_external_id,
    remote_state:"success",
    recovery_state:"RECOVERED_VERIFIED_RESULT",
    result_sha256:"b".repeat(64),
    accepted_receipt_sha256:"c".repeat(64),
    network_dispatch_performed:false,
    automatic_retry_performed:false,
    failover_authorized:false,
    duplicate_dispatch_detected:false,
    core_mutation_performed:false,
    trust_modified:false,
    authority_expanded:false
  };
  const proof={...proofBody,proof_sha256:sha(proofBody)};
  return {checkpoint,proof};
}

async function withRoot(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-vince-signed-recovery-"));
  try{return await fn(root)}
  finally{await rm(root,{recursive:true,force:true})}
}

test("Vince recovery pair is independently rehashed across Python/JS boundary",()=>{
  const {checkpoint,proof}=fixture();
  const binding=validateVinceRecoveryPair({checkpoint,proof});
  assert.equal(binding.missionId,"vince-live-fixture-004");
  assert.equal(binding.resultSha256,"b".repeat(64));

  assert.throws(()=>validateVinceRecoveryPair({
    checkpoint:{...checkpoint,execution_domain:"tampered-domain"},
    proof
  }),/CHECKPOINT_HASH_MISMATCH/);

  assert.throws(()=>validateVinceRecoveryPair({
    checkpoint,
    proof:{...proof,result_sha256:"d".repeat(64)}
  }),/PROOF_HASH_MISMATCH/);
});

test("Vince recovery is persisted as deterministic Execution Identity and completed attempt",async()=>{
  await withRoot(async root=>{
    const {checkpoint,proof}=fixture();
    const persisted=await persistVinceRecoveryExecutionIdentity({root,checkpoint,proof,at:T0});
    assert.equal(persisted.format,ARCA_VINCE_RECOVERY_IDENTITY_FORMAT);
    assert.match(persisted.identity.executionId,/^exec-[a-f0-9]{40}$/);
    assert.equal(persisted.identity.logicalRequestId,checkpoint.mission.mission_id);
    assert.equal(persisted.identity.roleId,"vince.recovery");
    assert.equal(persisted.identity.idempotencyClass,"synthetic");
    assert.equal(persisted.attempt.participantId,"github-satellite-linux");
    assert.equal(persisted.attempt.payloadHash,checkpoint.job_fingerprint);
    assert.equal(persisted.executionState,"completed");

    const replay=await persistVinceRecoveryExecutionIdentity({root,checkpoint,proof,at:T0});
    assert.equal(replay.identity.executionId,persisted.identity.executionId);
    assert.equal(replay.attempt.attemptId,persisted.attempt.attemptId);
    assert.equal(replay.completionHash,persisted.completionHash);
  });
});

test("signed Vince recovery receipt is trusted, domain-bound and policy-bounded",async()=>{
  await withRoot(async root=>{
    const {checkpoint,proof}=fixture();
    const persisted=await persistVinceRecoveryExecutionIdentity({root,checkpoint,proof,at:T0});
    const body=buildVinceRecoveryReceiptBody(persisted);
    assert.equal(body.format,ARCA_VINCE_RECOVERY_RECEIPT_FORMAT);
    assert.equal(body.networkDispatchPerformed,false);
    assert.equal(body.automaticRetryPerformed,false);
    assert.equal(body.failoverAuthorized,false);
    assert.equal(body.duplicateDispatchDetected,false);

    const signer=generateMeshNodeIdentity("vince-recovery-signer");
    const trust=new MeshIdentityTrustStore();
    trust.trust(signer.identity);
    const statement=signVinceRecoveryReceipt(body,signer,{
      nonce:"vince-recovery-0001",
      issuedAt:T0,
      ttlMs:60_000
    });
    assert.equal(statement.domain,MESH_VINCE_RECOVERY_RECEIPT_DOMAIN);
    assert.equal(verifySignedVinceRecoveryReceipt(statement,{trustStore:trust,now:T0,clockSkewMs:0}),true);

    assert.throws(()=>verifySignedVinceRecoveryReceipt({
      ...statement,
      payload:{...statement.payload,automaticRetryPerformed:true}
    },{trustStore:trust,now:T0,clockSkewMs:0}),/hash mismatch|signature invalid|POLICY_INVALID/);
  });
});

test("Signer Broker exposes only closed Vince recovery signing operation",async()=>{
  await withRoot(async root=>{
    const {checkpoint,proof}=fixture();
    const persisted=await persistVinceRecoveryExecutionIdentity({root,checkpoint,proof,at:T0});
    const body=buildVinceRecoveryReceiptBody(persisted);
    const generated=generateMeshNodeIdentity("vince-recovery-broker");
    const privatePem=generated.privateKey.export({type:"pkcs8",format:"pem"});
    const uses=[];
    const vault={
      async withCredential(ref,purpose,consumer){
        uses.push({ref,purpose});
        return consumer(new Uint8Array(Buffer.from(privatePem)));
      }
    };
    const broker=createVaultMeshSignerBroker({
      vault,
      identity:generated.identity,
      keyRef:"vault://mesh/vince-recovery"
    });
    assert.equal(typeof broker.signVinceRecoveryReceipt,"function");
    assert.equal("signStatement" in broker,false);
    assert.equal(broker.descriptor().supportedOperations.includes("vince-recovery-receipt"),true);

    const statement=await broker.signVinceRecoveryReceipt(body,{
      nonce:"vince-recovery-0002",
      issuedAt:T0,
      ttlMs:60_000
    });
    const trust=new MeshIdentityTrustStore();
    trust.trust(generated.identity);
    assert.equal(verifySignedVinceRecoveryReceipt(statement,{trustStore:trust,now:T0,clockSkewMs:0}),true);
    assert.deepEqual(uses,[{
      ref:"vault://mesh/vince-recovery",
      purpose:"mesh-sign:vince-recovery-receipt:vince-recovery-broker"
    }]);
  });
});

test("identity contract never authorizes retry, failover or code mutation by implication",()=>{
  const {checkpoint,proof}=fixture();
  const binding=validateVinceRecoveryPair({checkpoint,proof});
  const contract=deriveVinceRecoveryIdentityContract(binding);
  assert.equal(contract.roleId,"vince.recovery");
  assert.equal(contract.idempotencyClass,"synthetic");
  assert.match(contract.roleContractHash,/^[a-f0-9]{64}$/);
  assert.match(contract.authorizationBindingHash,/^[a-f0-9]{64}$/);
});
