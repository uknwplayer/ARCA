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
    JobRequest,
    NoEligibleExecutor,
    ProviderTransientError,
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
    def test_public_descriptors_load_but_are_not_admitted_before_live_proof(self):
        registry = load_registry(REGISTRY_ROOT)
        self.assertEqual(
            {item.executor_id for item in registry.all()},
            {"github-arca-linux", "github-arca-windows"},
        )
        for item in registry.all():
            self.assertEqual(item.admission_state, "CANDIDATE")
            self.assertEqual(item.trust_state, "DECLARED")
            eligibility = evaluate_eligibility(
                JobRequest(
                    "candidate-check",
                    "smoke",
                    frozenset({"python"}),
                    min_trust="DECLARED",
                ),
                item,
            )
            self.assertIn("not-admitted", eligibility.reasons)

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
            {"python", "os.linux"},
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
