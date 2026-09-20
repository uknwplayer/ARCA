import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ExecutionIdentityStore,deriveExecutionId} from "../src/machine-bridge/execution-identity.mjs";
import {
  ReconciledFailoverController,
  evaluateReconciledFailover,
  verifyReconciledFailoverReceipt
} from "../src/machine-bridge/reconciled-failover.mjs";
import {MeshIdentityTrustStore,generateMeshNodeIdentity} from "../src/machine-bridge/mesh-identity.mjs";

const T0=new Date("2026-09-19T21:00:00.000Z");
const HASH_A="a".repeat(64);
const HASH_B="b".repeat(64);
const HASH_C="c".repeat(64);
const HASH_D="d".repeat(64);
const HASH_E="e".repeat(64);
const HASH_F="f".repeat(64);

async function withStore(fn){
  const root=await mkdtemp(join(tmpdir(),"arca-execution-"));
  try{
    const store=await new ExecutionIdentityStore({root}).init();
    await fn({root,store});
  }finally{await rm(root,{recursive:true,force:true})}
}

async function createExecution(store,{idempotencyClass="unknown"}={}){
  const created=await store.create({
    logicalRequestId:"logical-req-1",
    roleId:"research.public",
    roleContractHash:HASH_C,
    requestHash:HASH_A,
    authorizationBindingHash:HASH_B,
    idempotencyClass,
    createdAt:T0
  });
  return created.identity;
}

async function addStartedAttempt(store,identity,{participantId="agent-a",requestId="remote-req-1",jobId="remote-job-1",nodeId="peer-a"}={}){
  const planned=await store.createAttempt(identity.executionId,{
    participantId,
    participantDescriptorHash:HASH_C,
    runtimeBindingHash:HASH_D,
    roleConformanceEvidenceHash:HASH_E,
    requestId,
    jobId,
    payloadHash:HASH_F,
    selectedNodeId:nodeId,
    ownerBindingHash:HASH_B,
    plannedAt:T0
  });
  await store.markAttemptStarted(identity.executionId,planned.attempt.attemptId,{startedAt:T0});
  return planned.attempt;
}

function rejectionReconciliation(attempt,{category="unavailable"}={}){
  return {
    format:"arca-remote-evidence-reconciliation-v1",
    version:1,
    state:"rejected",
    requestId:attempt.requestId,
    jobId:attempt.jobId,
    selectedNodeId:attempt.selectedNodeId,
    localStateBefore:"in-flight",
    localStateAfter:"in-flight",
    remoteEvidenceState:"rejected",
    decisionStatementHash:HASH_A,
    completionStatementHash:null,
    resultHash:null,
    rejectionCategory:category,
    reconciledAt:T0.toISOString(),
    reDispatchPerformed:false,
    automaticFailoverAllowed:false
  };
}

test("execution identity is deterministic and create-only",async()=>{
  await withStore(async({store})=>{
    const first=await createExecution(store);
    const expected=deriveExecutionId({
      logicalRequestId:first.logicalRequestId,
      roleId:first.roleId,
      roleContractHash:first.roleContractHash,
      requestHash:first.requestHash,
      authorizationBindingHash:first.authorizationBindingHash
    });
    assert.equal(first.executionId,expected);
    const replay=await createExecution(store);
    assert.equal(replay.executionId,first.executionId);
    const status=await store.status(first.executionId);
    assert.equal(status.state,"created");
    assert.equal(status.attemptCount,0);
  });
});

test("attempt records bind participant, runtime and role-conformance proof",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const attempt=await addStartedAttempt(store,identity);
    assert.equal(attempt.executionId,identity.executionId);
    assert.equal(identity.roleContractHash,HASH_C);
    assert.equal(attempt.participantId,"agent-a");
    assert.equal(attempt.runtimeBindingHash,HASH_D);
    assert.equal(attempt.roleConformanceEvidenceHash,HASH_E);
    assert.equal(attempt.ownerBindingHash,HASH_B);
    assert.equal((await store.status(identity.executionId)).latestAttempt.state,"started");
  });
});

test("uncertain or accepted outcomes never authorize failover",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const attempt=await addStartedAttempt(store,identity);
    const attemptStatus=await store.attemptStatus(identity.executionId,attempt.attemptId);

    const uncertain=evaluateReconciledFailover({
      execution:identity,
      attemptStatus,
      reconciliation:{
        state:"uncertain",remoteEvidenceState:"unseen",rejectionCategory:null,
        decisionStatementHash:null,completionStatementHash:null
      }
    });
    assert.equal(uncertain.eligible,false);
    assert.equal(uncertain.reason,"remote-outcome-unseen");

    const accepted=evaluateReconciledFailover({
      execution:identity,
      attemptStatus,
      reconciliation:{
        state:"accepted-uncertain",remoteEvidenceState:"accepted",rejectionCategory:null,
        decisionStatementHash:HASH_A,completionStatementHash:null
      }
    });
    assert.equal(accepted.eligible,false);
    assert.equal(accepted.reason,"remote-accepted");
  });
});

