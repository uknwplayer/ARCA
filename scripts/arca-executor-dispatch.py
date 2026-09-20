#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from runtime.executor_mesh import (
    CostAwareScheduler,
    DispatchJournal,
    ExecutorMeshDispatcher,
    GitHubContentsQueueTransport,
    GitQueueAdapter,
    JobRequest,
    QueueTargetPolicy,
    load_registry,
)


ROOT = Path(__file__).resolve().parents[1]


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Dispatch one bounded public ARCA executor job")
    result.add_argument("--job-id", required=True)
    result.add_argument("--profile", required=True, choices=("smoke", "python-unit", "node-test", "node-check-public"))
    result.add_argument("--os", required=True, choices=("linux", "windows"))
    result.add_argument("--disable-local", action="store_true", help="Model the canonical execution domain as unavailable")
    return result


def main() -> int:
    args = parser().parse_args()
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
    print(json.dumps({
        "job_id": args.job_id,
        "executor_id": decision.ref.executor_id,
        "dispatch_commit_sha": decision.ref.external_id,
        "attempted_executor_ids": decision.attempted_executor_ids,
        "reused": decision.reused,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
