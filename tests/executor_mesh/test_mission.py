from runtime.executor_mesh.mission import (
    MISSION_RECEIPT_SCHEMA,
    MissionChild,
    MissionRequest,
    build_mission_receipt,
    deterministic_job_id,
)
from runtime.executor_mesh.model import JobRequest
from runtime.executor_mesh.result import AcceptedExecutionReceipt


def _job(mission_id: str, child_id: str) -> JobRequest:
    return JobRequest(job_id=deterministic_job_id(mission_id, child_id), profile="smoke")


def _receipt(job_id: str, executor: str, provider: str, result_hash: str) -> AcceptedExecutionReceipt:
    return AcceptedExecutionReceipt(
        schema="arca.executor-receipt.v0.1",
        job_id=job_id,
        executor_id=executor,
        provider_family=provider,
        dispatch_external_id="dispatch",
        dispatch_correlation_id="dispatch",
        profile="smoke",
        result_sha256=result_hash,
    )


def test_mission_receipt_is_deterministic_and_ordered_by_mission():
    mission = MissionRequest(
        mission_id="mesh006-test",
        children=(
            MissionChild("a", _job("mesh006-test", "a")),
            MissionChild("b", _job("mesh006-test", "b")),
        ),
    )
    ra = _receipt("mesh006-test.a", "sat-a", "provider-a", "a" * 64)
    rb = _receipt("mesh006-test.b", "sat-b", "provider-b", "b" * 64)

    first = build_mission_receipt(mission, [("b", rb), ("a", ra)])
    second = build_mission_receipt(mission, [("a", ra), ("b", rb)])

    assert first == second
    assert first.schema == MISSION_RECEIPT_SCHEMA
    assert first.mission_state == "COMPLETED"
    assert [row.child_id for row in first.children] == ["a", "b"]
    assert first.accepted_child_count == 2
    assert first.failed_child_count == 0
    assert len(first.aggregate_sha256) == 64


def test_all_required_fails_when_child_failed():
    mission = MissionRequest(
        mission_id="mesh006-required",
        children=(
            MissionChild("a", _job("mesh006-required", "a")),
            MissionChild("b", _job("mesh006-required", "b")),
        ),
    )
    ra = _receipt("mesh006-required.a", "sat-a", "provider-a", "a" * 64)
    receipt = build_mission_receipt(mission, [("a", ra)], failed_child_ids=["b"])
    assert receipt.mission_state == "FAILED"
    assert receipt.accepted_child_count == 1
    assert receipt.failed_child_count == 1


def test_allow_partial_marks_partial_and_preserves_accepted_child():
    mission = MissionRequest(
        mission_id="mesh006-partial",
        completion_policy="allow_partial",
        children=(
            MissionChild("a", _job("mesh006-partial", "a")),
            MissionChild("b", _job("mesh006-partial", "b")),
        ),
    )
    ra = _receipt("mesh006-partial.a", "sat-a", "provider-a", "a" * 64)
    receipt = build_mission_receipt(mission, [("a", ra)], failed_child_ids=["b"])
    assert receipt.mission_state == "PARTIAL"
    assert receipt.children[0].executor_id == "sat-a"


def test_mission_rejects_non_deterministic_child_job_identity():
    mission = MissionRequest(
        mission_id="mesh006-bad",
        children=(MissionChild("a", JobRequest(job_id="wrong", profile="smoke")),),
    )
    try:
        mission.validate()
    except ValueError as exc:
        assert "deterministic" in str(exc)
    else:
        raise AssertionError("expected deterministic identity rejection")
