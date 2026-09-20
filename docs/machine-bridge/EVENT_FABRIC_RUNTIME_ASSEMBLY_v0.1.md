# Event Fabric Runtime Assembly v0.1

## Status

Experimental Machine Bridge runtime composition. This document does not grant new execution authority.

## Purpose

Event Fabric previously exposed its durable event store, delivery ledger, dispatch policy projection and recovery view as independent components. That separation remains useful, but production-style callers had to wire them manually and could accidentally omit one of the durability boundaries.

`createEventFabricRuntime()` provides one narrow assembly for the existing primitives:

```
Agent Dispatch Policy
        |
        v
Policy-projected stable handlers
        |
        v
Event Fabric
   |         |
   v         v
Durable   Delivery
Store     Ledger
              |
              v
        Recovery View
```

## Invariants

The assembly preserves the current Event Fabric rules:

- event types remain allowlisted by `ARCA_EVENT_TYPES`;
- events are persisted before handler dispatch;
- projected agent handlers use stable `agent:<agentId>` identities;
- delivery is claimed before execution and ACKed only after successful completion;
- a persisted `claimed` or `failed` delivery is not implicitly retried;
- process recreation over the same runtime root treats the same event as durable duplicate;
- uncertain delivery state is observed through `recover()`, not converted into automatic redispatch;
- no scheduler, network target, shell authority, merge authority or natural-language-to-execution path is added.

## API

`createEventFabricRuntime({root, policy, agents, eventTypes, clock, maxPayloadBytes, fsImpl})`

Returns a frozen runtime exposing:

- `publish(event)` — publish through the durable Event Fabric;
- `events()` — process-local accepted-event journal;
- `handlerIds(type)` — stable projected handler IDs configured for an event type;
- `recover(eventId, type)` — inspect durable delivery state for those handlers.

A recovery request for an event type not configured in the runtime fails closed.

## Recovery semantics

Re-publishing an already persisted event after process recreation returns `duplicate`. This is intentional: durable persistence is not proof that every handler completed, and replaying handlers would turn an ambiguous outcome into possible duplicate execution.

The caller must inspect `recover(eventId, type)`:

- `completed` → no action;
- `uncertain` → human or explicit policy review;
- `failed-uncertain` → human or idempotency-aware policy review;
- `unclaimed` → eligible for a first claim only when a future explicit recovery controller authorizes it.

v0.1 is observational. It does not implement retry authorization.

## Next boundary

A future recovery controller may decide whether an `unclaimed` or failed delivery is safe to resume, but that controller must require explicit idempotency/authority policy. It must not infer that timeout, crash, missing result or handler failure proves non-execution.
