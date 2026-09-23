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
from runtime.vince_recovery import (
    build_recovery_checkpoint,
    build_recovery_proof,
    checkpoint_from_dict,
    observe_recovery,
)


ROOT=Path(__file__).resolve().parents[1]
CURRENT_CHECKPOINT=ROOT/"docs"/"checkpoints"/"ARCA_HANDOFF_CHECKPOINT_CURRENT.md"


def parser() -> argparse.ArgumentParser:
    p=argparse.ArgumentParser(description="Vince V3.1 recovery probe")
    sub=p.add_subparsers(dest="phase",required=True)

    d=sub.add_parser("dispatch")
    d.add_argument("--mission-id",required=True)
    d.add_argument("--checkpoint-output",default="artifacts/vince-recovery-checkpoint.json")

    r=sub.add_parser("recover")
    r.add_argument("--checkpoint-input",required=True)
    r.add_argument("--proof-output",default="artifacts/vince-recovery-live-proof.json")
    r.add_argument("--timeout-seconds",type=int,default=240)
    r.add_argument("--poll-seconds",type=int,default=3)
    return p


def stable(value: object) -> str:
    return json.dumps(value,sort_keys=True,separators=(",",":"))


def current_checkpoint_hash() -> str:
    return hashlib.sha256(CURRENT_CHECKPOINT.read_bytes()).hexdigest()


def transport() -> GitHubContentsQueueTransport:
    token=os.environ.get("ARCA_GITHUB_DISPATCH_TOKEN","")
    repository=os.environ.get("ARCA_CONTROL_REPOSITORY","uknwplayer/ARCA")
    if not token:
        raise SystemExit("VINCE_DISPATCH_TOKEN_REQUIRED")
    return GitHubContentsQueueTransport(
        token=token,
        default_repository=repository,
        allowed_targets={
            repository:QueueTargetPolicy({
                "executor-queue":("queue/linux/requests",),
            }),
            "uknwplayer/arca-execution-satellite":QueueTargetPolicy({
                "main":("queue/requests",),
            }),
            "uknwplayer/arca-execution-satellite-b":QueueTargetPolicy({
                "main":("queue/requests",),
            }),
        },
    )


def force_satellite_a(registry) -> None:
    local=registry.get("github-arca-linux")
    registry._executors[local.executor_id]=ExecutorDescriptor(
        **{**local.__dict__,"available":False}
    )


