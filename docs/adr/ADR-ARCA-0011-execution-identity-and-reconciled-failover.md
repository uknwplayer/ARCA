# ADR-ARCA-0011 — Stable execution identity before reconciled failover

**Status:** Proposed for Execution Identity + Reconciled Failover v0.1  
**Date:** 2026-09-19

## Context

Cognitive Substitution v0.2 can safely substitute a participant before dispatch.

After dispatch begins, however, transport failure or timeout does not establish that the selected executor did not accept or execute the request.

ARCA already has Cross-Peer Request Ownership and signed Remote Request Evidence. Those components deliberately refuse automatic failover when the remote outcome is ambiguous.

A post-start continuation mechanism therefore needs an identity that survives participant replacement and a narrow proof that the previous attempt did not execute.

## Decision

ARCA introduces a stable `executionId` above executor-specific attempts.

Each attempt is append-only and binds the exact participant fingerprint, runtime binding, Role Conformance evidence and Cross-Peer ownership binding used for that attempt. Execution Identity also binds the exact Role Contract hash and request hash, so replacement cannot silently continue under changed role semantics or a different request.

A new attempt is not authorized merely because the previous call failed locally.

V0.1 authorizes failover only after trusted reconciliation proves a mutually exclusive signed remote rejection before acceptance, and only for the bounded rejection categories:

- capability;
- unavailable;
- not-accepted.

Accepted, completed, unseen and uncertain outcomes remain non-reroutable.

Policy, invalid-request and unknown rejection categories also remain non-reroutable.

## Signed authorization

A successful eligibility decision is captured in a dedicated signed failover receipt.

The receipt is not execution authority by itself. It authorizes only the preparation of a different participant attempt under the same execution identity.

The next attempt must still satisfy the existing capability, Role Conformance, runtime-binding and authorization boundaries.

## Dispatch boundary

V0.1 does not automatically dispatch the prepared replacement attempt.

This separates:

```text
proof that replacement is safe
from
authority to execute replacement
```

The separation is intentional for the first release.

## Consequences

### Positive

- one logical execution can be audited across multiple participants;
- a replacement decision can be explained and cryptographically proven;
- timeout remains fail-closed;
- existing ownership/reconciliation work is reused rather than duplicated;
- Cognitive Substitution remains responsible for who can perform the role.

### Cost

- failover remains unavailable for ambiguous accepted/unknown outcomes;
- clean remote rejection evidence must be available;
- a higher-level coordinator is still required to connect participant resolution to explicit dispatch.

## Non-goals

This ADR does not claim global exactly-once execution.

It does not authorize replay after timeout.

It does not permit side-effect duplication.

It does not change Creator source-code mutation authority.

It does not introduce open discovery or network trust expansion.


## Replacement coordinator

The Agent layer may consume the signed failover authorization through a coordinator that uses Cognitive Substitution preflight only.

The previous participant is explicitly excluded. Capability verification, current Role Conformance, runtime binding, availability and independent authorization are re-evaluated for the replacement.

The coordinator may reserve ownership and persist a planned replacement attempt, but does not dispatch it.

Request-hash or Role Contract drift fails before the current attempt is superseded.
