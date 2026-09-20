from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from .contract import ExecutionRequest


def _npm() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def _run(command: list[str]) -> dict:
    completed = subprocess.run(
        command,
        check=False,
        text=True,
        capture_output=True,
    )
    return {
        "exit_code": completed.returncode,
        "stdout_sha256": hashlib.sha256(completed.stdout.encode()).hexdigest(),
        "stderr_sha256": hashlib.sha256(completed.stderr.encode()).hexdigest(),
    }


def run_profile(profile: str) -> dict:
    if profile == "smoke":
        return {"exit_code": 0, "checks": ["python-runtime", "filesystem-write"]}
    if profile == "python-unit":
        return _run([sys.executable, "-m", "unittest", "discover", "-s", "tests/executor_mesh", "-v"])
    if profile == "node-test":
        return _run([_npm(), "test"])
    if profile == "node-check-public":
        return _run([_npm(), "run", "check:public"])
    raise ValueError(profile)


def execute_request(
    request: ExecutionRequest,
    *,
    output: str,
    request_metadata: dict | None = None,
) -> dict:
    request.validate()
    started = datetime.now(timezone.utc)
    result = run_profile(request.profile)
    finished = datetime.now(timezone.utc)
    payload = {
        "schema": "arca.public-executor-result.v0.1",
        "executor_id": os.getenv("ARCA_EXECUTOR_ID", "github-arca-public"),
        "request_id": request.request_id,
        "profile": request.profile,
        "git_sha": os.getenv("GITHUB_SHA", "local"),
        "run_id": os.getenv("GITHUB_RUN_ID", "local"),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "result": result,
    }
    if request_metadata is not None:
        payload["request"] = request_metadata
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    payload["result_sha256"] = hashlib.sha256(encoded).hexdigest()
    Path(output).write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--request-id", required=True)
    parser.add_argument("--output", default="execution-result.json")
    args = parser.parse_args()

    request = ExecutionRequest(profile=args.profile, request_id=args.request_id)
    payload = execute_request(request, output=args.output)
    print(json.dumps({
        "ok": payload["result"]["exit_code"] == 0,
        "executor_id": payload["executor_id"],
        "request_id": payload["request_id"],
        "profile": payload["profile"],
        "result_sha256": payload["result_sha256"],
    }, sort_keys=True))
    return int(payload["result"]["exit_code"])


if __name__ == "__main__":
    raise SystemExit(main())
