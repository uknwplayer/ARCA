from __future__ import annotations

from dataclasses import dataclass, field
from math import ceil
from typing import Mapping

TRUST_RANK = {
    "UNTRUSTED": 0,
    "DECLARED": 1,
    "VERIFIED": 2,
    "LAB_ADMITTED": 3,
    "ADMITTED": 4,
}

ADMISSION_STATES = frozenset({"CANDIDATE", "LAB_ADMITTED", "ADMITTED"})


@dataclass(frozen=True)
class JobRequest:
    job_id: str
    profile: str
    required_capabilities: frozenset[str] = field(default_factory=frozenset)
    privacy: str = "public"
    secrets_required: bool = False
    expected_seconds: int = 60
    max_cost_microunits: int | None = None
    min_trust: str = "VERIFIED"
    region: str | None = None

    def validate(self) -> None:
        if not self.job_id:
            raise ValueError("job_id is required")
        if not self.profile:
            raise ValueError("profile is required")
        if self.privacy not in {"public", "private"}:
            raise ValueError("privacy must be public or private")
        if self.expected_seconds < 0:
            raise ValueError("expected_seconds must be >= 0")
        if self.max_cost_microunits is not None and self.max_cost_microunits < 0:
            raise ValueError("max_cost_microunits must be >= 0")
        if self.min_trust not in TRUST_RANK:
            raise ValueError("unknown min_trust")


@dataclass(frozen=True)
class ExecutorDescriptor:
    executor_id: str
    provider_family: str
    capabilities: frozenset[str]
    trust_state: str = "DECLARED"
    admission_state: str = "CANDIDATE"
    available: bool = True
    accepts_private: bool = False
    accepts_secrets: bool = False
    fixed_cost_microunits: int = 0
    cost_per_second_microunits: int = 0
    queue_seconds: int = 0
    speed_factor: float = 1.0
    reliability: float = 1.0
    scarce_capabilities: frozenset[str] = field(default_factory=frozenset)
    region: str | None = None
    metadata: Mapping[str, str] = field(default_factory=dict)

    def validate(self) -> None:
        if not self.executor_id or not self.provider_family:
            raise ValueError("executor_id and provider_family are required")
        if self.trust_state not in TRUST_RANK:
            raise ValueError("unknown trust_state")
        if self.admission_state not in ADMISSION_STATES:
            raise ValueError("unknown admission_state")
        if self.fixed_cost_microunits < 0 or self.cost_per_second_microunits < 0:
            raise ValueError("cost must be >= 0")
        if self.queue_seconds < 0:
            raise ValueError("queue_seconds must be >= 0")
        if self.speed_factor <= 0:
            raise ValueError("speed_factor must be > 0")
        if not 0.0 <= self.reliability <= 1.0:
            raise ValueError("reliability must be in [0,1]")

    def estimated_runtime_seconds(self, job: JobRequest) -> int:
        return int(ceil(job.expected_seconds / self.speed_factor))

    def estimated_cost_microunits(self, job: JobRequest) -> int:
        return self.fixed_cost_microunits + self.cost_per_second_microunits * self.estimated_runtime_seconds(job)
