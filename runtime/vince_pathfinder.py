from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import re
from typing import Iterable

from runtime.executor_mesh import (
    AcceptedExecutionReceipt,
    CostAwareScheduler,
    DispatchDecision,
    ExecutorMeshDispatcher,
    ExecutorRegistry,
    JobRequest,
)


VINCE_MISSION_SCHEMA = "arca.vince-pathfinder-mission.v0.1"
VINCE_DISCOVERY_SCHEMA = "arca.vince-route-discovery.v0.1"
VINCE_PROOF_SCHEMA = "arca.vince-pathfinder-proof.v0.1"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,96}$")
_SAFE_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def _sha256_json(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class VinceMission:
    mission_id: str
    objective: str
    checkpoint_sha256: str
    profile: str
    target_os: str
    required_capabilities: tuple[str, ...] = ("python",)
    expected_seconds: int = 60
    max_cost_microunits: int | None = 0
    human_review_required: bool = True
    public_only: bool = True
    secrets_allowed: bool = False
    core_mutation_allowed: bool = False
    return_route: str = "executor-mesh.accepted-receipt"

    def validate(self) -> None:
        if not _SAFE_ID.fullmatch(self.mission_id):
            raise ValueError("VINCE_MISSION_ID_INVALID")
        if not self.objective or len(self.objective) > 160 or any(ord(ch) < 32 for ch in self.objective):
            raise ValueError("VINCE_OBJECTIVE_INVALID")
        if not _SAFE_SHA256.fullmatch(self.checkpoint_sha256):
            raise ValueError("VINCE_CHECKPOINT_HASH_INVALID")
        if self.profile not in {"smoke", "python-unit"}:
            raise ValueError("VINCE_PROFILE_NOT_ALLOWLISTED")
        if self.target_os not in {"linux", "windows"}:
            raise ValueError("VINCE_TARGET_OS_INVALID")
        if not self.required_capabilities or any(not _SAFE_ID.fullmatch(x) for x in self.required_capabilities):
            raise ValueError("VINCE_CAPABILITIES_INVALID")
        if self.expected_seconds < 1 or self.expected_seconds > 300:
            raise ValueError("VINCE_EXPECTED_SECONDS_INVALID")
        if self.max_cost_microunits is not None and self.max_cost_microunits < 0:
            raise ValueError("VINCE_COST_BUDGET_INVALID")
        if self.human_review_required is not True:
            raise ValueError("VINCE_HUMAN_REVIEW_REQUIRED")
        if self.public_only is not True or self.secrets_allowed is not False or self.core_mutation_allowed is not False:
            raise ValueError("VINCE_AUTHORITY_EXPANSION_FORBIDDEN")
        if self.return_route != "executor-mesh.accepted-receipt":
            raise ValueError("VINCE_RETURN_ROUTE_INVALID")

    def job(self) -> JobRequest:
        self.validate()
        caps = set(self.required_capabilities)
        caps.add(f"os.{self.target_os}")
        caps.add(f"profile.{self.profile}")
        return JobRequest(
            job_id=self.mission_id,
            profile=self.profile,
            required_capabilities=frozenset(caps),
            privacy="public",
            secrets_required=False,
            expected_seconds=self.expected_seconds,
            max_cost_microunits=self.max_cost_microunits,
            min_trust="VERIFIED",
        )

    def envelope(self) -> dict:
        self.validate()
        body = {
            "schema": VINCE_MISSION_SCHEMA,
            "identity": "vince",
            "mission_id": self.mission_id,
            "objective": self.objective,
            "checkpoint_sha256": self.checkpoint_sha256,
            "profile": self.profile,
            "target_os": self.target_os,
            "required_capabilities": sorted(set(self.required_capabilities)),
            "permissions": {
                "public_only": True,
                "secrets_allowed": False,
                "core_mutation_allowed": False,
                "trust_modify_allowed": False,
                "merge_allowed": False,
                "shell_arbitrary_allowed": False,
            },
            "proof_required": [
                "dispatch-reference",
                "executor-identity",
                "semantic-result-sha256",
                "accepted-receipt",
            ],
            "return_route": self.return_route,
            "human_review_required": True,
        }
        return {**body, "mission_sha256": _sha256_json(body)}


@dataclass(frozen=True)
class VinceRoute:
    executor_id: str
    provider_family: str
    execution_domain: str
    score: int
    network_hops: int
    trust_state: str
    admission_state: str
    capabilities: tuple[str, ...]


@dataclass(frozen=True)
class VinceDiscovery:
    schema: str
    mission_id: str
    mission_sha256: str
    candidate_count: int
    routes: tuple[VinceRoute, ...]
    trust_granted: bool
    authority_expanded: bool


@dataclass(frozen=True)
class VincePathfinderProof:
    schema: str
    mission_id: str
    mission_sha256: str
    checkpoint_sha256: str
    selected_executor_id: str
    provider_family: str
    execution_domain: str
    dispatch_external_id: str
    dispatch_correlation_id: str
    dispatch_reused: bool
    attempted_executor_ids: tuple[str, ...]
    ack_state: str
    execution_state: str
    result_sha256: str | None
    accepted_receipt_sha256: str | None
    human_review_required: bool
    core_mutation_performed: bool
    trust_modified: bool
    authority_expanded: bool
    proof_sha256: str


class VincePathfinder:
    def __init__(self, registry: ExecutorRegistry):
        self.registry = registry
        self.scheduler = CostAwareScheduler(registry)

    def discover(self, mission: VinceMission) -> VinceDiscovery:
        envelope = mission.envelope()
        ranked = self.scheduler.rank(mission.job())
        routes = tuple(
            VinceRoute(
                executor_id=item.descriptor.executor_id,
                provider_family=item.descriptor.provider_family,
                execution_domain=item.descriptor.metadata.get("execution_domain", "unknown"),
                score=item.score,
                network_hops=item.descriptor.network_hops,
                trust_state=item.descriptor.trust_state,
                admission_state=item.descriptor.admission_state,
                capabilities=tuple(sorted(item.descriptor.capabilities)),
            )
            for item in ranked
        )
        return VinceDiscovery(
            schema=VINCE_DISCOVERY_SCHEMA,
            mission_id=mission.mission_id,
            mission_sha256=envelope["mission_sha256"],
            candidate_count=len(routes),
            routes=routes,
            trust_granted=False,
            authority_expanded=False,
        )

    def dispatch_decision(self, mission: VinceMission, dispatcher: ExecutorMeshDispatcher) -> DispatchDecision:
        discovery = self.discover(mission)
        if not discovery.routes:
            raise RuntimeError("VINCE_NO_ADMISSIBLE_ROUTE")
        return dispatcher.dispatch(mission.job())

    def dispatch(self, mission: VinceMission, dispatcher: ExecutorMeshDispatcher) -> VincePathfinderProof:
        decision = self.dispatch_decision(mission, dispatcher)
        return self._proof(mission, decision, receipt=None)

    def reconcile(
        self,
        mission: VinceMission,
        decision: DispatchDecision,
        receipt: AcceptedExecutionReceipt,
    ) -> VincePathfinderProof:
        if receipt.verification_state != "ACCEPTED":
            raise ValueError("VINCE_RESULT_NOT_ACCEPTED")
        if receipt.job_id != mission.mission_id:
            raise ValueError("VINCE_RESULT_MISSION_MISMATCH")
        if receipt.executor_id != decision.ref.executor_id:
            raise ValueError("VINCE_RESULT_EXECUTOR_MISMATCH")
        if receipt.provider_family != decision.ref.provider_family:
            raise ValueError("VINCE_RESULT_PROVIDER_MISMATCH")
        return self._proof(mission, decision, receipt=receipt)

    def _proof(
        self,
        mission: VinceMission,
        decision: DispatchDecision,
        *,
        receipt: AcceptedExecutionReceipt | None,
    ) -> VincePathfinderProof:
        envelope = mission.envelope()
        descriptor = decision.ranked.descriptor
        receipt_hash = _sha256_json(asdict(receipt)) if receipt is not None else None
        material = {
            "schema": VINCE_PROOF_SCHEMA,
            "mission_id": mission.mission_id,
            "mission_sha256": envelope["mission_sha256"],
            "checkpoint_sha256": mission.checkpoint_sha256,
            "selected_executor_id": decision.ref.executor_id,
            "provider_family": decision.ref.provider_family,
            "execution_domain": descriptor.metadata.get("execution_domain", "unknown"),
            "dispatch_external_id": decision.ref.external_id,
            "dispatch_correlation_id": decision.ref.correlation_id,
            "dispatch_reused": decision.reused,
            "attempted_executor_ids": list(decision.attempted_executor_ids),
            "ack_state": "QUEUE_ACCEPTED",
            "execution_state": "VERIFIED_RESULT" if receipt is not None else "PENDING",
            "result_sha256": receipt.result_sha256 if receipt is not None else None,
            "accepted_receipt_sha256": receipt_hash,
            "human_review_required": True,
            "core_mutation_performed": False,
            "trust_modified": False,
            "authority_expanded": False,
        }
        return VincePathfinderProof(
            **material,
            attempted_executor_ids=tuple(material["attempted_executor_ids"]),
            proof_sha256=_sha256_json(material),
        )


def route_ids(discovery: VinceDiscovery) -> tuple[str, ...]:
    return tuple(route.executor_id for route in discovery.routes)
