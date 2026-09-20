import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from executor.contract import ALLOWED_PROFILES, ExecutionRequest
from executor.queue import load_request
from runtime.executor_mesh import (
    CostAwareScheduler,
    DispatchJournal,
    ExecutorDescriptor,
    ExecutorMeshDispatcher,
    ExecutorRegistry,
    GitQueueAdapter,
    GitHubContentsQueueTransport,
    JobRequest,
    NoEligibleExecutor,
    ProviderTransientError,
    ProviderPermanentError,
    QueueTargetPolicy,
    evaluate_eligibility,
    load_registry,
)


ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = ROOT / "config" / "executor-registry"


def descriptor(executor_id, capabilities, **kwargs):
    return ExecutorDescriptor(
        executor_id=executor_id,
        provider_family=kwargs.pop("provider_family", "github-git-queue"),
        capabilities=frozenset(capabilities),
        **kwargs,
    )


class FakeGitQueueTransport:
    def __init__(self):
        self.created = {}
        self.counter = 0
        self.results = {}

    def create_request(self, *, target, ref, path, content, message):
        key = (target, ref, path)
        existing = self.created.get(key)
        if existing is not None:
            if existing[0] != content:
                raise ValueError("idempotency conflict")
            return existing[1]
        self.counter += 1
        sha = f"commit-{self.counter}"
        self.created[key] = (content, sha, message)
        return sha

    def status_by_head_sha(self, head_sha):
        return "completed"

    def result_by_head_sha(self, head_sha):
        return self.results[head_sha]


class RegistryAndSchedulerTests(unittest.TestCase):
    def test_live_proven_public_descriptors_are_lab_admitted(self):
        registry = load_registry(REGISTRY_ROOT)
        self.assertEqual(
            {item.executor_id for item in registry.all()},
            {
                "github-arca-linux",
                "github-arca-windows",
                "github-satellite-linux",
                "github-satellite-windows",
                "github-satellite-b-linux",
            },
        )
        for item in registry.all():
            self.assertEqual(item.admission_state, "LAB_ADMITTED")
            self.assertEqual(item.trust_state, "VERIFIED")

        linux = registry.get("github-arca-linux")
        windows = registry.get("github-arca-windows")
        self.assertEqual(
            CostAwareScheduler(registry)
            .select(JobRequest("real-linux", "smoke", frozenset({"python", "os.linux"})))
            .descriptor.executor_id,
            linux.executor_id,
        )
        self.assertEqual(
            CostAwareScheduler(registry)
            .select(JobRequest("real-windows", "smoke", frozenset({"python", "os.windows"})))
            .descriptor.executor_id,
            windows.executor_id,
        )

        self.assertEqual(linux.metadata["queue_branch"], "executor-queue")
        self.assertEqual(windows.metadata["queue_branch"], "executor-queue")

    def test_local_domain_is_preferred_over_equivalent_satellite(self):
        registry = load_registry(REGISTRY_ROOT)
        linux_job = JobRequest(
            "prefer-local-linux",
            "smoke",
            frozenset({"python", "os.linux"}),
        )
        windows_job = JobRequest(
            "prefer-local-windows",
            "smoke",
            frozenset({"python", "os.windows"}),
        )
        self.assertEqual(
            CostAwareScheduler(registry).select(linux_job).descriptor.executor_id,
            "github-arca-linux",
        )
        self.assertEqual(
            CostAwareScheduler(registry).select(windows_job).descriptor.executor_id,
            "github-arca-windows",
        )

    def test_satellite_is_selected_when_local_domain_is_unavailable(self):
        source = load_registry(REGISTRY_ROOT)
        registry = ExecutorRegistry()
        for item in source.all():
            if item.executor_id == "github-arca-linux":
                item = ExecutorDescriptor(
                    **{**item.__dict__, "available": False}
                )
            registry.register(item)
        decision = CostAwareScheduler(registry).select(
            JobRequest(
                "fallback-satellite-linux",
                "smoke",
                frozenset({"python", "os.linux"}),
            )
        )
        self.assertEqual(decision.descriptor.executor_id, "github-satellite-linux")
        self.assertEqual(decision.descriptor.network_hops, 1)
        self.assertEqual(
            decision.descriptor.metadata["execution_domain"],
            "arca-execution-satellite",
        )

    def test_satellite_does_not_claim_node_profiles(self):
        registry = load_registry(REGISTRY_ROOT)
        ranked = CostAwareScheduler(registry).rank(
            JobRequest(
                "node-capability",
                "node-test",
                frozenset({"node", "os.linux"}),
            )
        )
        self.assertEqual(ranked[0].descriptor.executor_id, "github-arca-linux")
        self.assertNotIn(
            "github-satellite-linux",
            {item.descriptor.executor_id for item in ranked},
        )

    def test_admitted_linux_job_selects_linux(self):
        registry = ExecutorRegistry()
        registry.register(
            descriptor(
                "linux",
                {"python", "os.linux"},
                trust_state="VERIFIED",
                admission_state="LAB_ADMITTED",
                metadata={
                    "transport_target": "self",
                    "queue_branch": "executor-queue",
                    "queue_prefix": "queue/linux/requests",
                },
            )
        )
        registry.register(
            descriptor(
                "windows",
                {"python", "os.windows"},
                trust_state="VERIFIED",
                admission_state="LAB_ADMITTED",
                metadata={
                    "transport_target": "self",
                    "queue_branch": "executor-queue",
                    "queue_prefix": "queue/windows/requests",
                },
            )
        )
        job = JobRequest("j-linux", "smoke", frozenset({"python", "os.linux"}))
        self.assertEqual(CostAwareScheduler(registry).select(job).descriptor.executor_id, "linux")

    def test_private_job_rejects_public_executor(self):
        registry = ExecutorRegistry()
        registry.register(
            descriptor(
                "linux",
                {"python", "os.linux"},
                trust_state="VERIFIED",
                admission_state="LAB_ADMITTED",
                metadata={"queue_prefix": "queue/linux/requests"},
            )
        )
        with self.assertRaises(NoEligibleExecutor):
            CostAwareScheduler(registry).select(
                JobRequest("j-private", "smoke", frozenset({"python"}), privacy="private")
            )


