# ADR-ARCA-0012 — Dispatch replacement only behind durable side-effect evidence

**Status:** Proposed for Controlled Replacement Dispatch v0.2  
**Date:** 2026-09-19

## Context

Execution Identity + Reconciled Failover v0.1 can prove that replacing an earlier participant is safe and can prepare a new participant attempt.

The remaining risk is the dispatch boundary itself.

If ARCA performs a network call and then loses the response, retrying that call may duplicate execution. A replacement dispatcher therefore cannot use ordinary retry semantics.

## Decision

A replacement dispatch requires three distinct durable boundaries:

1. **replacement preparation** — proves which exact participant/runtime/conformance tuple was selected;
2. **dispatch authorization gate** — proves that the same tuple still passes live preflight and independent authorization immediately before dispatch;
3. **Cross-Peer dispatch-started evidence** — proves that the network side effect was allowed to begin.

Only the process that creates the dispatch-started evidence may call the network executor.

If dispatch-started evidence already exists, no later invocation may make another network call for the same owner binding.

## Exact participant rule

Dispatch-time preflight is constrained to the participant that was prepared.

If that participant is no longer capable, conformant, bound, available or authorized, dispatch fails closed.

The dispatcher does not select a new participant. Selection remains the responsibility of the reconciled substitution preparation stage.

## Failure semantics

After dispatch starts:

- successful correlated completion closes both ownership and execution ledgers;
- transport/protocol ambiguity becomes `uncertain`;
- uncertain state never triggers automatic replay;
- a previously durable Cross-Peer completion may repair a missing local completion record without redispatch.

## Consequences

### Positive

- local concurrent dispatch is reduced to a single network call per owner binding;
- runtime/conformance drift is detected before the side effect;
- authorization is re-evaluated at dispatch time;
- restart recovery does not reinterpret an existing dispatch as permission to retry.

### Cost

- ambiguous post-start outcomes remain blocked until reconciliation;
- dynamic authorization changes between gate creation and retry may require manual resolution;
- this is not a proof of global exactly-once behavior in external systems.

## Deferred

Automatic A -> B -> C chaining is deferred to a later step and must remain restricted to newly reconciled signed pre-execution rejection evidence.

State Transfer / Resume is a separate future milestone.
