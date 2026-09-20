from __future__ import annotations

import json
import re
from typing import Any, Mapping

from .adapter import DispatchRef, ProviderPermanentError
from .git_queue import GitQueueAdapter
from .model import ExecutorDescriptor, JobRequest


INVESTIGATIVE_REQUEST_SCHEMA = "arca.public-investigative-executor-request.v0.2"
INVESTIGATIVE_PROFILE = "investigative-public-v0.1"
ALLOWED_INVESTIGATIVE_TASKS = frozenset({
    "PUBLIC_SOURCE_NORMALIZATION",
    "ABSTRACT_TRACE_EXTRACTION",
    "SOURCE_LOCATOR_VERIFICATION",
    "TYPOLOGY_MATCHING",
})
_FORBIDDEN_KEY = re.compile(r"(?:token|password|secret|credential|authorization|cookie)", re.I)
_FORBIDDEN_VALUE = re.compile(r"(?:github_pat_|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)")


def validate_public_task_input(value: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ProviderPermanentError("investigative task input must be an object")
    material = dict(value)
    encoded = json.dumps(material, sort_keys=True, separators=(",", ":"))
    if len(encoded.encode()) > 4096:
        raise ProviderPermanentError("investigative task input exceeds 4096 bytes")

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, child in node.items():
                if _FORBIDDEN_KEY.search(str(key)):
                    raise ProviderPermanentError("secret-like key forbidden in public investigative task")
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)
        elif isinstance(node, str) and _FORBIDDEN_VALUE.search(node):
            raise ProviderPermanentError("credential-like value forbidden in public investigative task")

    walk(material)
    return material


class InvestigativeGitQueueAdapter(GitQueueAdapter):
    def __init__(
        self,
        transport,
        *,
        task_payloads: Mapping[str, tuple[str, Mapping[str, Any]]],
        provider_family: str = "github-git-queue",
    ):
        super().__init__(transport, provider_family=provider_family)
        self.task_payloads = dict(task_payloads)

    def submit(self, executor: ExecutorDescriptor, job: JobRequest) -> DispatchRef:
        if executor.provider_family != self.provider_family:
            raise ProviderPermanentError("executor belongs to another provider family")
        if job.profile != INVESTIGATIVE_PROFILE:
            raise ProviderPermanentError("investigative queue requires investigative-public-v0.1")
        if job.privacy != "public" or job.secrets_required:
            raise ProviderPermanentError("investigative public queue rejects private or secret-bearing jobs")
        if f"profile.{job.profile}" not in executor.capabilities:
            raise ProviderPermanentError("executor does not advertise investigative public profile")
        if job.job_id not in self.task_payloads:
            raise ProviderPermanentError("investigative task payload missing")
        task_class, task_input = self.task_payloads[job.job_id]
        if task_class not in ALLOWED_INVESTIGATIVE_TASKS:
            raise ProviderPermanentError("investigative task class not allowlisted")
        clean_input = validate_public_task_input(task_input)
        prefix = executor.metadata.get("queue_prefix")
        if not prefix:
            raise ProviderPermanentError("executor queue_prefix missing")
        queue_ref = executor.metadata.get("queue_branch", "main")
        target = executor.metadata.get("transport_target", "self")
        payload = {
            "schema": INVESTIGATIVE_REQUEST_SCHEMA,
            "profile": job.profile,
            "request_id": job.job_id,
            "public_only": True,
            "secrets_allowed": False,
            "task_class": task_class,
            "task_input": clean_input,
        }
        content = json.dumps(payload, indent=2, sort_keys=True) + "\n"
        path = f"{prefix.rstrip('/')}/{job.job_id}.json"
        commit_sha = self.transport.create_request(
            target=target,
            ref=queue_ref,
            path=path,
            content=content,
            message=f"queue: dispatch public investigative task {job.job_id}",
        )
        return DispatchRef(
            executor_id=executor.executor_id,
            provider_family=self.provider_family,
            external_id=commit_sha,
            correlation_id=commit_sha,
        )
