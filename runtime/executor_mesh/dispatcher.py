from __future__ import annotations

from dataclasses import dataclass

from .adapter import DispatchRef, ExecutionProviderAdapter, ProviderPermanentError, ProviderTransientError
from .journal import DispatchJournal
from .model import JobRequest
from .result import AcceptedExecutionReceipt, verify_public_result
from .scheduler import CostAwareScheduler, NoEligibleExecutor, RankedExecutor


@dataclass(frozen=True)
class DispatchDecision:
    ref: DispatchRef
    ranked: RankedExecutor
    reused: bool
    attempted_executor_ids: tuple[str, ...]


class ExecutorMeshDispatcher:
    def __init__(self, scheduler: CostAwareScheduler, adapters: dict[str, ExecutionProviderAdapter], journal: DispatchJournal | None = None, max_provider_attempts: int = 3):
        self.scheduler = scheduler
        self.adapters = adapters
        self.journal = journal or DispatchJournal()
        self.max_provider_attempts = max_provider_attempts

    def dispatch(self, job: JobRequest) -> DispatchDecision:
        existing = self.journal.get(job)
        if existing is not None:
            descriptor = self.scheduler.registry.get(existing.executor_id)
            ranked = next((item for item in self.scheduler.rank(job) if item.descriptor.executor_id == descriptor.executor_id), RankedExecutor(descriptor, 0, descriptor.estimated_cost_microunits(job), descriptor.estimated_runtime_seconds(job), ()))
            return DispatchDecision(existing, ranked, True, ())
        ranked = self.scheduler.rank(job)
        if not ranked:
            raise NoEligibleExecutor(job.job_id)
        attempts: list[str] = []
        last_transient: Exception | None = None
        for candidate in ranked[: self.max_provider_attempts]:
            executor = candidate.descriptor
            attempts.append(executor.executor_id)
            adapter = self.adapters.get(executor.provider_family)
            if adapter is None:
                continue
            try:
                ref = adapter.submit(executor, job)
            except ProviderTransientError as exc:
                last_transient = exc
                continue
            self.journal.record(job, ref)
            return DispatchDecision(ref, candidate, False, tuple(attempts))
        if last_transient is not None:
            raise last_transient
        raise NoEligibleExecutor(f"{job.job_id}: no adapter for eligible executor")

    def collect(self, job: JobRequest) -> AcceptedExecutionReceipt:
        ref = self.journal.get(job)
        if ref is None:
            raise ProviderPermanentError("job has no canonical dispatch reference")
        adapter = self.adapters.get(ref.provider_family)
        if adapter is None:
            raise ProviderPermanentError("dispatch provider adapter is unavailable")
        status = adapter.status(ref)
        if status != "success":
            if status in {"queued", "in_progress", "pending", "requested", "waiting"}:
                raise ProviderTransientError(f"execution is not complete: {status}")
            raise ProviderPermanentError(f"execution did not complete successfully: {status}")
        payload = adapter.result(ref)
        return verify_public_result(job, ref, payload)
