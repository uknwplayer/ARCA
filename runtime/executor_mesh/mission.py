from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import re
from typing import Iterable

from .model import JobRequest
from .result import AcceptedExecutionReceipt


MISSION_RECEIPT_SCHEMA = "arca.executor-mission-receipt.v0.1"
_COMPLETION_POLICIES = frozenset({"all_required", "allow_partial"})


@dataclass(frozen=True)
class MissionChild:
    child_id: str
    job: JobRequest


@dataclass(frozen=True)
class MissionRequest:
    mission_id: str
    children: tuple[MissionChild, ...]
    completion_policy: str = "all_required"

    def validate(self) -> None:
        if not self.mission_id or re.fullmatch(r"[A-Za-z0-9_.-]+", self.mission_id) is None:
            raise ValueError("mission_id is required and must be safe")
        if not self.children:
            raise ValueError("mission requires at least one child")
        if self.completion_policy not in _COMPLETION_POLICIES:
            raise ValueError("unknown completion_policy")
        ids = [child.child_id for child in self.children]
        if len(ids) != len(set(ids)):
            raise ValueError("child_id must be unique within mission")
        for child in self.children:
            if not child.child_id or re.fullmatch(r"[A-Za-z0-9_.-]+", child.child_id) is None:
                raise ValueError("child_id must be safe")
            child.job.validate()
            if child.job.job_id != deterministic_job_id(self.mission_id, child.child_id):
                raise ValueError("child job_id is not deterministic for mission/child identity")


@dataclass(frozen=True)
class MissionChildReceipt:
    child_id: str
    job_id: str
    executor_id: str
    provider_family: str
    result_sha256: str
    verification_state: str


@dataclass(frozen=True)
class AcceptedMissionReceipt:
    schema: str
    mission_id: str
    completion_policy: str
    mission_state: str
    children: tuple[MissionChildReceipt, ...]
    accepted_child_count: int
    failed_child_count: int
    aggregate_sha256: str


def deterministic_job_id(mission_id: str, child_id: str) -> str:
    return f"{mission_id}.{child_id}"


def build_mission_receipt(
    mission: MissionRequest,
    accepted: Iterable[tuple[str, AcceptedExecutionReceipt]],
    *,
    failed_child_ids: Iterable[str] = (),
) -> AcceptedMissionReceipt:
    mission.validate()
    accepted_by_id = dict(accepted)
    failed = tuple(failed_child_ids)
    known = {child.child_id for child in mission.children}
    if set(accepted_by_id) - known or set(failed) - known:
        raise ValueError("receipt references unknown child")
    if set(accepted_by_id) & set(failed):
        raise ValueError("child cannot be accepted and failed")
    if len(failed) != len(set(failed)):
        raise ValueError("failed child ids must be unique")

    rows: list[MissionChildReceipt] = []
    for child in mission.children:
        receipt = accepted_by_id.get(child.child_id)
        if receipt is None:
            continue
        if receipt.verification_state != "ACCEPTED":
            raise ValueError("fan-in accepts only ACCEPTED child receipts")
        if receipt.job_id != child.job.job_id:
            raise ValueError("child receipt job mismatch")
        rows.append(MissionChildReceipt(
            child_id=child.child_id,
            job_id=receipt.job_id,
            executor_id=receipt.executor_id,
            provider_family=receipt.provider_family,
            result_sha256=receipt.result_sha256,
            verification_state=receipt.verification_state,
        ))

    unresolved = known - set(accepted_by_id) - set(failed)
    if unresolved:
        raise ValueError("mission contains unresolved children")
    if mission.completion_policy == "all_required" and failed:
        state = "FAILED"
    elif failed:
        state = "PARTIAL"
    else:
        state = "COMPLETED"

    material = {
        "mission_id": mission.mission_id,
        "completion_policy": mission.completion_policy,
        "mission_state": state,
        "children": [asdict(row) for row in rows],
        "failed_child_ids": list(failed),
    }
    aggregate = hashlib.sha256(
        json.dumps(material, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()

    return AcceptedMissionReceipt(
        schema=MISSION_RECEIPT_SCHEMA,
        mission_id=mission.mission_id,
        completion_policy=mission.completion_policy,
        mission_state=state,
        children=tuple(rows),
        accepted_child_count=len(rows),
        failed_child_count=len(failed),
        aggregate_sha256=aggregate,
    )
