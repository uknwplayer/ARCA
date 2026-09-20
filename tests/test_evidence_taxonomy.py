from pathlib import Path

import pytest

from runtime.evidence_taxonomy import (
    EvidenceAssessment,
    EvidenceTaxonomy,
    EvidenceTaxonomyError,
    SourceLocator,
)


ROOT = Path(__file__).resolve().parents[1]
TAXONOMY = EvidenceTaxonomy.load(ROOT / "config" / "evidence-taxonomy-v0.1.json")


def locator(**overrides):
    values = {
        "source_or_dataset": "synthetic-public-register",
        "retrieved_at": "2026-09-20T18:30:00Z",
        "canonical_public_url": "https://example.invalid/public/record/1",
        "availability": "AVAILABLE",
    }
    values.update(overrides)
    return SourceLocator(**values)


def assessment(state="ALLEGATION", locators=None):
    return EvidenceAssessment(
        claim_id="synthetic-claim-001",
        proposition="Synthetic proposition used only for tests.",
        state=state,
        source_locators=tuple(locators or [locator()]),
        rationale="The synthetic source contains the proposition.",
        assessor_id="test-worker",
        assessed_at="2026-09-20T18:31:00Z",
    )


@pytest.mark.parametrize("state", sorted(TAXONOMY.states))
def test_every_declared_state_is_representable(state):
    TAXONOMY.validate(assessment(state=state))


@pytest.mark.parametrize("state", ["CONTESTED", "REFUTED", "UNRESOLVED"])
def test_non_confirming_outcomes_are_first_class(state):
    TAXONOMY.validate(assessment(state=state))


def test_rejects_unknown_state():
    with pytest.raises(EvidenceTaxonomyError, match="unsupported evidence state"):
        TAXONOMY.validate(assessment(state="GUILTY"))


def test_rejects_assessment_without_provenance():
    with pytest.raises(EvidenceTaxonomyError, match="requires source locators"):
        TAXONOMY.validate(assessment(locators=[]))


def test_locator_must_allow_return_to_source():
    empty_route = locator(canonical_public_url=None)
    with pytest.raises(EvidenceTaxonomyError, match="reproducibility route"):
        TAXONOMY.validate(assessment(locators=[empty_route]))


def test_dead_public_link_can_preserve_historical_hash_locator():
    historical = locator(
        canonical_public_url="https://example.invalid/removed",
        content_sha256="a" * 64,
        availability="NO_LONGER_RETRIEVABLE",
    )
    TAXONOMY.validate(assessment(state="UNRESOLVED", locators=[historical]))


def test_taxonomy_explicitly_forbids_guilt_scoring_semantics():
    assert TAXONOMY.policy["invariants"]["states_are_not_guilt_scores"] is True
    assert TAXONOMY.policy["invariants"]["automatic_promotion_forbidden"] is True
