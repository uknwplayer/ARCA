from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import json

from .adapter import DispatchRef
from .model import JobRequest


def job_fingerprint(job: JobRequest) -> str:
    payload = {
        "job_id": job.job_id,
        "profile": job.profile,
        "required_capabilities": sorted(job.required_capabilities),
        "privacy": job.privacy,
        "secrets_required": job.secrets_required,
        "expected_seconds": job.expected_seconds,
        "max_cost_microunits": job.max_cost_microunits,
        "min_trust": job.min_trust,
        "region": job.region,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class DispatchJournalEntry:
    job_id: str
    fingerprint: str
    ref: DispatchRef


@dataclass
class DispatchJournal:
    entries: dict[str, DispatchJournalEntry] = field(default_factory=dict)

    def get(self, job: JobRequest) -> DispatchRef | None:
        entry = self.entries.get(job.job_id)
        if entry is None:
            return None
        if entry.fingerprint != job_fingerprint(job):
            raise ValueError("job_id reused with different job content")
        return entry.ref

    def record(self, job: JobRequest, ref: DispatchRef) -> None:
        existing = self.get(job)
        if existing is not None and existing != ref:
            raise ValueError("job already recorded with different dispatch reference")
        self.entries[job.job_id] = DispatchJournalEntry(job.job_id, job_fingerprint(job), ref)
