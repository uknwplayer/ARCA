from __future__ import annotations

from dataclasses import dataclass, field
import threading

from .model import JobRequest
from .scheduler import CostAwareScheduler, NoEligibleExecutor, RankedExecutor


@dataclass
class DistributionLedger:
    assignments: dict[str, int] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def load(self, executor_id: str) -> int:
        with self._lock:
            return self.assignments.get(executor_id, 0)

    def claim(self, executor_id: str) -> None:
        with self._lock:
            self.assignments[executor_id] = self.assignments.get(executor_id, 0) + 1


class BalancedMissionScheduler(CostAwareScheduler):
    """Eligibility-first scheduler that spreads sibling work across healthy domains."""

    def __init__(self, *args, ledger: DistributionLedger | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.ledger = ledger or DistributionLedger()

    def rank(self, job: JobRequest) -> tuple[RankedExecutor, ...]:
        base = super().rank(job)
        return tuple(sorted(
            base,
            key=lambda item: (
                self.ledger.load(item.descriptor.executor_id),
                item.score,
                item.descriptor.executor_id,
            ),
        ))

    def select_and_claim(self, job: JobRequest) -> RankedExecutor:
        ranked = self.rank(job)
        if not ranked:
            raise NoEligibleExecutor(job.job_id)
        selected = ranked[0]
        self.ledger.claim(selected.descriptor.executor_id)
        return selected
