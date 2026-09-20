# Event Recovery Authorization Policy v0.1

## Purpose

Make Event Fabric recovery decisions explicit per stable handler identity without adding retry authority.

The policy is deliberately narrower than a generic retry policy. v0.1 supports only:

- `first-claim` for a delivery with no prior claim;
- `reconcile-only` for ambiguous `claimed` or `failed` deliveries;
- `blocked` when recovery is not authorized;
- `complete` as an observation for an existing ACK.

There is no `retry`, `reclaim`, `failover` or timeout-based execution action in this version.

## Example

```js
createEventRecoveryPolicy({
  rules: {
    "agent:auditor": {
      unclaimed: "first-claim",
      claimed: "reconcile-only",
      failed: "reconcile-only"
    }
  }
})
```

Rules are keyed by the exact stable handler ID. There is no wildcard rule.

## Fail-closed behavior

A handler without an explicit rule is blocked for recovery. An ACK remains observable as complete even when no rule exists.

Unsupported actions such as `retry` are rejected at policy construction time.

## Controller integration

`createEventRecoveryController()` accepts an optional `recoveryPolicy`.

When provided:

- unclaimed work executes only if the exact handler rule returns `first-claim`;
- claimed/failed deliveries remain non-executable;
- `reconcile-only` is surfaced to callers as the allowed next recovery class, not as permission to invoke the handler;
- the existing exclusive Delivery Ledger claim is still required before any first execution.

Without a policy, the controller preserves the existing v0.1 first-claim-only behavior for compatibility.

## Security invariant

A timeout, thrown error or persisted `failed` state never becomes proof that a handler had no external effect. Policy can classify such state for reconciliation, but v0.1 cannot authorize re-execution.