def dispatch_phase(args: argparse.Namespace) -> int:
    registry=load_registry(ROOT/"config"/"executor-registry")
    force_satellite_a(registry)
    mission=VinceMission(
        mission_id=args.mission_id,
        objective="prove crash recovery uses original dispatch without redispatch",
        checkpoint_sha256=current_checkpoint_hash(),
        profile="smoke",
        target_os="linux",
        required_capabilities=("python","artifact.sha256"),
        expected_seconds=30,
        max_cost_microunits=0,
    )
    wire=transport()
    dispatcher=ExecutorMeshDispatcher(
        CostAwareScheduler(registry),
        {
            "github-git-queue":GitQueueAdapter(wire),
            "github-git-queue-b":GitQueueAdapter(wire,provider_family="github-git-queue-b"),
        },
        DispatchJournal(),
    )
    vince=VincePathfinder(registry)
    decision=vince.dispatch_decision(mission,dispatcher)
    if decision.ref.executor_id!="github-satellite-linux":
        raise SystemExit("VINCE_RECOVERY_EXPECTED_SATELLITE_A")
    checkpoint=build_recovery_checkpoint(mission,decision)
    target=ROOT/args.checkpoint_output
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(asdict(checkpoint),indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(stable({
        "vince_recovery_dispatch":{
            "mission_id":mission.mission_id,
            "selected_executor_id":checkpoint.selected_executor_id,
            "provider_family":checkpoint.provider_family,
            "dispatch_external_id":checkpoint.dispatch_external_id,
            "dispatch_state":checkpoint.dispatch_state,
            "checkpoint_record_sha256":checkpoint.checkpoint_record_sha256,
            "automatic_retry_allowed":checkpoint.automatic_retry_allowed,
            "simulated_coordinator_exit_after_checkpoint":True,
        }
    }),flush=True)
    return 0


def recover_phase(args: argparse.Namespace) -> int:
    if args.timeout_seconds<1 or args.poll_seconds<1:
        raise SystemExit("VINCE_RECOVERY_TIMEOUT_INVALID")
    raw=json.loads((ROOT/args.checkpoint_input).read_text(encoding="utf-8"))
    checkpoint=checkpoint_from_dict(raw)

    wire=transport()
    adapters={
        "github-git-queue":GitQueueAdapter(wire),
        "github-git-queue-b":GitQueueAdapter(wire,provider_family="github-git-queue-b"),
    }
    adapter=adapters.get(checkpoint.provider_family)
    if adapter is None:
        raise SystemExit("VINCE_RECOVERY_PROVIDER_UNAVAILABLE")

    deadline=time.monotonic()+args.timeout_seconds
    last_remote_state="unseen"
    while True:
        try:
            observation=observe_recovery(checkpoint,adapter)
            last_remote_state=observation.remote_state
            if observation.accepted_receipt is not None:
                proof=build_recovery_proof(checkpoint,observation)
                target=ROOT/args.proof_output
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text(json.dumps({
                    "checkpoint":raw,
                    "proof":asdict(proof),
                },indent=2,sort_keys=True)+"\n",encoding="utf-8")
                print(stable({
                    "vince_recovery":{
                        "mission_id":proof.mission_id,
                        "selected_executor_id":proof.selected_executor_id,
                        "dispatch_external_id":proof.dispatch_external_id,
                        "remote_state":proof.remote_state,
                        "recovery_state":proof.recovery_state,
                        "result_sha256":proof.result_sha256,
                        "accepted_receipt_sha256":proof.accepted_receipt_sha256,
                        "proof_sha256":proof.proof_sha256,
                        "network_dispatch_performed":proof.network_dispatch_performed,
                        "automatic_retry_performed":proof.automatic_retry_performed,
                        "failover_authorized":proof.failover_authorized,
                        "duplicate_dispatch_detected":proof.duplicate_dispatch_detected,
                    }
                }),flush=True)
                return 0

            if observation.action=="FAIL_CLOSED_ORIGINAL_OUTCOME_NOT_SUCCESS":
                proof=build_recovery_proof(checkpoint,observation)
                target=ROOT/args.proof_output
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text(json.dumps({
                    "checkpoint":raw,
                    "proof":asdict(proof),
                },indent=2,sort_keys=True)+"\n",encoding="utf-8")
                print(stable({"vince_recovery":{
                    "recovery_state":proof.recovery_state,
                    "remote_state":proof.remote_state,
                    "automatic_retry_performed":False,
                    "failover_authorized":False,
                }}),flush=True)
                return 3
        except ProviderTransientError:
            last_remote_state="transport-uncertain"
        except ProviderPermanentError:
            print(stable({"vince_recovery":{
                "recovery_state":"REJECTED_ORIGINAL_EVIDENCE",
                "automatic_retry_performed":False,
                "failover_authorized":False,
            }}),flush=True)
            return 4

        if time.monotonic()>=deadline:
            print(stable({"vince_recovery":{
                "recovery_state":"INCONCLUSIVE_UNCERTAIN",
                "remote_state":last_remote_state,
                "network_dispatch_performed":False,
                "automatic_retry_performed":False,
                "failover_authorized":False,
            }}),flush=True)
            return 2
        time.sleep(args.poll_seconds)


def main() -> int:
    args=parser().parse_args()
    return dispatch_phase(args) if args.phase=="dispatch" else recover_phase(args)


if __name__=="__main__":
    raise SystemExit(main())
