import pytest

from runtime.human_participation import (
    AutonomousParticipationNetwork,
    HumanParticipationError,
    canonical_investigation_key,
)


def request(network, participant, trigger_ref="request-1", jurisdiction="BR/STATE/MUNICIPALITY-A"):
    return network.request_investigation(
        jurisdiction=jurisdiction,
        subject_ref="public-entity:synthetic",
        topic="public procurement",
        time_window="2026-Q3",
        source_scopes=["PNCP", "OFFICIAL_LOCAL_PORTAL"],
        trigger_kind="HUMAN_REQUEST",
        trigger_ref=trigger_ref,
        participant_ref=participant,
    )


def test_ten_humans_share_one_canonical_investigation():
    network = AutonomousParticipationNetwork()
    created_count = 0
    for index in range(10):
        investigation, created, _ = request(
            network,
            participant=f"human-{index}",
            trigger_ref=f"request-{index}",
        )
        created_count += int(created)
    assert created_count == 1
    assert len(network.investigations) == 1
    assert len(investigation.subscribers) == 10
    assert investigation.worker_demand == 10


def test_duplicate_request_does_not_create_work_or_agent_demand():
    network = AutonomousParticipationNetwork()
    investigation, created, awakened = request(network, "human-1")
    assert created and awakened
    investigation.claim_wake_reasons()
    same, created, awakened = request(network, "human-1")
    assert same is investigation
    assert created is False
    assert awakened is False
    assert same.worker_demand == 0


def test_different_jurisdiction_creates_distinct_mission_without_local_default():
    network = AutonomousParticipationNetwork()
    first, _, _ = request(network, "human-1", jurisdiction="BR/STATE/MUNICIPALITY-A")
    second, _, _ = request(network, "human-2", jurisdiction="BR/OTHER-STATE/MUNICIPALITY-B")
    assert first.investigation_key != second.investigation_key
    assert len(network.investigations) == 2


def test_key_is_normalized_and_nationally_generic():
    a = canonical_investigation_key(
        jurisdiction=" BR / Federal ",
        subject_ref="Órgão:123",
        topic=" Contratação Pública ",
        time_window="2026",
        source_scopes=["PNCP", "Portal Oficial"],
    )
    b = canonical_investigation_key(
        jurisdiction="br / federal",
        subject_ref="órgão:123",
        topic="contratação pública",
        time_window="2026",
        source_scopes=["portal oficial", "pncp"],
    )
    assert a == b


def test_comment_and_confirmation_do_not_change_evidence_state_or_wake_workers():
    network = AutonomousParticipationNetwork()
    investigation, _, _ = request(network, "human-1")
    investigation.claim_wake_reasons()
    assert investigation.contribute(participant_ref="human-2", kind="COMMENT", reference="comment-1")
    assert investigation.contribute(participant_ref="human-3", kind="CONFIRMATION", reference="confirmation-1")
    assert investigation.state == "LEAD"
    assert investigation.worker_demand == 0


def test_public_source_dispute_and_deepening_wake_shared_mission():
    network = AutonomousParticipationNetwork()
    investigation, _, _ = request(network, "human-1")
    investigation.claim_wake_reasons()
    investigation.contribute(participant_ref="human-2", kind="PUBLIC_SOURCE", reference="https://example.invalid/public-record")
    investigation.contribute(participant_ref="human-3", kind="DISPUTE", reference="dispute-1")
    investigation.contribute(participant_ref="human-4", kind="DEEPEN_REQUEST", reference="deepen-1")
    assert investigation.worker_demand == 3


def test_publication_requires_full_state_path_and_explicit_human_review():
    network = AutonomousParticipationNetwork()
    investigation, _, _ = request(network, "human-1")
    with pytest.raises(HumanParticipationError, match="invalid"):
        investigation.transition("PUBLICABLE")
    for state in ("TRIAGE", "COLLECTION", "ANALYSIS", "ADVERSARIAL_VERIFICATION", "HUMAN_REVIEW"):
        investigation.transition(state)
    with pytest.raises(HumanParticipationError, match="explicit human review"):
        investigation.transition("PUBLICABLE")
    investigation.transition("PUBLICABLE", human_reviewed=True)
    assert investigation.state == "PUBLICABLE"