test("only explicit signed pre-execution rejection categories are reroutable",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const attempt=await addStartedAttempt(store,identity);
    const attemptStatus=await store.attemptStatus(identity.executionId,attempt.attemptId);

    for(const category of ["capability","unavailable","not-accepted"]){
      const result=evaluateReconciledFailover({
        execution:identity,
        attemptStatus,
        reconciliation:rejectionReconciliation(attempt,{category})
      });
      assert.equal(result.eligible,true,category);
      assert.equal(result.reason,"signed-pre-execution-rejection");
    }

    for(const category of ["policy","invalid-request","unknown"]){
      const result=evaluateReconciledFailover({
        execution:identity,
        attemptStatus,
        reconciliation:rejectionReconciliation(attempt,{category})
      });
      assert.equal(result.eligible,false,category);
      assert.equal(result.reason,"rejection-category-not-reroutable");
    }
  });
});

test("completed attempt never authorizes failover even if contradictory rejection is supplied",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const attempt=await addStartedAttempt(store,identity);
    await store.markAttemptCompleted(identity.executionId,attempt.attemptId,{resultHash:HASH_A,completedAt:T0});
    const attemptStatus=await store.attemptStatus(identity.executionId,attempt.attemptId);
    const result=evaluateReconciledFailover({
      execution:identity,
      attemptStatus,
      reconciliation:rejectionReconciliation(attempt)
    });
    assert.equal(result.eligible,false);
    assert.equal(result.reason,"attempt-completed");
  });
});

test("controller signs trusted failover authorization only after safe reconciliation",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store,{idempotencyClass:"side-effecting"});
    const attempt=await addStartedAttempt(store,identity);
    const signer=generateMeshNodeIdentity("relay-origin");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);
    const reconciliationController={
      async reconcile(requestId){
        assert.equal(requestId,attempt.requestId);
        return rejectionReconciliation(attempt,{category:"unavailable"});
      }
    };
    const controller=new ReconciledFailoverController({
      executionStore:store,
      reconciliationController,
      receiptSigner:signer,
      trustStore,
      now:()=>T0
    });
    const authorized=await controller.authorize(identity.executionId);
    assert.equal(authorized.evaluation.eligible,true);
    assert.equal(authorized.receipt.fromAttemptId,attempt.attemptId);
    assert.equal(authorized.receipt.automaticDispatchPerformed,false);
    assert.equal(authorized.receipt.uncertainExecutionAuthorized,false);
    assert.equal(verifyReconciledFailoverReceipt(authorized.receipt,{trustStore,now:T0}),true);
    const durable=await store.getFailoverStatement(identity.executionId,attempt.attemptId);
    assert.equal(durable.signedStatementHash,authorized.receipt.signedReceipt.statementHash);
    assert.equal(durable.failoverReceiptHash,authorized.receipt.receiptHash);
    assert.equal((await store.attemptStatus(identity.executionId,attempt.attemptId)).state,"superseded");
  });
});

test("controller refuses failover when evidence is accepted or unseen",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const attempt=await addStartedAttempt(store,identity);
    const signer=generateMeshNodeIdentity("relay-origin");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);

    for(const reconciliation of [
      {
        state:"accepted",remoteEvidenceState:"accepted",rejectionCategory:null,
        decisionStatementHash:HASH_A,completionStatementHash:null
      },
      {
        state:"uncertain",remoteEvidenceState:"unseen",rejectionCategory:null,
        decisionStatementHash:null,completionStatementHash:null
      }
    ]){
      const controller=new ReconciledFailoverController({
        executionStore:store,
        reconciliationController:{async reconcile(){return reconciliation}},
        receiptSigner:signer,
        trustStore,
        now:()=>T0
      });
      await assert.rejects(
        ()=>controller.authorize(identity.executionId),
        error=>error.code==="ARCA_RECONCILED_FAILOVER_NOT_ELIGIBLE"
      );
    }
    assert.equal((await store.attemptStatus(identity.executionId,attempt.attemptId)).state,"started");
  });
});

test("next attempt requires durable trusted receipt and a different participant",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const first=await addStartedAttempt(store,identity);
    const signer=generateMeshNodeIdentity("relay-origin");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);
    const controller=new ReconciledFailoverController({
      executionStore:store,
      reconciliationController:{async reconcile(){return rejectionReconciliation(first,{category:"capability"})}},
      receiptSigner:signer,
      trustStore,
      now:()=>T0
    });
    const {receipt}=await controller.authorize(identity.executionId);

    await assert.rejects(
      ()=>controller.prepareNextAttempt(identity.executionId,{
        failoverReceipt:receipt,
        participantId:"agent-a",
        participantDescriptorHash:HASH_C,
        runtimeBindingHash:HASH_D,
        roleConformanceEvidenceHash:HASH_E,
        requestId:"remote-req-2",
        jobId:"remote-job-2",
        payloadHash:HASH_F,
        selectedNodeId:"peer-b",
        ownerBindingHash:HASH_B
      }),
      error=>error.code==="ARCA_FAILOVER_SAME_PARTICIPANT"
    );

    const next=await controller.prepareNextAttempt(identity.executionId,{
      failoverReceipt:receipt,
      participantId:"agent-b",
      participantDescriptorHash:HASH_C,
      runtimeBindingHash:HASH_D,
      roleConformanceEvidenceHash:HASH_E,
      requestId:"remote-req-2",
      jobId:"remote-job-2",
      payloadHash:HASH_F,
      selectedNodeId:"peer-b",
      ownerBindingHash:HASH_B,
      plannedAt:new Date(T0.getTime()+1000)
    });
    assert.equal(next.attempt.attemptNumber,2);
    assert.equal(next.attempt.participantId,"agent-b");
    assert.equal((await store.status(identity.executionId)).state,"planned");
  });
});

