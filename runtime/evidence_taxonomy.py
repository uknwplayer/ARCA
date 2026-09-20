from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
from typing import Mapping, Sequence


class EvidenceTaxonomyError(ValueError):
    pass


@dataclass(frozen=True)
class SourceLocator:
    source_or_dataset: str
    retrieved_at: str
    canonical_public_url: str | None = None
    public_record_id: str | None = None
    query_or_record_locator: str | None = None
    access_method: str | None = None
    content_sha256: str | None = None
    availability: str = "UNKNOWN"

    def validate(self, allowed_availability: frozenset[str]) -> None:
        if not self.source_or_dataset.strip():
            raise EvidenceTaxonomyError("source locator requires source_or_dataset")
        if not self.retrieved_at.strip():
            raise EvidenceTaxonomyError("source locator requires retrieved_at")
        try:
            datetime.fromisoformat(self.retrieved_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise EvidenceTaxonomyError("retrieved_at must be ISO-8601") from exc
        if self.availability not in allowed_availability:
            raise EvidenceTaxonomyError("unsupported source availability")
        has_route = any(
            value and value.strip()
            for value in (
                self.canonical_public_url,
                self.public_record_id,
                self.query_or_record_locator,
                self.content_sha256,
            )
        )
        if not has_route:
            raise EvidenceTaxonomyError("source locator requires a reproducibility route")


@dataclass(frozen=True)
class EvidenceAssessment:
    claim_id: str
    proposition: str
    state: str
    source_locators: tuple[SourceLocator, ...]
    rationale: str
    assessor_id: str
    assessed_at: str
    review_state: str = "UNREVIEWED"
    predecessor_assessment_id: str | None = None


class EvidenceTaxonomy:
    def __init__(self, policy: Mapping[str, object]):
        if policy.get("schema") != "arca.evidence-taxonomy.v0.1":
            raise EvidenceTaxonomyError("unsupported evidence taxonomy schema")
        self.policy = dict(policy)
        self.states = frozenset(policy.get("states", ()))
        self.availability_states = frozenset(policy.get("availability_states", ()))

    @classmethod
    def load(cls, path: str | Path) -> "EvidenceTaxonomy":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def validate(self, assessment: EvidenceAssessment) -> None:
        if assessment.state not in self.states:
            raise EvidenceTaxonomyError("unsupported evidence state")
        if not assessment.claim_id.strip() or not assessment.proposition.strip():
            raise EvidenceTaxonomyError("claim id and proposition are required")
        if not assessment.source_locators:
            raise EvidenceTaxonomyError("evidence assessment requires source locators")
        for locator in assessment.source_locators:
            locator.validate(self.availability_states)
        if not assessment.rationale.strip():
            raise EvidenceTaxonomyError("evidence assessment requires rationale")
        if not assessment.assessor_id.strip() or not assessment.assessed_at.strip():
            raise EvidenceTaxonomyError("assessor and assessment timestamp are required")
