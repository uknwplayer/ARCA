from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Callable

from .dispatcher import DispatchDecision, ExecutorMeshDispatcher
from .mission import AcceptedMissionReceipt, MissionRequest, build_mission_receipt
from .result import AcceptedExecutionReceipt


@dataclass(frozen=True)
class ChildExecution:
    child_id: str
    dispatch: DispatchDecision
    receipt: AcceptedExecutionReceipt


@dataclass(frozen=True)
class MissionExecution:
    mission: MissionRequest
    children: tuple[ChildExecution, ...]
    receipt: AcceptedMissionReceipt


class ParallelMissionCoordinator:
    def __init__(
        self,
        dispatcher_factory: Callable[[], ExecutorMeshDispatcher],
        *,
        max_concurrency: int = 4,
    ):
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be >= 1")
        self.dispatcher_factory = dispatcher_factory
        self.max_concurrency = max_concurrency

    def execute(self, mission: MissionRequest) -> MissionExecution:
        mission.validate()
        accepted: dict[str, ChildExecution] = {}
        failed: list[str] = []

        def run_child(child):
            dispatcher = self.dispatcher_factory()
            decision = dispatcher.dispatch(child.job)
            receipt = dispatcher.collect(child.job)
            return ChildExecution(child.child_id, decision, receipt)

        with ThreadPoolExecutor(max_workers=min(self.max_concurrency, len(mission.children))) as pool:
            futures = {pool.submit(run_child, child): child.child_id for child in mission.children}
            for future in as_completed(futures):
                child_id = futures[future]
                try:
                    accepted[child_id] = future.result()
                except Exception:
                    failed.append(child_id)

        ordered = tuple(accepted[child.child_id] for child in mission.children if child.child_id in accepted)
        receipt = build_mission_receipt(
            mission,
            ((child.child_id, child.receipt) for child in ordered),
            failed_child_ids=(child.child_id for child in mission.children if child.child_id in failed),
        )
        return MissionExecution(mission=mission, children=ordered, receipt=receipt)
