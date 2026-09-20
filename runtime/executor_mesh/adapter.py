from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .model import ExecutorDescriptor, JobRequest


class ProviderTransientError(RuntimeError):
    pass


class ProviderPermanentError(RuntimeError):
    pass


@dataclass(frozen=True)
class DispatchRef:
    executor_id: str
    provider_family: str
    external_id: str
    correlation_id: str


class ExecutionProviderAdapter(Protocol):
    provider_family: str

    def submit(self, executor: ExecutorDescriptor, job: JobRequest) -> DispatchRef: ...
    def status(self, ref: DispatchRef) -> str: ...
    def result(self, ref: DispatchRef) -> dict[str, Any]: ...
