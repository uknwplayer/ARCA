from runtime.executor_mesh.distribution import BalancedMissionScheduler
from runtime.executor_mesh.model import ExecutorDescriptor, JobRequest
from runtime.executor_mesh.registry import ExecutorRegistry


def _executor(executor_id: str, provider: str, queue: int) -> ExecutorDescriptor:
    return ExecutorDescriptor(
        executor_id=executor_id,
        provider_family=provider,
        capabilities=frozenset({"profile.smoke"}),
        trust_state="VERIFIED",
        admission_state="LAB_ADMITTED",
        queue_seconds=queue,
    )


def test_balanced_scheduler_spreads_sibling_claims_before_reusing_best_executor():
    registry = ExecutorRegistry()
    registry.register(_executor("sat-a", "provider-a", 0))
    registry.register(_executor("sat-b", "provider-b", 1))
    scheduler = BalancedMissionScheduler(registry)

    jobs = [JobRequest(job_id=f"mission.child-{i}", profile="smoke") for i in range(4)]
    selected = [scheduler.select_and_claim(job).descriptor.executor_id for job in jobs]

    assert selected == ["sat-a", "sat-b", "sat-a", "sat-b"]


def test_balancing_never_overrides_eligibility():
    registry = ExecutorRegistry()
    registry.register(_executor("sat-a", "provider-a", 0))
    unavailable = _executor("sat-b", "provider-b", 0)
    registry.register(ExecutorDescriptor(**{**unavailable.__dict__, "available": False}))
    scheduler = BalancedMissionScheduler(registry)

    for i in range(3):
        selected = scheduler.select_and_claim(JobRequest(job_id=f"m.c{i}", profile="smoke"))
        assert selected.descriptor.executor_id == "sat-a"