test("forged failover receipt is rejected by trust store",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const first=await addStartedAttempt(store,identity);
    const signer=generateMeshNodeIdentity("relay-origin");
    const attacker=generateMeshNodeIdentity("attacker");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);
    const controller=new ReconciledFailoverController({
      executionStore:store,
      reconciliationController:{async reconcile(){return rejectionReconciliation(first)}},
      receiptSigner:signer,
      trustStore,
      now:()=>T0
    });
    const {receipt}=await controller.authorize(identity.executionId);
    const forged={...receipt,signedReceipt:{...receipt.signedReceipt,signer:attacker.identity}};
    assert.equal(verifyReconciledFailoverReceipt(forged,{trustStore,now:T0}),false);
  });
});


test("superseded attempt cannot be restarted or completed after failover authorization",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const first=await addStartedAttempt(store,identity);
    const signer=generateMeshNodeIdentity("relay-origin");
    const trustStore=new MeshIdentityTrustStore();
    trustStore.trust(signer.identity);
    const controller=new ReconciledFailoverController({
      executionStore:store,
      reconciliationController:{async reconcile(){return rejectionReconciliation(first,{category:"unavailable"})}},
      receiptSigner:signer,
      trustStore,
      now:()=>T0
    });
    await controller.authorize(identity.executionId);
    await assert.rejects(
      ()=>store.markAttemptStarted(identity.executionId,first.attemptId,{startedAt:new Date(T0.getTime()+1000)}),
      error=>error.code==="ARCA_EXECUTION_ATTEMPT_SUPERSEDED"
    );
    await assert.rejects(
      ()=>store.markAttemptCompleted(identity.executionId,first.attemptId,{resultHash:HASH_A,completedAt:new Date(T0.getTime()+1000)}),
      error=>error.code==="ARCA_EXECUTION_ATTEMPT_SUPERSEDED"
    );
  });
});


test("execution store refuses untrusted failover authorization records",async()=>{
  await withStore(async({store})=>{
    const identity=await createExecution(store);
    const first=await addStartedAttempt(store,identity);
    const signer=generateMeshNodeIdentity("relay-origin");
    const attacker=generateMeshNodeIdentity("attacker");
    const trusted=new MeshIdentityTrustStore();
    trusted.trust(signer.identity);
    const controller=new ReconciledFailoverController({
      executionStore:store,
      reconciliationController:{async reconcile(){return rejectionReconciliation(first,{category:"unavailable"})}},
      receiptSigner:signer,
      trustStore:trusted,
      now:()=>T0
    });
    const {receipt}=await controller.authorize(identity.executionId);

    const otherRoot=await mkdtemp(join(tmpdir(),"arca-execution-untrusted-"));
    try{
      const other=await new ExecutionIdentityStore({root:otherRoot}).init();
      const recreated=await other.create({
        logicalRequestId:identity.logicalRequestId,
        roleId:identity.roleId,
        roleContractHash:identity.roleContractHash,
        requestHash:identity.requestHash,
        authorizationBindingHash:identity.authorizationBindingHash,
        idempotencyClass:identity.idempotencyClass,
        createdAt:identity.createdAt
      });
      const attempt=await other.createAttempt(recreated.identity.executionId,{
        participantId:first.participantId,
        participantDescriptorHash:first.participantDescriptorHash,
        runtimeBindingHash:first.runtimeBindingHash,
        roleConformanceEvidenceHash:first.roleConformanceEvidenceHash,
        requestId:first.requestId,
        jobId:first.jobId,
        payloadHash:first.payloadHash,
        selectedNodeId:first.selectedNodeId,
        ownerBindingHash:first.ownerBindingHash,
        plannedAt:first.plannedAt
      });
      const attackerTrust=new MeshIdentityTrustStore();
      attackerTrust.trust(attacker.identity);
      await assert.rejects(
        ()=>other.storeFailoverStatement(recreated.identity.executionId,attempt.attempt.attemptId,receipt.signedReceipt,{trustStore:attackerTrust,storedAt:T0}),
        /untrusted mesh signer/
      );
      assert.equal(await other.getFailoverStatement(recreated.identity.executionId,attempt.attempt.attemptId),null);
    }finally{await rm(otherRoot,{recursive:true,force:true})}
  });
});
