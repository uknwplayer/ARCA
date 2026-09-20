from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class InvestigativeAcquisitionRequest:
    source_class: str
    access_method: str
    public_access: bool
    provenance: str
    flags: frozenset[str] = frozenset()


class InvestigativeBoundaryError(ValueError):
    pass


class InvestigativeBoundary:
    def __init__(self, policy: dict):
        if policy.get("schema") != "arca.investigative-boundary.v0.1":
            raise InvestigativeBoundaryError("unsupported investigative boundary schema")
        if policy.get("default") != "deny":
            raise InvestigativeBoundaryError("investigative boundary must fail closed")
        self.policy = policy
        self.allowed_source_classes = frozenset(policy.get("allowed_source_classes", ()))
        self.allowed_access_methods = frozenset(policy.get("allowed_access_methods", ()))
        self.forbidden_flags = frozenset(policy.get("forbidden_flags", ()))

    @classmethod
    def load(cls, path: str | Path) -> "InvestigativeBoundary":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def authorize(self, request: InvestigativeAcquisitionRequest) -> None:
        if request.source_class not in self.allowed_source_classes:
            raise InvestigativeBoundaryError("source class is not allowlisted")
        if request.access_method not in self.allowed_access_methods:
            raise InvestigativeBoundaryError("access method is not allowlisted")
        if not request.public_access and request.source_class != "user_supplied_material":
            raise InvestigativeBoundaryError("autonomous acquisition requires public access")
        if not request.provenance.strip():
            raise InvestigativeBoundaryError("provenance is required")
        forbidden = sorted(request.flags & self.forbidden_flags)
        if forbidden:
            raise InvestigativeBoundaryError("forbidden acquisition flags: " + ",".join(forbidden))


def authorize_all(
    boundary: InvestigativeBoundary,
    requests: Iterable[InvestigativeAcquisitionRequest],
) -> None:
    for request in requests:
        boundary.authorize(request)
