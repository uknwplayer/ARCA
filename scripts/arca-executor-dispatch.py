#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import os
from pathlib import Path
import time

from runtime.executor_mesh import (
    CostAwareScheduler,
    DispatchJournal,
    ExecutorMeshDispatcher,
    GitHubContentsQueueTransport,
    GitQueueAdapter,
    JobRequest,
    ProviderPermanentError,
    ProviderTransientError,
    QueueTargetPolicy,
    load_registry,
)


ROOT = Path(__file__).resolve().parents[1]


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Dispatch one bounded public ARCA executor job")
    result.add_argument("--job-id", required=True)
    result.add_argument("--profile", required=True, choices=("smoke", "python-unit", "node-test", "node-check-public"))
    result.add_argument("--os", required=True, choices=("linux", "windows"))
    result.add_argument("--disable-local", action="store_true", help="Model the canonical execution domain as unavailable")\n    result.add_argument("--fail-satellite-a", action="store_true", help="Inject a controlled transient failure into Satellite A transport for Mesh 005 proof")
    result.add_argument("--collect", action="store_true", help="Wait for and canonically verify the remote result")
    result.add_argument("--collect-timeout", type=int, default=180)
    result.add_argument("--poll-seconds", type=int, default=3)
    return result


def main() -> int:
    args = parser().parse_args()
    if args.collect_timeout < 1 or args.poll_seconds < 1:
        raise SystemExit("collect timeout and poll interval must be positive")
    token = os.environ.get("ARCA_GITHUB_DISPATCH_TOKEN", "")
    repository = os.environ.get("ARCA_CONTROL_REPOSITORY", "uknwplayer/ARCA")
    registry = load_registry(ROOT / "config" / "executor-registry")
    if args.disable_local:
        for executor_id in ("github-arca-linux", "github-arca-windows"):
            item = registry.get(executor_id)
            registry._executors[executor_id] = type(item)(**{**item.__dict__, "available": False})

    transport = GitHubContentsQueueTransport(
        token=token,
        default_repository=repository,
        allowed_targets={
            repository: QueueTargetPolicy({
                "executor-queue": ("queue/linux/requests", "queue/windows/requests"),
            }),
            "uknwplayer/arca-execution-satellite": QueueTargetPolicy({
                "main": ("queue/requests", "queue/windows/requests"),
            }),
        },
    )
    dispatcher = ExecutorMeshDispatcher(
        CostAwareScheduler(registry),
        {"github-git-queue": GitQueueAdapter(transport)},
        DispatchJournal(),
    )
    job = JobRequest(
        args.job_id,
        args.profile,
        frozenset({"python", f"os.{args.os}"}),
    )
    decision = dispatcher.dispatch(job)
    dispatch_record = {
        "job_id": args.job_id,
        "executor_id": decision.ref.executor_id,
        "dispatch_commit_sha": decision.ref.external_id,
        "attempted_executor_ids": decision.attempted_executor_ids,
        "reused": decision.reused,
    }
    print(json.dumps({"dispatch": dispatch_record}, sort_keys=True), flush=True)

    if not args.collect:
        return 0

    deadline = time.monotonic() + args.collect_timeout
    while True:
        try:
            receipt = dispatcher.collect(job)
            print(json.dumps({"accepted_receipt": asdict(receipt)}, sort_keys=True), flush=True)
            return 0
        except ProviderTransientError as exc:
            if time.monotonic() >= deadline:
                print(json.dumps({
                    "verification_state": "TIMEOUT",
                    "job_id": job.job_id,
                    "dispatch_commit_sha": decision.ref.external_id,
                    "reason": str(exc),
                }, sort_keys=True), flush=True)
                return 2
            time.sleep(args.poll_seconds)
        except ProviderPermanentError as exc:
            print(json.dumps({
                "verification_state": "REJECTED",
                "job_id": job.job_id,
                "dispatch_commit_sha": decision.ref.external_id,
                "reason": str(exc),
            }, sort_keys=True), flush=True)
            return 3


if __name__ == "__main__":
    raise SystemExit(main())
