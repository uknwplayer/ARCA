from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Protocol

from .adapter import DispatchRef, ProviderPermanentError
from .model import ExecutorDescriptor, JobRequest


class GitQueueTransport(Protocol):
    def create_request(self, *, target: str, ref: str, path: str, content: str, message: str) -> str: ...
    def status_by_head_sha(self, head_sha: str) -> str: ...
    def result_by_head_sha(self, head_sha: str) -> dict[str, Any]: ...


class GitQueueAdapter:
    provider_family = "github-git-queue"

    def __init__(self, transport: GitQueueTransport, provider_family: str = "github-git-queue"):
        self.transport = transport
        self.provider_family = provider_family

    def submit(self, executor: ExecutorDescriptor, job: JobRequest) -> DispatchRef:
        if executor.provider_family != self.provider_family:
            raise ProviderPermanentError("executor belongs to another provider family")
        if job.privacy != "public" or job.secrets_required:
            raise ProviderPermanentError("public git queue cannot accept private or secret-bearing jobs")
        if len(job.job_id) > 128 or re.fullmatch(r"[A-Za-z0-9_.-]+", job.job_id) is None:
            raise ProviderPermanentError("job_id is not safe for the public queue")
        if f"profile.{job.profile}" not in executor.capabilities:
            raise ProviderPermanentError("executor does not advertise the requested profile")
        prefix = executor.metadata.get("queue_prefix")
        if not prefix:
            raise ProviderPermanentError("executor queue_prefix missing")
        queue_ref = executor.metadata.get("queue_branch", "executor-queue")
        target = executor.metadata.get("transport_target", "self")
        payload = {
            "schema": "arca.public-executor-request.v0.1",
            "profile": job.profile,
            "request_id": job.job_id,
            "public_only": True,
            "secrets_allowed": False,
        }
        content = json.dumps(payload, indent=2, sort_keys=True) + "\n"
        path = f"{prefix.rstrip('/')}/{job.job_id}.json"
        commit_sha = self.transport.create_request(
            target=target,
            ref=queue_ref,
            path=path,
            content=content,
            message=f"queue: dispatch {job.job_id}",
        )
        return DispatchRef(
            executor_id=executor.executor_id,
            provider_family=self.provider_family,
            external_id=commit_sha,
            correlation_id=commit_sha,
        )

    def status(self, ref: DispatchRef) -> str:
        return self.transport.status_by_head_sha(ref.correlation_id)

    def result(self, ref: DispatchRef) -> dict[str, Any]:
        return self.transport.result_by_head_sha(ref.correlation_id)

    def verify_result(self, job: JobRequest, ref: DispatchRef, payload: dict[str, Any]) -> None:
        if payload.get("executor_id") != ref.executor_id:
            raise ValueError("result executor mismatch")
        if payload.get("request_id") != job.job_id:
            raise ValueError("result request mismatch")
        if payload.get("profile") != job.profile:
            raise ValueError("result profile mismatch")
        claimed = payload.get("result_sha256")
        if not isinstance(claimed, str):
            raise ValueError("result hash missing")
        unsigned = dict(payload)
        unsigned.pop("result_sha256", None)
        encoded = json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
        actual = hashlib.sha256(encoded).hexdigest()
        if actual != claimed:
            raise ValueError("result hash mismatch")
