# ARCA Executor Mesh 006 — Parallel Fan-Out / Fan-In

Status: DESIGN
Date: 2026-09-20
Predecessor: Executor Mesh 005 LIVE VERIFIED

## Objective

Allow one canonical mission to be decomposed into multiple bounded child jobs that may execute concurrently across independently addressable admitted executors, while preserving the existing Mesh 004 verification boundary and Mesh 005 provider/failure provenance.

## Non-goals

Mesh 006 does not introduce voting, consensus, majority acceptance, provider self-admission, arbitrary shell execution, secret-bearing public jobs, or trust inheritance. Replicated execution and quorum are deferred.

## Mission model

A mission has a stable `mission_id` and an immutable ordered set of child specifications. Every child receives a deterministic `child_id`, its own normal Executor Mesh `JobRequest`, and a parent reference to the mission.

The canonical control plane is the only component that may declare the mission complete.

## State model

Mission:

`PLANNED -> DISPATCHING -> RUNNING -> COLLECTING -> COMPLETED`

Terminal exceptional states:

`PARTIAL`, `REJECTED`, `FAILED`.

Child jobs retain the existing dispatch/result states and receipts. A child is eligible for aggregation only when its canonical receipt is `ACCEPTED`.

## Core invariants

1. A mission is immutable after dispatch begins.
2. Child IDs are deterministic and unique within the mission.
3. Every child preserves its own attempt history.
4. Every remote result passes Mesh 004 verification independently.
5. A provider/executor cannot mark the parent mission complete.
6. Aggregation consumes canonical accepted receipts, never raw unverified provider output.
7. A failed child cannot silently disappear from the mission record.
8. Retry/failover of one child must not duplicate accepted siblings.
9. Public transports continue to reject private or secret-bearing jobs.
10. Concurrency is bounded by an explicit control-plane limit.
11. Fan-in is deterministic for the same ordered set of accepted child receipts.
12. Mission provenance records the selected executor/provider and receipt hash for every child.

## Scheduling

The scheduler may place different children on different eligible executors. Eligibility and trust admission are evaluated before cost, latency, balancing, or affinity.

Mesh 006 adds distribution pressure so an available second domain can receive work even when the first domain remains healthy. This is distinct from Mesh 005 failover.

Initial implementation should use a bounded worker pool rather than unbounded thread/process creation.

## Partial failure

The mission declares an explicit completion policy:

- `all_required`: every child must reach ACCEPTED.
- `allow_partial`: accepted children may be aggregated, but missing/rejected children must be listed and the mission terminates PARTIAL.

The default is `all_required`.

Permanent integrity/policy failures remain fail-closed and cannot be converted into accepted work by aggregation.

## Fan-in receipt

Introduce a canonical mission receipt, proposed schema:

`arca.executor-mission-receipt.v0.1`

Minimum fields:

- mission_id
- completion_policy
- mission_state
- ordered child receipts/references
- executor/provider provenance per child
- accepted_child_count
- failed_child_count
- deterministic aggregate SHA-256

The aggregate hash commits to canonical child receipt material, not provider-controlled presentation.

## Idempotency

Re-running the same mission must reuse already accepted child work when the immutable child specification matches. A conflicting child specification under an existing mission/child identity is rejected.

## Security boundary

Mesh 006 increases throughput, not authority.

No child receives secrets through a public queue. No satellite gains write authority over Core. No provider may promote its own trust state. The canonical control plane remains responsible for admission, verification, mission state, and aggregation.

## LIVE gate

Mesh 006 becomes LIVE VERIFIED only when a controlled proof demonstrates all of the following:

1. One canonical mission contains at least four distinct child jobs.
2. At least two independently addressable execution domains are healthy at dispatch time.
3. Both Satellite A and Satellite B receive different children from the same mission without requiring a failure to force B.
4. Execution intervals overlap sufficiently to demonstrate actual concurrent work, not merely sequential routing.
5. Every successful child returns through the existing verification boundary and reaches ACCEPTED.
6. Attempt/provenance records identify the executor/provider used for every child.
7. Fan-in produces one deterministic canonical mission receipt referencing all accepted children.
8. Recomputing the aggregate hash from the canonical child receipt material matches the mission receipt.
9. No secret/private payload is emitted to either public execution domain.
10. The evidence is recorded in the canonical repository before the milestone is checkpointed in Registry/Archive.

Synthetic unit tests alone do not satisfy the LIVE gate.

## Implementation sequence

Phase 1: mission model, deterministic IDs, state and aggregate receipt.
Phase 2: bounded parallel dispatcher/collector with per-child journals.
Phase 3: distribution policy across admitted executors.
Phase 4: unit/integration tests for idempotency, partial failure and deterministic fan-in.
Phase 5: controlled A+B live proof.
Phase 6: immutable canonical evidence and Registry checkpoint.

## Exit condition

Mesh 006 is complete when ARCA can prove that one mission was decomposed, executed concurrently across multiple admitted execution domains, independently verified per child, and deterministically consolidated without expanding the trust boundary.
