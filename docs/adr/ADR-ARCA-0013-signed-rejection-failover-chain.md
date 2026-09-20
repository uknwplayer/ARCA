# ADR-ARCA-0013 — Automatic failover chains require signed non-execution evidence

**Status:** Proposed for Reconciled Failover Chain v0.3  
**Date:** 2026-09-19

## Context

ARCA can now:

- identify one logical execution across multiple attempts;
- reconcile signed remote evidence;
- prove when one replacement is safe;
- select a conformant replacement;
- dispatch that replacement exactly once locally.

The next question is whether ARCA may repeat this process automatically when multiple candidate participants reject the same execution.

A generic retry loop would be unsafe because a timeout or lost response does not establish non-execution.

## Decision

ARCA may automatically advance from one participant to another only when the existing Reconciled Failover gate verifies a trusted signed pre-execution rejection in an explicitly reroutable category.

The chain does not create a second path around Reconciled Failover. It invokes the same gate on every transition.

Allowed automatic transition proof:

```text
trusted signed remote rejection
+ exact request/job/payload/ownership correlation
+ category in {capability, unavailable, not-accepted}
+ current execution/role/request binding
```

Everything else stops or waits.

## Historical exclusion

Every participant already used by an execution is excluded from later automatic selection.

This is stricter than the minimum failover rule that merely requires the next participant to differ from the immediately previous one.

The stricter chain rule prevents automatic oscillation and makes the attempt history monotonic with respect to participant identities.

## Bounds

Automatic chaining is finite.

The controller enforces:

- a maximum total attempt count;
- a maximum orchestration-cycle count per run.

Bounds are safety controls and cannot be widened implicitly by provider behavior.

## Recovery

The controller is restart-oriented.

It reconstructs progress from existing durable records and never treats process restart as permission to repeat a network dispatch.

If no unused eligible participant exists after a valid rejection, the execution waits for a participant rather than reusing a rejected one.

## Consequences

### Positive

- A -> B -> C continuation becomes possible without generic post-start retry;
- every transition remains cryptographically attributable;
- accepted or ambiguous execution remains fail-closed;
- participant oscillation is prevented;
- long chains remain bounded.

### Cost

- capacity can be exhausted even when an old participant later becomes healthy;
- a human or later policy revision is required to deliberately reuse a prior participant;
- automatic progress depends on remote nodes producing verifiable rejection evidence.

## Non-goals

This ADR does not authorize:

- retry after acceptance;
- replay after timeout alone;
- state transfer between partially completed agents;
- hidden participant reuse;
- open network discovery;
- trust expansion;
- Creator code-mutation authority.
