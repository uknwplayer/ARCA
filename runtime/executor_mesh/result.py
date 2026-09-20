from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Any

from .adapter import DispatchRef, ProviderPermanentError
from .model import JobRequest


PUBLIC_RESULT_SCHEMA = "arca.public-executor-result.v0.1"
RECEIPT_SCHEMA = "arca.executor-receipt.v0.1"


@dataclass(frozen=True)
class AcceptedExecutionReceipt:
    schema: str
    job_id: str
    executor_id: str
    provider_family: str
    dispatch_external_id: str
    dispatch_correlation_id: str
    profile: str
    result_sha256: str
    verification_state: str = "ACCEPTED"


def verify_public_result(
    job: JobRequest,
    ref: DispatchRef,
    payload: dict[str, Any],
) -> AcceptedExecutionReceipt:
    if job.privacy != "public" or job.secrets_required:
        raise ProviderPermanentError("public result path cannot accept private or secret-bearing jobs")
    if payload.get("schema") != PUBLIC_RESULT_SCHEMA:
        raise ProviderPermanentError("result schema mismatch")
    if payload.get("executor_id") != ref.executor_id:
        raise ProviderPermanentError("result executor mismatch")
    if payload.get("request_id") != job.job_id:
        raise ProviderPermanentError("result request mismatch")
    if payload.get("profile") != job.profile:
        raise ProviderPermanentError("result profile mismatch")

    claimed = payload.get("result_sha256")
    if not isinstance(claimed, str) or len(claimed) != 64:
        raise ProviderPermanentError("result hash missing or malformed")

    unsigned = dict(payload)
    unsigned.pop("result_sha256", None)
    encoded = json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
    actual = hashlib.sha256(encoded).hexdigest()
    if actual != claimed:
        raise ProviderPermanentError("result hash mismatch")

    result = payload.get("result")
    if not isinstance(result, dict) or result.get("exit_code") != 0:
        raise ProviderPermanentError("execution result is not successful")

    return AcceptedExecutionReceipt(
        schema=RECEIPT_SCHEMA,
        job_id=job.job_id,
        executor_id=ref.executor_id,
        provider_family=ref.provider_family,
        dispatch_external_id=ref.external_id,
        dispatch_correlation_id=ref.correlation_id,
        profile=job.profile,
        result_sha256=claimed,
    )
