# Executor Mesh 004 — Verified Result Ingestion v0.1

Status: design boundary proposed; no new authority granted.

## Objective

Mesh 003 proved autonomous bounded dispatch from the canonical ARCA control plane to a remote execution domain. Mesh 004 closes the return path: the control plane must be able to retrieve a completed result, verify that it belongs to the dispatched job and executor, verify its semantic hash, and only then expose it as an accepted execution result.

The first increment deliberately remains single-provider and public-only. Multi-provider federation is a later step.

## Required state machine

```text
DISPATCHED
  -> OBSERVED
  -> COMPLETED
  -> DOWNLOADED
  -> VERIFIED
  -> ACCEPTED

Any failed invariant
  -> REJECTED
```

A provider-reported `success` is not sufficient for `ACCEPTED`.

## Acceptance invariants

A result may become `ACCEPTED` only when all of these are true:

1. the dispatch reference already exists in the canonical journal;
2. the provider family and executor ID match the dispatch reference;
3. the returned `request_id` equals the original `job_id`;
4. the returned `profile` equals the original bounded profile;
5. the result schema is exactly the admitted public result schema;
6. the semantic SHA-256 recomputed by ARCA equals `result_sha256`;
7. exactly one non-expired result artifact is present;
8. the execution completed successfully;
9. no secret-bearing or private job is accepted through this public path.

A mismatch is a verification failure, never a retry onto a different executor after a result has been returned.

## Authority boundary

Mesh 004 does not grant executors any write authority over the canonical ARCA repository.

The control plane may read workflow status and result artifacts from an allowlisted execution repository. The remote executor remains unable to:

- modify the Core;
- alter registry trust or admission state;
- add workflows;
- submit arbitrary shell commands;
- receive ARCA secrets;
- mark its own result as accepted.

Acceptance is exclusively a canonical control-plane decision.

## Canonical receipt

After verification, ARCA should construct an immutable receipt containing at least:

```json
{
  "schema": "arca.executor-receipt.v0.1",
  "job_id": "...",
  "executor_id": "...",
  "provider_family": "...",
  "dispatch_external_id": "...",
  "dispatch_correlation_id": "...",
  "profile": "...",
  "result_sha256": "...",
  "verification_state": "ACCEPTED"
}
```

The receipt must contain no token, authorization header, secret, or private payload.

## Failure classes

Transport and observation failures may be transient. Integrity failures are permanent.

Permanent integrity failures include:

- request ID mismatch;
- executor ID mismatch;
- profile mismatch;
- schema mismatch;
- semantic hash mismatch;
- multiple result artifacts;
- malformed result JSON.

These failures must fail closed.

## Initial implementation slice

The smallest useful implementation is:

1. add a canonical result verifier independent of provider transport;
2. make the dispatcher expose a `collect(job)` operation for an existing dispatch;
3. call the selected adapter's `status` and `result`;
4. verify the result against the original job and dispatch reference;
5. return an immutable accepted receipt;
6. add negative tests for every mismatch above.

No polling daemon, webhook, database, multi-provider discovery or trust promotion belongs in this first slice.

## Live proof gate

Mesh 004 may be called LIVE VERIFIED only after a new autonomous satellite dispatch is created and the canonical ARCA workflow itself retrieves the resulting artifact, recomputes the semantic hash, verifies identity/profile/schema, and emits an accepted receipt.

Until then:

```text
Mesh 003 autonomous dispatch: LIVE VERIFIED
Mesh 004 verified result ingestion: DESIGN / IMPLEMENTATION PENDING
```
