from __future__ import annotations

from dataclasses import dataclass


ALLOWED_PROFILES = frozenset({
    "smoke",
    "python-unit",
    "node-test",
    "node-check-public",
})


@dataclass(frozen=True)
class ExecutionRequest:
    profile: str
    request_id: str

    def validate(self) -> None:
        if self.profile not in ALLOWED_PROFILES:
            raise ValueError(f"unsupported profile: {self.profile}")
        if not self.request_id or len(self.request_id) > 128:
            raise ValueError("request_id must be 1..128 characters")
        if not all(ch.isalnum() or ch in "-_." for ch in self.request_id):
            raise ValueError("request_id contains invalid characters")
