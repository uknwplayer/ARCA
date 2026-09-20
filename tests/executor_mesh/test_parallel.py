import threading
import time

from runtime.executor_mesh.adapter import DispatchRef
from runtime.executor_mesh.dispatcher import DispatchDecision
from runtime.executor_mesh.mission import MissionChild, MissionRequest, deterministic_job_id
from runtime.executor_mesh.model import ExecutorDescriptor, JobRequest
from runtime.executor_mesh.parallel import ParallelMissionCoordinator
from runtime.executor_mesh.result import AcceptedExecutionReceipt
from runtime.executor_mesh.scheduler import RankedExecutor


class FakeDispatcher:
    lock = threading.Lock()
    active = 0
    peak = 0

    def dispatch(self, job):
        descriptor = ExecutorDescriptor(
            executor_id="fake-" + job.job_id,
            provider_family="fake",
            capabilities=frozenset({"profile.smoke"}),
            trust_state="VERIFIED",
            admission_state="LAB_ADMITTED",
        )
        ref = DispatchRef(descriptor.executor_id, "fake", job.job_id, job.job_id)
        return DispatchDecision(ref, RankedExecutor(descriptor, 0, 0, 1, ()), False, (descriptor.executor_id,))

    def collect(self, job):
        with self.lock:
            type(self).active += 1
            type(self).peak = max(type(self).peak, type(self).active)
        time.sleep(0.03)
        with self.lock:
            type(self).active -= 1
        return AcceptedExecutionReceipt(
            schema="arca.executor-receipt.v0.1",
            job_id=job.job_id,
            executor_id="fake-" + job.job_id,
            provider_family="fake",
            dispatch_external_id=job.job_id,
            dispatch_correlation_id=job.job_id,
            profile=job.profile,
            result_sha256="a" * 64,
        )


def test_parallel_coordinator_bounds_concurrency_and_fans_in():
    FakeDispatcher.active = 0
    FakeDispatcher.peak = 0
    mission_id = "parallel-test"
    children = tuple(
        MissionChild(str(i), JobRequest(job_id=deterministic_job_id(mission_id, str(i)), profile="smoke"))
        for i in range(4)
    )
    mission = MissionRequest(mission_id=mission_id, children=children)
    result = ParallelMissionCoordinator(FakeDispatcher, max_concurrency=2).execute(mission)

    assert result.receipt.mission_state == "COMPLETED"
    assert result.receipt.accepted_child_count == 4
    assert [child.child_id for child in result.children] == ["0", "1", "2", "3"]
    assert 1 < FakeDispatcher.peak <= 2
