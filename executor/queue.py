from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from .contract import ExecutionRequest
from .run import execute_request


REQUEST_SCHEMA = "arca.public-executor-request.v0.1"
REQUEST_KEYS = frozenset({
    "schema",
    "profile",
    "request_id",
    "public_only",
    "secrets_allowed",
})


def load_request(path: Path) -> tuple[ExecutionRequest, dict]:
    raw = path.read_bytes()
    data = json.loads(raw)

    if not isinstance(data, dict):
        raise ValueError("request must be a JSON object")
    if set(data) != REQUEST_KEYS:
        raise ValueError("request keys do not match the v0.1 contract")
    if data["schema"] != REQUEST_SCHEMA:
        raise ValueError("unsupported request schema")
    if data["public_only"] is not True:
        raise ValueError("queued public jobs must declare public_only=true")
    if data["secrets_allowed"] is not False:
        raise ValueError("queued public jobs must declare secrets_allowed=false")

    request = ExecutionRequest(
        profile=data["profile"],
        request_id=data["request_id"],
    )
    request.validate()

    if path.stem != request.request_id:
        raise ValueError("request_id must match the request filename")

    metadata = {
        "source": "git-queue",
        "path": path.as_posix(),
        "request_sha256": hashlib.sha256(raw).hexdigest(),
    }
    return request, metadata


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request-file", required=True)
    parser.add_argument("--output", default="execution-result.json")
    args = parser.parse_args()

    request, metadata = load_request(Path(args.request_file))
    payload = execute_request(
        request,
        output=args.output,
        request_metadata=metadata,
    )
    print(json.dumps({
        "ok": payload["result"]["exit_code"] == 0,
        "executor_id": payload["executor_id"],
        "request_id": payload["request_id"],
        "profile": payload["profile"],
        "request_sha256": metadata["request_sha256"],
        "result_sha256": payload["result_sha256"],
    }, sort_keys=True))
    return int(payload["result"]["exit_code"])


if __name__ == "__main__":
    raise SystemExit(main())
