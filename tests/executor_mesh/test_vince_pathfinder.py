import hashlib
import json
import unittest

from runtime.executor_mesh import (
    AcceptedExecutionReceipt,
    CostAwareScheduler,
    DispatchJournal,
    DispatchRef,
    ExecutorDescriptor,
    ExecutorMeshDispatcher,
    ExecutorRegistry,
    JobRequest,
    load_registry,
)
from runtime.vince_pathfinder import (
    VINCE_DISCOVERY_SCHEMA,
    VINCE_MISSION_SCHEMA,
    VINCE_PROOF_SCHEMA,
    VinceMission,
    VincePathfinder,
    route_ids,
)


class FakeAdapter:
    def __init__(self):
        self.submissions = []

    def submit(self, executor, job):
        self.submissions.append((executor, job))
        return DispatchRef(
            provider_family=executor.provider_family,
            executor_id=executor.executor_id,
            external_id="a" * 40,
            correlation_id="a" * 40,
        )

    def status(self, ref):
        return "success"

    def result(self, ref):
        raise AssertionError("not used in unit test")


def mission(**overrides):
    body = dict(
        mission_id="vince-pathfinder-001",
        objective="prove bounded public executor routing",
        checkpoint_sha256="1" * 64,
        profile="smoke",
        target_os="linux",
        required_capabilities=("python",),
        expected_seconds=30,
        max_cost_microunits=0,
    )
    body.update(overrides)
    return VinceMission(**body)


class VincePathfinderTests(unittest.TestCase):
    def test_mission_envelope_is_bounded_and_authority_does_not_expand(self):
        value = mission()
        envelope = value.envelope()
        self.assertEqual(envelope["schema"], VINCE_MISSION_SCHEMA)
        self.assertEqual(envelope["identity"], "vince")
        self.assertTrue(envelope["permissions"]["public_only"])
        self.assertFalse(envelope["permissions"]["secrets_allowed"])
        self.assertFalse(envelope["permissions"]["core_mutation_allowed"])
        self.assertFalse(envelope["permissions"]["trust_modify_allowed"])
        self.assertFalse(envelope["permissions"]["merge_allowed"])
        self.assertFalse(envelope["permissions"]["shell_arbitrary_allowed"])
        self.assertTrue(envelope["human_review_required"])
        unsigned = dict(envelope)
        claimed = unsigned.pop("mission_sha256")
        actual = hashlib.sha256(
            json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        self.assertEqual(claimed, actual)

    def test_discovery_uses_existing_executor_admission_and_capabilities(self):
        registry = load_registry("config/executor-registry")
        discovery = VincePathfinder(registry).discover(mission())
        self.assertEqual(discovery.schema, VINCE_DISCOVERY_SCHEMA)
        self.assertGreaterEqual(discovery.candidate_count, 3)
        ids = route_ids(discovery)
        self.assertEqual(ids[0], "github-arca-linux")
        self.assertIn("github-satellite-linux", ids)
        self.assertIn("github-satellite-b-linux", ids)
        self.assertNotIn("github-arca-windows", ids)
        self.assertFalse(discovery.trust_granted)
        self.assertFalse(discovery.authority_expanded)
        for route in discovery.routes:
            self.assertIn(route.trust_state, {"VERIFIED", "LAB_ADMITTED", "ADMITTED"})
            self.assertIn(route.admission_state, {"LAB_ADMITTED", "ADMITTED"})
            self.assertIn("profile.smoke", route.capabilities)
            self.assertIn("os.linux", route.capabilities)

    def test_discovery_falls_back_to_satellite_when_canonical_linux_is_unavailable(self):
        source = load_registry("config/executor-registry")
        registry = ExecutorRegistry()
        for item in source.all():
            if item.executor_id == "github-arca-linux":
                item = ExecutorDescriptor(**{**item.__dict__, "available": False})
            registry.register(item)
        discovery = VincePathfinder(registry).discover(mission())
        self.assertEqual(route_ids(discovery)[0], "github-satellite-linux")
        self.assertEqual(discovery.routes[0].execution_domain, "arca-execution-satellite")
        self.assertEqual(discovery.routes[0].network_hops, 1)

    def test_private_secret_or_authority_expanding_mission_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "AUTHORITY_EXPANSION"):
            mission(secrets_allowed=True).validate()
        with self.assertRaisesRegex(ValueError, "AUTHORITY_EXPANSION"):
            mission(core_mutation_allowed=True).validate()
        with self.assertRaisesRegex(ValueError, "PROFILE_NOT_ALLOWLISTED"):
            mission(profile="node-test").validate()
        with self.assertRaisesRegex(ValueError, "CHECKPOINT_HASH"):
            mission(checkpoint_sha256="bad").validate()

    def test_dispatch_ack_is_distinct_from_verified_execution(self):
        registry = ExecutorRegistry()
        executor = ExecutorDescriptor(
            executor_id="satellite-test",
            provider_family="fake",
            capabilities=frozenset({"python", "os.linux", "profile.smoke"}),
            trust_state="VERIFIED",
            admission_state="LAB_ADMITTED",
            available=True,
            accepts_private=False,
            accepts_secrets=False,
            reliability=1.0,
            metadata={"execution_domain": "synthetic-satellite"},
            network_hops=1,
        )
        registry.register(executor)
        adapter = FakeAdapter()
        dispatcher = ExecutorMeshDispatcher(
            CostAwareScheduler(registry),
            {"fake": adapter},
            DispatchJournal(),
        )
        vince = VincePathfinder(registry)
        first = vince.dispatch(mission(), dispatcher)
        self.assertEqual(first.schema, VINCE_PROOF_SCHEMA)
        self.assertEqual(first.ack_state, "QUEUE_ACCEPTED")
        self.assertEqual(first.execution_state, "PENDING")
        self.assertIsNone(first.result_sha256)
        self.assertFalse(first.core_mutation_performed)
        self.assertFalse(first.trust_modified)
        self.assertFalse(first.authority_expanded)
        self.assertEqual(len(adapter.submissions), 1)

    def test_reconcile_binds_accepted_receipt_to_dispatch(self):
        registry = ExecutorRegistry()
        executor = ExecutorDescriptor(
            executor_id="satellite-test",
            provider_family="fake",
            capabilities=frozenset({"python", "os.linux", "profile.smoke"}),
            trust_state="VERIFIED",
            admission_state="LAB_ADMITTED",
            available=True,
            reliability=1.0,
            metadata={"execution_domain": "synthetic-satellite"},
            network_hops=1,
        )
        registry.register(executor)
        adapter = FakeAdapter()
        dispatcher = ExecutorMeshDispatcher(
            CostAwareScheduler(registry),
            {"fake": adapter},
            DispatchJournal(),
        )
        value = mission()
        decision = dispatcher.dispatch(value.job())
        receipt = AcceptedExecutionReceipt(
            schema="arca.executor-receipt.v0.1",
            job_id=value.mission_id,
            executor_id=decision.ref.executor_id,
            provider_family=decision.ref.provider_family,
            dispatch_external_id=decision.ref.external_id,
            dispatch_correlation_id=decision.ref.correlation_id,
            profile=value.profile,
            result_sha256="b" * 64,
        )
        proof = VincePathfinder(registry).reconcile(value, decision, receipt)
        self.assertEqual(proof.execution_state, "VERIFIED_RESULT")
        self.assertEqual(proof.result_sha256, "b" * 64)
        self.assertRegex(proof.accepted_receipt_sha256, r"^[a-f0-9]{64}$")
        self.assertRegex(proof.proof_sha256, r"^[a-f0-9]{64}$")


if __name__ == "__main__":
    unittest.main()
