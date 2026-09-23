# ARCA — Vince V5 Endpoint Availability & Routing V0.1

Status: **OFFLINE FOUNDATION / NO LIVE DISPATCH**.

Data: **2026-09-23**.

## Goal

V5 separates three questions that must not be collapsed:

1. is the configured transport surface reachable?
2. is there recent evidence that the endpoint acknowledged a correlated wake?
3. is the endpoint eligible to be selected as a route **now**?

Registration, descriptor discovery and heartbeat do not answer all three.

## Availability states

V5 uses only:

- `AVAILABLE`
- `UNREACHABLE`
- `INCONCLUSIVE`

The semantics are deliberately conservative.

### AVAILABLE

The current V0.1 route gate requires a **recent, correlated ACK** observed through an endpoint adapter that explicitly implements `ack`.

The ACK has a bounded freshness window. After it expires, the endpoint is not silently kept available.

### UNREACHABLE

V0.1 emits `UNREACHABLE` only when the endpoint heartbeat itself explicitly returns `available:false`.

A thrown network/provider error is **not** enough to assert unreachability because the error may come from authentication, rate limiting, DNS, intermediary policy, configuration or another unknown cause.

### INCONCLUSIVE

Examples:

- heartbeat operation is unsupported;
- heartbeat surface is reachable but external execution is not proven;
- heartbeat throws an error;
- ACK operation is unsupported;
- no correlated ACK is found;
- ACK timestamp is invalid, stale or implausibly in the future;
- no fresh route-eligible observation exists.

Missing evidence never becomes evidence of non-execution.

## Work endpoint interpretation

The existing ChatGPT Work adapter returns a heartbeat when the configured GitHub PR trigger surface is valid.

That heartbeat proves:

`GitHub trigger surface reachable`

It does **not** prove:

`ChatGPT Work executor currently available`

Therefore a Work heartbeat remains `INCONCLUSIVE / SURFACE_REACHABLE_EXECUTION_UNPROVEN`.

A recent correlated `WORK-WAKEUP-ACK` can temporarily promote the route to `AVAILABLE` for the configured freshness window.

V5 does not generate a wake merely to test availability. It observes an ACK for an already known wake.

## Route selection

`selectVinceV5Route()`:

- discovers endpoints through the existing `ExecutionEndpointRegistry`;
- filters by requested capability;
- considers only unexpired `AVAILABLE` observations;
- requires `routeEligible:true` and a correlated wake ACK;
- chooses the freshest eligible observation, then endpoint id for deterministic tie-breaking;
- performs **no dispatch**;
- grants no authority.

A result with no eligible endpoint is `INCONCLUSIVE`, not a fabricated route.

## Authority boundary

Every V5 observation and route selection explicitly records:

- `trustGranted:false`
- `codeMutation:false`
- `canonicalWrite:false`
- `executionAuthority:false`

V5 availability evidence is routing evidence, not trust evidence.

## Current implementation boundary

V0.1 is offline/test-only foundation.

It does not:

- activate Edge Steward;
- create a daemon;
- perform a live Work wake;
- execute Termux;
- change retry/failover policy;
- grant shell capability;
- mutate main;
- access Portal/PNCP.

## Next gate

After CI acceptance, V5 should run one controlled observation against an already configured endpoint surface without dispatching new work.

For ChatGPT Work, the safe order is:

1. heartbeat the configured PR trigger surface;
2. classify that heartbeat as surface-only evidence;
3. query a previously correlated ACK when one exists;
4. verify freshness and route eligibility;
5. record the result without dispatch.

If no canonical recent ACK exists, the correct result is `INCONCLUSIVE`.