class GitQueueTests(unittest.TestCase):
    def setUp(self):
        self.executor = descriptor(
            "github-arca-linux",
            {"python", "os.linux", "profile.smoke"},
            trust_state="VERIFIED",
            admission_state="LAB_ADMITTED",
            metadata={
                "transport_target": "self",
                "queue_branch": "executor-queue",
                "queue_prefix": "queue/linux/requests",
            },
        )
        self.transport = FakeGitQueueTransport()
        self.adapter = GitQueueAdapter(self.transport)

    def test_submit_is_bounded_and_targets_queue_branch(self):
        job = JobRequest("job-001", "smoke", frozenset({"python", "os.linux"}))
        ref = self.adapter.submit(self.executor, job)
        key = ("self", "executor-queue", "queue/linux/requests/job-001.json")
        content, sha, _ = self.transport.created[key]
        self.assertEqual(ref.correlation_id, sha)
        payload = json.loads(content)
        self.assertEqual(
            set(payload),
            {"schema", "profile", "request_id", "public_only", "secrets_allowed"},
        )
        self.assertTrue(payload["public_only"])
        self.assertFalse(payload["secrets_allowed"])

    def test_secret_job_is_rejected(self):
        with self.assertRaises(Exception):
            self.adapter.submit(
                self.executor,
                JobRequest(
                    "job-secret",
                    "smoke",
                    frozenset({"python"}),
                    secrets_required=True,
                ),
            )

    def test_unsafe_job_id_and_unadvertised_profile_are_rejected_before_transport(self):
        with self.assertRaises(ProviderPermanentError):
            self.adapter.submit(
                self.executor,
                JobRequest("../workflow", "smoke", frozenset({"python"})),
            )
        with self.assertRaises(ProviderPermanentError):
            self.adapter.submit(
                self.executor,
                JobRequest("job-profile", "node-test", frozenset({"python"})),
            )
        self.assertEqual(self.transport.counter, 0)

    def test_dispatch_journal_reuses_same_job(self):
        registry = ExecutorRegistry()
        registry.register(self.executor)
        dispatcher = ExecutorMeshDispatcher(
            CostAwareScheduler(registry),
            {"github-git-queue": self.adapter},
            DispatchJournal(),
        )
        job = JobRequest("job-002", "smoke", frozenset({"python", "os.linux"}))
        first = dispatcher.dispatch(job)
        second = dispatcher.dispatch(job)
        self.assertFalse(first.reused)
        self.assertTrue(second.reused)
        self.assertEqual(self.transport.counter, 1)

    def test_result_hash_detects_tampering(self):
        job = JobRequest("job-003", "smoke", frozenset({"python", "os.linux"}))
        ref = self.adapter.submit(self.executor, job)
        payload = {
            "schema": "arca.public-executor-result.v0.1",
            "executor_id": self.executor.executor_id,
            "request_id": job.job_id,
            "profile": job.profile,
            "result": {"exit_code": 0},
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        payload["result_sha256"] = hashlib.sha256(encoded).hexdigest()
        self.adapter.verify_result(job, ref, payload)
        payload["result"]["exit_code"] = 1
        with self.assertRaises(ValueError):
            self.adapter.verify_result(job, ref, payload)


class GitHubContentsTransportTests(unittest.TestCase):
    class FakeTransport(GitHubContentsQueueTransport):
        def __init__(self):
            super().__init__(
                token="control-plane-secret",
                default_repository="uknwplayer/ARCA",
                allowed_targets={
                    "uknwplayer/ARCA": QueueTargetPolicy({
                        "executor-queue": ("queue/linux/requests",),
                    }),
                    "uknwplayer/arca-execution-satellite": QueueTargetPolicy({
                        "main": ("queue/requests",),
                    }),
                },
            )
            self.files = {}
            self.put_body = None

        def _content(self, repository, ref, path):
            return self.files.get((repository, ref, path))

        def _latest_path_commit(self, repository, ref, path):
            return "existing-dispatch-sha"

        def _json(self, method, path, body=None):
            self.put_body = body
            return {"commit": {"sha": "new-dispatch-sha"}}

    def test_cross_repository_request_is_allowlisted_and_token_is_not_persisted(self):
        transport = self.FakeTransport()
        content = '{"public_only":true}\n'
        sha = transport.create_request(
            target="uknwplayer/arca-execution-satellite",
            ref="main",
            path="queue/requests/mesh-003.json",
            content=content,
            message="queue: dispatch mesh-003",
        )
        self.assertEqual(sha, "new-dispatch-sha")
        serialized = json.dumps(transport.put_body, sort_keys=True)
        self.assertNotIn("control-plane-secret", serialized)
        self.assertNotIn("Authorization", serialized)

    def test_target_branch_and_path_outside_allowlist_fail_closed(self):
        transport = self.FakeTransport()
        cases = (
            ("someone/other", "main", "queue/requests/x.json"),
            ("uknwplayer/arca-execution-satellite", "dev", "queue/requests/x.json"),
            ("uknwplayer/arca-execution-satellite", "main", ".github/workflows/x.yml"),
            ("uknwplayer/arca-execution-satellite", "main", "queue/requests/../x.json"),
        )
        for target, ref, path in cases:
            with self.subTest(target=target, ref=ref, path=path):
                with self.assertRaises(ProviderPermanentError):
                    transport.create_request(
                        target=target,
                        ref=ref,
                        path=path,
                        content="{}\n",
                        message="queue: dispatch x",
                    )

    def test_identical_existing_request_is_idempotent(self):
        transport = self.FakeTransport()
        content = '{"public_only":true}\n'
        transport.files[(
            "uknwplayer/arca-execution-satellite",
            "main",
            "queue/requests/mesh-003.json",
        )] = {"content": __import__("base64").b64encode(content.encode()).decode()}
        sha = transport.create_request(
            target="uknwplayer/arca-execution-satellite",
            ref="main",
            path="queue/requests/mesh-003.json",
            content=content,
            message="queue: dispatch mesh-003",
        )
        self.assertEqual(sha, "existing-dispatch-sha")
        self.assertIsNone(transport.put_body)

    def test_existing_request_with_other_content_is_conflict(self):
        transport = self.FakeTransport()
        transport.files[(
            "uknwplayer/arca-execution-satellite",
            "main",
            "queue/requests/mesh-003.json",
        )] = {"content": __import__("base64").b64encode(b"different\n").decode()}
        with self.assertRaises(ProviderPermanentError):
            transport.create_request(
                target="uknwplayer/arca-execution-satellite",
                ref="main",
                path="queue/requests/mesh-003.json",
                content="{}\n",
                message="queue: dispatch mesh-003",
            )


class PublicExecutorContractTests(unittest.TestCase):
    def test_profiles_are_closed_allowlist(self):
        self.assertEqual(
            ALLOWED_PROFILES,
            frozenset({"smoke", "python-unit", "node-test", "node-check-public"}),
        )
        with self.assertRaises(ValueError):
            ExecutionRequest("shell", "nope").validate()

    def test_queue_loader_requires_exact_safe_envelope(self):
        data = {
            "schema": "arca.public-executor-request.v0.1",
            "profile": "smoke",
            "request_id": "safe-001",
            "public_only": True,
            "secrets_allowed": False,
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "safe-001.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            request, metadata = load_request(path)
            self.assertEqual(request.request_id, "safe-001")
            self.assertRegex(metadata["request_sha256"], r"^[a-f0-9]{64}$")
            bad = dict(data, secrets_allowed=True)
            path.write_text(json.dumps(bad), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_request(path)

    def test_executor_workflows_are_read_only_and_queue_scoped(self):
        expectations = {
            ".github/workflows/arca-executor-linux.yml": "queue/linux/requests/*.json",
            ".github/workflows/arca-executor-windows.yml": "queue/windows/requests/*.json",
        }
        for relative, queue_path in expectations.items():
            text = (ROOT / relative).read_text(encoding="utf-8")
            self.assertIn("executor-queue", text)
            self.assertIn(queue_path, text)
            self.assertIn("contents: read", text)
            self.assertIn("persist-credentials: false", text)
            self.assertNotIn("contents: write", text)
            self.assertNotIn("secrets.", text)
            self.assertNotIn("pull_request_target", text)


class FallbackTests(unittest.TestCase):
    class FailingAdapter:
        provider_family = "first"

        def submit(self, executor, job):
            raise ProviderTransientError("temporary outage")

        def status(self, ref):
            return "failed"

        def result(self, ref):
            return {}

    class WorkingAdapter:
        provider_family = "second"

        def __init__(self):
            self.calls = 0

        def submit(self, executor, job):
            from runtime.executor_mesh import DispatchRef

            self.calls += 1
            return DispatchRef(executor.executor_id, self.provider_family, "ok-1", "ok-1")

        def status(self, ref):
            return "completed"

        def result(self, ref):
            return {"ok": True}

    class PermanentFailingAdapter:
        provider_family = "first"

        def submit(self, executor, job):
            raise ProviderPermanentError("integrity/policy failure")

        def status(self, ref):
            return "failed"

        def result(self, ref):
            return {}

    def test_transient_failure_falls_back_to_next_executor(self):
        registry = ExecutorRegistry()
        registry.register(
            descriptor(
                "a-first",
                {"python"},
                provider_family="first",
                trust_state="VERIFIED",
                admission_state="LAB_ADMITTED",
            )
        )
        registry.register(
            descriptor(
                "b-second",
                {"python"},
                provider_family="second",
                trust_state="VERIFIED",
                admission_state="LAB_ADMITTED",
                queue_seconds=1,
            )
        )
        working = self.WorkingAdapter()
        dispatcher = ExecutorMeshDispatcher(
            CostAwareScheduler(registry),
            {"first": self.FailingAdapter(), "second": working},
            max_provider_attempts=2,
        )
        decision = dispatcher.dispatch(
            JobRequest("j-fallback", "smoke", frozenset({"python"}))
        )
        self.assertEqual(decision.ref.executor_id, "b-second")
        self.assertEqual(decision.attempted_executor_ids, ("a-first", "b-second"))
        self.assertEqual(working.calls, 1)


if __name__ == "__main__":
    unittest.main()
