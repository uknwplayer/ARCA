import hashlib
import json
import unittest

from runtime.executor_mesh import (
    DispatchJournal,
    DispatchRef,
    ExecutorDescriptor,
    ExecutorMeshDispatcher,
    ExecutorRegistry,
    JobRequest,
    CostAwareScheduler,
    ProviderPermanentError,
    ProviderTransientError,
    verify_public_result,
)


def payload_for(job, ref, *, result=None):
    payload = {
        "schema": "arca.public-executor-result.v0.1",
        "executor_id": ref.executor_id,
        "request_id": job.job_id,
        "profile": job.profile,
        "result": result or {"exit_code": 0},
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    payload["result_sha256"] = hashlib.sha256(encoded).hexdigest()
    return payload


class ResultVerificationTests(unittest.TestCase):
    def setUp(self):
        self.job = JobRequest("mesh004-001", "smoke", frozenset({"python", "os.linux"}))
        self.ref = DispatchRef("sat-linux", "provider", "commit-1", "commit-1")

    def test_valid_result_returns_immutable_receipt(self):
        receipt = verify_public_result(self.job, self.ref, payload_for(self.job, self.ref))
        self.assertEqual(receipt.verification_state, "ACCEPTED")
        self.assertEqual(receipt.job_id, self.job.job_id)
        self.assertEqual(receipt.executor_id, self.ref.executor_id)
        self.assertEqual(receipt.schema, "arca.executor-receipt.v0.1")
        with self.assertRaises(Exception):
            receipt.job_id = "changed"

    def test_identity_profile_schema_and_hash_mismatches_fail_closed(self):
        mutations = (
            ("schema", "wrong"),
            ("executor_id", "other"),
            ("request_id", "other"),
            ("profile", "other"),
        )
        for key, value in mutations:
            with self.subTest(key=key):
                payload = payload_for(self.job, self.ref)
                payload[key] = value
                with self.assertRaises(ProviderPermanentError):
                    verify_public_result(self.job, self.ref, payload)
        payload = payload_for(self.job, self.ref)
        payload["result"]["exit_code"] = 7
        with self.assertRaises(ProviderPermanentError):
            verify_public_result(self.job, self.ref, payload)

    def test_failed_execution_is_not_accepted_even_with_valid_hash(self):
        payload = payload_for(self.job, self.ref, result={"exit_code": 1})
        with self.assertRaises(ProviderPermanentError):
            verify_public_result(self.job, self.ref, payload)

    def test_private_or_secret_job_cannot_enter_public_result_path(self):
        for job in (
            JobRequest("private", "smoke", privacy="private"),
            JobRequest("secret", "smoke", secrets_required=True),
        ):
            with self.subTest(job=job.job_id):
                with self.assertRaises(ProviderPermanentError):
                    verify_public_result(job, self.ref, payload_for(job, self.ref))


class CollectTests(unittest.TestCase):
    class Adapter:
        provider_family = "provider"
        def __init__(self, status, payload):
            self._status = status
            self._payload = payload
        def submit(self, executor, job):
            raise AssertionError("collect must not redispatch")
        def status(self, ref):
            return self._status
        def result(self, ref):
            return self._payload

    def make_dispatcher(self, status="success"):
        job = JobRequest("mesh004-collect", "smoke", frozenset({"python"}))
        ref = DispatchRef("sat-linux", "provider", "commit-2", "commit-2")
        registry = ExecutorRegistry()
        registry.register(ExecutorDescriptor(
            executor_id="sat-linux",
            provider_family="provider",
            capabilities=frozenset({"python", "profile.smoke"}),
            trust_state="VERIFIED",
            admission_state="LAB_ADMITTED",
        ))
        journal = DispatchJournal()
        journal.record(job, ref)
        adapter = self.Adapter(status, payload_for(job, ref))
        dispatcher = ExecutorMeshDispatcher(CostAwareScheduler(registry), {"provider": adapter}, journal)
        return job, dispatcher

    def test_collect_accepts_only_verified_success(self):
        job, dispatcher = self.make_dispatcher()
        receipt = dispatcher.collect(job)
        self.assertEqual(receipt.verification_state, "ACCEPTED")

    def test_collect_treats_in_progress_as_transient(self):
        job, dispatcher = self.make_dispatcher("in_progress")
        with self.assertRaises(ProviderTransientError):
            dispatcher.collect(job)

    def test_collect_rejects_failed_provider_status(self):
        job, dispatcher = self.make_dispatcher("failure")
        with self.assertRaises(ProviderPermanentError):
            dispatcher.collect(job)

    def test_collect_requires_prior_canonical_dispatch(self):
        registry = ExecutorRegistry()
        dispatcher = ExecutorMeshDispatcher(CostAwareScheduler(registry), {})
        with self.assertRaises(ProviderPermanentError):
            dispatcher.collect(JobRequest("never-dispatched", "smoke"))


if __name__ == "__main__":
    unittest.main()
