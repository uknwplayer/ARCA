from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import re
from typing import Any

from runtime.executor_mesh import (
    AcceptedExecutionReceipt,
    DispatchDecision,
    DispatchRef,
    JobRequest,
    ProviderPermanentError,
    ProviderTransientError,
    job_fingerprint,
    verify_public_result,
)
from runtime.vince_pathfinder import VinceMission


VINCE_RECOVERY_CHECKPOINT_SCHEMA = "arca.vince-recovery-checkpoint.v0.3"
VINCE_RECOVERY_PROOF_SCHEMA = "arca.vince-recovery-proof.v0.3"
_HASH = re.compile(r"^[a-f0-9]{64}$")


def _stable(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256(value: object) -> str:
    return hashlib.sha256(_stable(value).encode()).hexdigest()


@dataclass(frozen=True)
class VinceRecoveryCheckpoint:
    schema: str
    mission: dict[str, Any]
    mission_sha256: str
    job: dict[str, Any]
    job_fingerprint: str
    selected_executor_id: str
    provider_family: str
    execution_domain: str
    dispatch_external_id: str
    dispatch_correlation_id: str
    dispatch_state: str
    automatic_retry_allowed: bool
    checkpoint_record_sha256: str

    def payload_without_hash(self) -> dict[str, Any]:
        value = asdict(self)
        value.pop("checkpoint_record_sha256", None)
        return value

    def validate(self) -> None:
        if self.schema != VINCE_RECOVERY_CHECKPOINT_SCHEMA:
            raise ValueError("VINCE_RECOVERY_CHECKPOINT_SCHEMA_INVALID")
        if not _HASH.fullmatch(self.mission_sha256):
            raise ValueError("VINCE_RECOVERY_MISSION_HASH_INVALID")
        if not _HASH.fullmatch(self.job_fingerprint):
            raise ValueError("VINCE_RECOVERY_JOB_FINGERPRINT_INVALID")
        if not _HASH.fullmatch(self.dispatch_external_id) or not _HASH.fullmatch(self.dispatch_correlation_id):
            raise ValueError("VINCE_RECOVERY_DISPATCH_REF_INVALID")
        if self.dispatch_external_id != self.dispatch_correlation_id:
            raise ValueError("VINCE_RECOVERY_CORRELATION_INVALID")
        if self.dispatch_state != "QUEUE_ACCEPTED":
            raise ValueError("VINCE_RECOVERY_DISPATCH_STATE_INVALID")
        if self.automatic_retry_allowed is not False:
            raise ValueError("VINCE_RECOVERY_AUTOMATIC_RETRY_FORBIDDEN")
        if self.checkpoint_record_sha256 != _sha256(self.payload_without_hash()):
            raise ValueError("VINCE_RECOVERY_CHECKPOINT_HASH_MISMATCH")

        restored = mission_from_checkpoint(self)
        if restored.envelope()["mission_sha256"] != self.mission_sha256:
            raise ValueError("VINCE_RECOVERY_MISSION_MISMATCH")
        if job_fingerprint(job_from_checkpoint(self)) != self.job_fingerprint:
            raise ValueError("VINCE_RECOVERY_JOB_MISMATCH")


@dataclass(frozen=True)
class VinceRecoveryObservation:
    remote_state: str
    action: str
    network_dispatch_performed: bool
    automatic_retry_performed: bool
    failover_authorized: bool
    accepted_receipt: AcceptedExecutionReceipt | None = None


@dataclass(frozen=True)
class VinceRecoveryProof:
    schema: str
    mission_id: str
    mission_sha256: str
    checkpoint_record_sha256: str
    selected_executor_id: str
    provider_family: str
    dispatch_external_id: str
    remote_state: str
    recovery_state: str
    result_sha256: str | None
    accepted_receipt_sha256: str | None
    network_dispatch_performed: bool
    automatic_retry_performed: bool
    failover_authorized: bool
    duplicate_dispatch_detected: bool
    core_mutation_performed: bool
    trust_modified: bool
    authority_expanded: bool
    proof_sha256: str


def build_recovery_checkpoint(
    mission: VinceMission,
    decision: DispatchDecision,
) -> VinceRecoveryCheckpoint:
    envelope = mission.envelope()
    job = mission.job()
    mission_data = {
        "mission_id": mission.mission_id,
        "objective": mission.objective,
        "checkpoint_sha256": mission.checkpoint_sha256,
        "profile": mission.profile,
        "target_os": mission.target_os,
        "required_capabilities": list(mission.required_capabilities),
        "expected_seconds": mission.expected_seconds,
        "max_cost_microunits": mission.max_cost_microunits,
        "human_review_required": mission.human_review_required,
        "public_only": mission.public_only,
        "secrets_allowed": mission.secrets_allowed,
        "core_mutation_allowed": mission.core_mutation_allowed,
        "return_route": mission.return_route,
    }
    job_data = {
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
    payload = {
        "schema": VINCE_RECOVERY_CHECKPOINT_SCHEMA,
        "mission": mission_data,
        "mission_sha256": envelope["mission_sha256"],
        "job": job_data,
        "job_fingerprint": job_fingerprint(job),
        "selected_executor_id": decision.ref.executor_id,
        "provider_family": decision.ref.provider_family,
        "execution_domain": decision.ranked.descriptor.metadata.get("execution_domain", "unknown"),
        "dispatch_external_id": decision.ref.external_id,
        "dispatch_correlation_id": decision.ref.correlation_id,
        "dispatch_state": "QUEUE_ACCEPTED",
        "automatic_retry_allowed": False,
    }
    checkpoint = VinceRecoveryCheckpoint(
        **payload,
        checkpoint_record_sha256=_sha256(payload),
    )
    checkpoint.validate()
    return checkpoint


def mission_from_checkpoint(checkpoint: VinceRecoveryCheckpoint) -> VinceMission:
    data = checkpoint.mission
    return VinceMission(
        mission_id=data["mission_id"],
        objective=data["objective"],
        checkpoint_sha256=data["checkpoint_sha256"],
        profile=data["profile"],
        target_os=data["target_os"],
        required_capabilities=tuple(data["required_capabilities"]),
        expected_seconds=data["expected_seconds"],
        max_cost_microunits=data["max_cost_microunits"],
        human_review_required=data["human_review_required"],
        public_only=data["public_only"],
        secrets_allowed=data["secrets_allowed"],
        core_mutation_allowed=data["core_mutation_allowed"],
        return_route=data["return_route"],
    )


def job_from_checkpoint(checkpoint: VinceRecoveryCheckpoint) -> JobRequest:
    data = checkpoint.job
    return JobRequest(
        job_id=data["job_id"],
        profile=data["profile"],
        required_capabilities=frozenset(data["required_capabilities"]),
        privacy=data["privacy"],
        secrets_required=data["secrets_required"],
        expected_seconds=data["expected_seconds"],
        max_cost_microunits=data["max_cost_microunits"],
        min_trust=data["min_trust"],
        region=data["region"],
    )


def dispatch_ref_from_checkpoint(checkpoint: VinceRecoveryCheckpoint) -> DispatchRef:
    return DispatchRef(
        executor_id=checkpoint.selected_executor_id,
        provider_family=checkpoint.provider_family,
        external_id=checkpoint.dispatch_external_id,
        correlation_id=checkpoint.dispatch_correlation_id,
    )


def checkpoint_from_dict(value: dict[str, Any]) -> VinceRecoveryCheckpoint:
    checkpoint = VinceRecoveryCheckpoint(**value)
    checkpoint.validate()
    return checkpoint


def observe_recovery(
    checkpoint: VinceRecoveryCheckpoint,
    adapter: Any,
) -> VinceRecoveryObservation:
    checkpoint.validate()
    ref = dispatch_ref_from_checkpoint(checkpoint)
    status = adapter.status(ref)

    if status in {"queued", "in_progress", "pending", "requested", "waiting"}:
        return VinceRecoveryObservation(
            remote_state=status,
            action="WAIT_OR_RECONCILE_ORIGINAL",
            network_dispatch_performed=False,
            automatic_retry_performed=False,
            failover_authorized=False,
        )
    if status != "success":
        return VinceRecoveryObservation(
            remote_state=status,
            action="FAIL_CLOSED_ORIGINAL_OUTCOME_NOT_SUCCESS",
            network_dispatch_performed=False,
            automatic_retry_performed=False,
            failover_authorized=False,
        )

    payload = adapter.result(ref)
    receipt = verify_public_result(job_from_checkpoint(checkpoint), ref, payload)
    return VinceRecoveryObservation(
        remote_state="success",
        action="ACCEPT_ORIGINAL_RESULT",
        network_dispatch_performed=False,
        automatic_retry_performed=False,
        failover_authorized=False,
        accepted_receipt=receipt,
    )


def build_recovery_proof(
    checkpoint: VinceRecoveryCheckpoint,
    observation: VinceRecoveryObservation,
) -> VinceRecoveryProof:
    checkpoint.validate()
    receipt = observation.accepted_receipt
    receipt_hash = _sha256(asdict(receipt)) if receipt is not None else None
    material = {
        "schema": VINCE_RECOVERY_PROOF_SCHEMA,
        "mission_id": checkpoint.mission["mission_id"],
        "mission_sha256": checkpoint.mission_sha256,
        "checkpoint_record_sha256": checkpoint.checkpoint_record_sha256,
        "selected_executor_id": checkpoint.selected_executor_id,
        "provider_family": checkpoint.provider_family,
        "dispatch_external_id": checkpoint.dispatch_external_id,
        "remote_state": observation.remote_state,
        "recovery_state": "RECOVERED_VERIFIED_RESULT" if receipt is not None else "INCONCLUSIVE_UNCERTAIN",
        "result_sha256": receipt.result_sha256 if receipt is not None else None,
        "accepted_receipt_sha256": receipt_hash,
        "network_dispatch_performed": observation.network_dispatch_performed,
        "automatic_retry_performed": observation.automatic_retry_performed,
        "failover_authorized": observation.failover_authorized,
        "duplicate_dispatch_detected": False,
        "core_mutation_performed": False,
        "trust_modified": False,
        "authority_expanded": False,
    }
    return VinceRecoveryProof(**material, proof_sha256=_sha256(material))
