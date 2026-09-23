#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import time

from runtime.executor_mesh import (
    CostAwareScheduler,
    DispatchJournal,
    ExecutorDescriptor,
    ExecutorMeshDispatcher,
    GitHubContentsQueueTransport,
    GitQueueAdapter,
    ProviderPermanentError,
    ProviderTransientError,
    QueueTargetPolicy,
    load_registry,
)
from runtime.vince_pathfinder import VinceMission, VincePathfinder


ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "docs" / "checkpoints" / "ARCA_HANDOFF_CHECKPOINT_CURRENT.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one bounded Vince Pathfinder route proof")
    parser.add_argument("--mission-id", required=True)
    parser.add_argument("--force-satellite", action="store_true")
    parser.add_argument("--fail-satellite-a", action="store_true")
    parser.add_argument("--collect-timeout", type=int, default=240)
    parser.add_argument("--poll-seconds", type=int, default=3)
    parser.add_argument("--output", default="artifacts/vince-pathfinder-live-proof.json")
    return parser.parse_args()


def checkpoint_hash() -> str:
    return hashlib.sha256(CHECKPOINT.read_bytes()).hexdigest()


def mark_canonical_linux_unavailable(registry) -> None:
    item = registry.get("github-arca-linux")
    registry._executors[item.executor_id] = ExecutorDescriptor(
        **{**item.__dict__, "available": False}
    )


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def main() -> int:
    args = parse_args()
    if args.collect_timeout < 1 or args.poll_seconds < 1:
        raise SystemExit("timeouts must be positive")

    token = os.environ.get("ARCA_GITHUB_DISPATCH_TOKEN", "")
    repository = os.environ.get("ARCA_CONTROL_REPOSITORY", "uknwplayer/ARCA")
    if not token:
        raise SystemExit("VINCE_DISPATCH_TOKEN_REQUIRED")

    registry = load_registry(ROOT / "config" / "executor-registry")
    if args.force_satellite:
        mark_canonical_linux_unavailable(registry)

    mission = VinceMission(
        mission_id=args.mission_id,
        objective="prove bounded discovery route ack execution and return",
        checkpoint_sha256=checkpoint_hash(),
        profile="smoke",
        target_os="linux",
        required_capabilities=("python", "artifact.sha256"),
        expected_seconds=30,
        max_cost_microunits=0,
    )
    vince = VincePathfinder(registry)
    discovery = vince.discover(mission)
    if not discovery.routes:
        raise SystemExit("VINCE_NO_ADMISSIBLE_ROUTE")

    transport = GitHubContentsQueueTransport(
        token=token,
        default_repository=repository,
        allowed_targets={
            repository: QueueTargetPolicy({
                "executor-queue": ("queue/linux/requests",),
            }),
            "uknwplayer/arca-execution-satellite": QueueTargetPolicy({
                "main": ("queue/requests",),
            }),
            "uknwplayer/arca-execution-satellite-b": QueueTargetPolicy({
                "main": ("queue/requests",),
            }),
        },
    )
    primary = GitQueueAdapter(transport)
    satellite_b = GitQueueAdapter(transport, provider_family="github-git-queue-b")

    class ControlledTransientAdapter:
        def submit(self, executor, job):
            raise ProviderTransientError("VINCE_CONTROLLED_TRANSIENT_BEFORE_DISPATCH_ACCEPTANCE")
        def status(self, ref):
            return primary.status(ref)
        def result(self, ref):
            return primary.result(ref)

    journal = DispatchJournal()
    dispatcher = ExecutorMeshDispatcher(
        CostAwareScheduler(registry),
        {
            "github-git-queue": ControlledTransientAdapter() if args.fail_satellite_a else primary,
            "github-git-queue-b": satellite_b,
        },
        journal,
    )

    decision = vince.dispatch_decision(mission, dispatcher)
    ack = vince.acknowledge(mission, decision)
    attempt_history = [
        {
            "executor_id": attempt.executor_id,
            "provider_family": attempt.provider_family,
            "outcome": attempt.outcome,
            "has_dispatch_ref": attempt.ref is not None,
        }
        for attempt in journal.attempt_history(mission.job())
    ]

    output = {
        "mission": mission.envelope(),
        "discovery": asdict(discovery),
        "ack": asdict(ack),
        "attempt_history": attempt_history,
        "result": None,
    }
    print(canonical_json({
        "vince": {
            "mission_id": mission.mission_id,
            "candidate_count": discovery.candidate_count,
            "selected_executor_id": decision.ref.executor_id,
            "execution_domain": decision.ranked.descriptor.metadata.get("execution_domain", "unknown"),
            "ack_state": ack.ack_state,
            "execution_state": ack.execution_state,
            "dispatch_external_id": decision.ref.external_id,
            "attempt_history": attempt_history,
        }
    }), flush=True)

    deadline = time.monotonic() + args.collect_timeout
    while True:
        try:
            receipt = dispatcher.collect(mission.job())
            if args.fail_satellite_a:
                final = vince.reconcile_failover(mission, decision, receipt, journal)
                output["failover"] = asdict(final)
                output["result"] = {
                    "execution_state": "VERIFIED_RESULT",
                    "result_sha256": final.result_sha256,
                    "accepted_receipt_sha256": final.accepted_receipt_sha256,
                    "proof_sha256": final.proof_sha256,
                    "failover_safe": final.failover_safe,
                    "duplicate_dispatch_detected": final.duplicate_dispatch_detected,
                    "failed_executor_id": final.failed_executor_id,
                    "selected_executor_id": final.selected_executor_id,
                }
            else:
                final = vince.reconcile(mission, decision, receipt)
                output["result"] = asdict(final)
            target = ROOT / args.output
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print(canonical_json({
                "vince": {
                    "mission_id": mission.mission_id,
                    "selected_executor_id": final.selected_executor_id,
                    "execution_state": "VERIFIED_RESULT" if args.fail_satellite_a else final.execution_state,
                    "result_sha256": final.result_sha256,
                    "proof_sha256": final.proof_sha256,
                    "failover_safe": getattr(final, "failover_safe", None),
                    "duplicate_dispatch_detected": getattr(final, "duplicate_dispatch_detected", None),
                    "core_mutation_performed": final.core_mutation_performed,
                    "authority_expanded": final.authority_expanded,
                }
            }), flush=True)
            return 0
        except ProviderTransientError as exc:
            if time.monotonic() >= deadline:
                output["result"] = {
                    "execution_state": "INCONCLUSIVE_TIMEOUT",
                    "reason_code": "VINCE_REMOTE_RESULT_TIMEOUT",
                }
                target = ROOT / args.output
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
                print(canonical_json(output["result"]), flush=True)
                return 2
            time.sleep(args.poll_seconds)
        except ProviderPermanentError as exc:
            output["result"] = {
                "execution_state": "REJECTED",
                "reason_code": "VINCE_REMOTE_RESULT_REJECTED",
                "detail": str(exc),
            }
            target = ROOT / args.output
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print(canonical_json(output["result"]), flush=True)
            return 3


if __name__ == "__main__":
    raise SystemExit(main())
