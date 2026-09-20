from __future__ import annotations

from dataclasses import dataclass

from .model import ExecutorDescriptor, JobRequest, TRUST_RANK
from .registry import ExecutorRegistry


@dataclass(frozen=True)
class RoutingPolicy:
    time_weight: int = 10
    reliability_weight: int = 1_000_000
    unused_scarcity_weight: int = 500_000


@dataclass(frozen=True)
class Eligibility:
    eligible: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class RankedExecutor:
    descriptor: ExecutorDescriptor
    score: int
    estimated_cost_microunits: int
    estimated_elapsed_seconds: int
    unused_scarce_capabilities: tuple[str, ...]


class NoEligibleExecutor(RuntimeError):
    pass


def evaluate_eligibility(job: JobRequest, executor: ExecutorDescriptor) -> Eligibility:
    job.validate()
    executor.validate()
    reasons: list[str] = []
    if executor.admission_state not in {"LAB_ADMITTED", "ADMITTED"}:
        reasons.append("not-admitted")
    if not executor.available:
        reasons.append("unavailable")
    if TRUST_RANK[executor.trust_state] < TRUST_RANK[job.min_trust]:
        reasons.append("trust-below-minimum")
    missing = sorted(job.required_capabilities - executor.capabilities)
    if missing:
        reasons.append("missing-capabilities:" + ",".join(missing))
    if job.privacy == "private" and not executor.accepts_private:
        reasons.append("private-job-not-accepted")
    if job.secrets_required and not executor.accepts_secrets:
        reasons.append("secrets-not-accepted")
    if job.region is not None and executor.region not in {None, job.region}:
        reasons.append("region-mismatch")
    cost = executor.estimated_cost_microunits(job)
    if job.max_cost_microunits is not None and cost > job.max_cost_microunits:
        reasons.append("budget-exceeded")
    return Eligibility(not reasons, tuple(reasons))


class CostAwareScheduler:
    def __init__(self, registry: ExecutorRegistry, policy: RoutingPolicy | None = None):
        self.registry = registry
        self.policy = policy or RoutingPolicy()

    def rank(self, job: JobRequest) -> tuple[RankedExecutor, ...]:
        ranked: list[RankedExecutor] = []
        for executor in self.registry.all():
            eligibility = evaluate_eligibility(job, executor)
            if not eligibility.eligible:
                continue
            runtime = executor.estimated_runtime_seconds(job)
            elapsed = executor.queue_seconds + runtime
            cost = executor.estimated_cost_microunits(job)
            reliability_penalty = round((1.0 - executor.reliability) * self.policy.reliability_weight)
            unused_scarce = tuple(sorted(executor.scarce_capabilities - job.required_capabilities))
            scarcity_penalty = len(unused_scarce) * self.policy.unused_scarcity_weight
            score = cost + elapsed * self.policy.time_weight + reliability_penalty + scarcity_penalty
            ranked.append(RankedExecutor(executor, score, cost, elapsed, unused_scarce))
        ranked.sort(key=lambda item: (item.score, item.descriptor.executor_id))
        return tuple(ranked)

    def select(self, job: JobRequest) -> RankedExecutor:
        ranked = self.rank(job)
        if not ranked:
            raise NoEligibleExecutor(job.job_id)
        return ranked[0]
