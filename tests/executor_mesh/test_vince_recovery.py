import hashlib
import json
import unittest

from runtime.executor_mesh import (
    CostAwareScheduler,
    DispatchJournal,
    DispatchRef,
    ExecutorDescriptor,
    ExecutorMeshDispatcher,
    ExecutorRegistry,
)
from runtime.vince_pathfinder import VinceMission
from runtime.vince_recovery import (
    VINCE_RECOVERY_CHECKPOINT_SCHEMA,
    VINCE_RECOVERY_PROOF_SCHEMA,
    build_recovery_checkpoint,
    build_recovery_proof,
    checkpoint_from_dict,
    observe_recovery,
)


class SubmitOnlyAdapter:
    def submit(self, executor, job):
        return DispatchRef(
            executor_id=executor.executor_id,
            provider_family=executor.provider_family,
            external_id="a" * 40,
            correlation_id="a" * 40,
        )
    def status(self, ref):
        raise AssertionError("not used")
    def result(self, ref):
        raise AssertionError("not used")


class RecoveryAdapter:
    def __init__(self, status="success", payload=None):
        self.remote_status = status
        self.payload = payload
        self.submit_calls = 0
        self.status_calls = 0
        self.result_calls = 0

    def submit(self, executor, job):
        self.submit_calls += 1
        raise AssertionError("recovery must never submit")

    def status(self, ref):
        self.status_calls += 1
        return self.remote_status

    def result(self, ref):
        self.result_calls += 1
        return self.payload


def mission():
    return VinceMission(
        mission_id="vince-recovery-unit-001",
        objective="recover original accepted route without redispatch",
        checkpoint_sha256="1" * 64,
        profile="smoke",
        target_os="linux",
        required_capabilities=("python", "artifact.sha256"),
        expected_seconds=30,
        max_cost_microunits=0,
    )


def descriptor():
    return ExecutorDescriptor(
        executor_id="sat-a",
        provider_family="fake",
        capabilities=frozenset({"python","artifact.sha256","os.linux","profile.smoke"}),
        trust_state="VERIFIED",
        admission_state="LAB_ADMITTED",
        available=True,
        reliability=1.0,
        network_hops=1,
        metadata={"execution_domain":"sat-a"},
    )


def decision_for(value):
    registry=ExecutorRegistry()
    registry.register(descriptor())
    dispatcher=ExecutorMeshDispatcher(
        CostAwareScheduler(registry),
        {"fake":SubmitOnlyAdapter()},
        DispatchJournal(),
    )
    return dispatcher.dispatch(value.job())


def public_result(value, executor_id="sat-a"):
    payload={
        "schema":"arca.public-executor-result.v0.1",
        "executor_id":executor_id,
        "request_id":value.mission_id,
        "profile":value.profile,
        "result":{"exit_code":0,"checks":["python-runtime","filesystem-write"]},
    }
    payload["result_sha256"]=hashlib.sha256(
        json.dumps(payload,sort_keys=True,separators=(",",":")).encode()
    ).hexdigest()
    return payload


class VinceRecoveryTests(unittest.TestCase):
    def test_checkpoint_binds_mission_job_and_dispatch_ref(self):
        value=mission()
        checkpoint=build_recovery_checkpoint(value,decision_for(value))
        self.assertEqual(checkpoint.schema,VINCE_RECOVERY_CHECKPOINT_SCHEMA)
        self.assertEqual(checkpoint.dispatch_state,"QUEUE_ACCEPTED")
        self.assertFalse(checkpoint.automatic_retry_allowed)
        self.assertRegex(checkpoint.checkpoint_record_sha256,r"^[a-f0-9]{64}$")
        restored=checkpoint_from_dict(json.loads(json.dumps(checkpoint.__dict__)))
        self.assertEqual(restored,checkpoint)

    def test_checkpoint_tampering_fails_closed(self):
        value=mission()
        checkpoint=build_recovery_checkpoint(value,decision_for(value))
        tampered=dict(checkpoint.__dict__)
        tampered["selected_executor_id"]="sat-b"
        with self.assertRaisesRegex(ValueError,"CHECKPOINT_HASH_MISMATCH"):
            checkpoint_from_dict(tampered)

    def test_recovery_accepts_original_result_without_submit(self):
        value=mission()
        checkpoint=build_recovery_checkpoint(value,decision_for(value))
        adapter=RecoveryAdapter(payload=public_result(value))
        observation=observe_recovery(checkpoint,adapter)
        self.assertEqual(observation.action,"ACCEPT_ORIGINAL_RESULT")
        self.assertEqual(observation.remote_state,"success")
        self.assertEqual(adapter.submit_calls,0)
        self.assertEqual(adapter.status_calls,1)
        self.assertEqual(adapter.result_calls,1)
        proof=build_recovery_proof(checkpoint,observation)
        self.assertEqual(proof.schema,VINCE_RECOVERY_PROOF_SCHEMA)
        self.assertEqual(proof.recovery_state,"RECOVERED_VERIFIED_RESULT")
        self.assertFalse(proof.network_dispatch_performed)
        self.assertFalse(proof.automatic_retry_performed)
        self.assertFalse(proof.failover_authorized)
        self.assertFalse(proof.duplicate_dispatch_detected)
        self.assertFalse(proof.authority_expanded)
        self.assertRegex(proof.proof_sha256,r"^[a-f0-9]{64}$")

    def test_in_progress_original_never_redispatches(self):
        value=mission()
        checkpoint=build_recovery_checkpoint(value,decision_for(value))
        adapter=RecoveryAdapter(status="in_progress")
        observation=observe_recovery(checkpoint,adapter)
        self.assertEqual(observation.action,"WAIT_OR_RECONCILE_ORIGINAL")
        self.assertFalse(observation.network_dispatch_performed)
        self.assertFalse(observation.automatic_retry_performed)
        self.assertFalse(observation.failover_authorized)
        self.assertEqual(adapter.submit_calls,0)
        self.assertEqual(adapter.result_calls,0)
        proof=build_recovery_proof(checkpoint,observation)
        self.assertEqual(proof.recovery_state,"INCONCLUSIVE_UNCERTAIN")

    def test_failed_original_fails_closed_without_failover(self):
        value=mission()
        checkpoint=build_recovery_checkpoint(value,decision_for(value))
        adapter=RecoveryAdapter(status="failure")
        observation=observe_recovery(checkpoint,adapter)
        self.assertEqual(observation.action,"FAIL_CLOSED_ORIGINAL_OUTCOME_NOT_SUCCESS")
        self.assertFalse(observation.failover_authorized)
        self.assertEqual(adapter.submit_calls,0)
        proof=build_recovery_proof(checkpoint,observation)
        self.assertEqual(proof.recovery_state,"INCONCLUSIVE_UNCERTAIN")

    def test_result_identity_mismatch_is_rejected_without_retry(self):
        value=mission()
        checkpoint=build_recovery_checkpoint(value,decision_for(value))
        adapter=RecoveryAdapter(payload=public_result(value,executor_id="sat-b"))
        with self.assertRaisesRegex(Exception,"result executor mismatch"):
            observe_recovery(checkpoint,adapter)
        self.assertEqual(adapter.submit_calls,0)


if __name__=="__main__":
    unittest.main()
