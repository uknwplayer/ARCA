# ARCA Executor Mesh 005 — Multi-Provider Failover V0.1

Status: DESIGN CANDIDATE

## Objective

Extend the LIVE VERIFIED Mesh 004 path from one satellite execution domain to multiple independently described execution domains while preserving canonical scheduling, bounded public jobs, verified result ingestion, and fail-closed trust boundaries.

Mesh 005 does **not** grant new executors authority over ARCA Core. It adds provider diversity and controlled failover.

## Required properties

1. A job is described once by the canonical control plane.
2. Eligibility is evaluated before cost/latency preference.
3. Only executors satisfying capability, profile, privacy, trust and admission constraints may enter the candidate set.
4. Provider-specific transport is behind the existing adapter boundary.
5. A transient provider failure may advance to the next eligible executor.
6. A permanent policy/integrity failure must not be silently converted into success.
7. Every remote result must pass the Mesh 004 canonical verifier before ACCEPTED.
8. Satellite/provider success alone is never canonical acceptance.
9. Public execution paths receive no ARCA secrets.
10. No provider may promote its own trust/admission state.

## Candidate state machine

`REQUESTED -> CANDIDATES -> DISPATCHING -> DISPATCHED -> OBSERVED -> DOWNLOADED -> VERIFIED -> ACCEPTED`

Failover adds:

`DISPATCHING -> TRANSIENT_FAILURE -> NEXT_CANDIDATE`

Terminal failures:

`NO_ELIGIBLE_EXECUTOR | POLICY_REJECTED | INTEGRITY_REJECTED | ATTEMPTS_EXHAUSTED`

## Provider abstraction

Each provider adapter must expose the existing bounded contract:

- `submit(executor, job) -> DispatchRef`
- `status(ref) -> provider status`
- `result(ref) -> public result envelope`

The canonical dispatcher owns provider ordering, attempt limits, journal entries and acceptance. Adapters do not own scheduling or trust.

## Candidate selection

The scheduler must first apply hard gates:

- required capabilities;
- requested profile;
- public/private compatibility;
- secrets requirement;
- trust state;
- admission state;
- platform constraints.

Only after hard gates may it rank candidates using declared operational signals such as queue estimate or bounded cost metadata. Provider identity must not bypass eligibility.

## Failover semantics

Failover is permitted only when the current attempt fails transiently before canonical acceptance.

Examples of transient conditions:

- provider unavailable;
- queue/API temporary failure;
- bounded timeout while no result is yet available.

Examples that fail closed and require explicit handling:

- result identity mismatch;
- result profile mismatch;
- schema mismatch;
- semantic hash mismatch;
- forbidden secret/private workload;
- unauthorized target/path;
- evidence ambiguity.

An integrity rejection must never trigger a quiet retry that hides the rejected evidence.

## Journal

The dispatch journal must preserve an append-only attempt history sufficient to answer:

- which executors were considered;
- which executor was attempted;
- provider family;
- dispatch external/correlation IDs;
- failure class;
- whether failover occurred;
- which dispatch, if any, produced the ACCEPTED receipt.

A successful retry does not erase earlier failures.

## Initial implementation slice

Mesh 005 V0.1 should add:

1. explicit ordered candidate/attempt records;
2. bounded multi-provider attempt orchestration;
3. provider-family-specific adapters registered independently;
4. canonical collection bound to the successful DispatchRef;
5. immutable final receipt plus attempt provenance;
6. negative tests proving permanent/integrity failures do not silently fail over;
7. tests proving transient first-provider failure reaches the second eligible provider;
8. tests proving attempt exhaustion terminates deterministically.

No unbounded daemon, arbitrary shell, trust auto-promotion, secret-bearing public jobs, or provider self-registration is part of this slice.

## Live proof gate

Mesh 005 may be marked LIVE VERIFIED only after a real canonical workflow demonstrates:

1. at least two independently addressable eligible execution domains/providers are registered;
2. the first selected path is deliberately made transiently unavailable or otherwise produces a controlled transient failure;
3. the canonical dispatcher records that failed attempt;
4. it dispatches the same bounded job to the next eligible domain;
5. that domain executes the job;
6. canonical collection retrieves its artifact/result;
7. Mesh 004 verification accepts it;
8. the final receipt identifies the accepted dispatch and preserves the failed-attempt provenance.

A synthetic unit-test-only failover is insufficient for LIVE VERIFIED status.

## Security invariant

Mesh 005 increases availability, not authority.

Adding more executors must not increase the authority of any executor, weaken result verification, expose control-plane credentials, or allow an external execution domain to write or promote canonical ARCA state.
