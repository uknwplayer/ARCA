# Event Fabric First-Claim Recovery Controller v0.1

## Purpose

Recover the narrow crash window in which an event was durably persisted but a configured handler never obtained a Delivery Ledger claim.

This controller does not retry ambiguous work. It only performs a first delivery when there is no prior delivery record for that exact `eventId + handlerId`.

## Ordering

For a specific persisted event:

```
read durable event
  -> inspect delivery state
  -> no prior state?
      -> acquire exclusive claim
      -> handler
      -> ACK or failed
  -> prior ACK?
      -> already complete
  -> prior claimed/failed/unknown?
      -> uncertain; do not execute
```

The exclusive claim semantics from Event Delivery Ledger are a prerequisite. If another process wins the claim race, this controller receives `acquired: false` and does not run the handler.

## Safety invariants

- only events already present in the durable Event Store can be recovered;
- the controller does not scan or invent event IDs;
- no handler runs when a delivery record already exists in `claimed` or `failed`;
- a failed recovered handler becomes `failed` and is not retried by a later recovery call;
- ACKed deliveries are observed as complete;
- concurrent first-claim recovery is bounded by the Delivery Ledger's exclusive ownership rule;
- no lease, timeout-based reclaim, automatic retry, scheduler, network authority, shell authority or merge authority is introduced.

## Why first-claim recovery is different from retry

The durable ordering is `claim -> handler`. Therefore absence of a delivery record means this handler did not pass the claim boundary.

By contrast, `claimed` and `failed` cannot prove that the handler had no external effect. Those states remain uncertain and require a future explicit idempotency/recovery policy.

## API

`createEventRecoveryController({store, deliveryLedger, handlers})`

The returned controller exposes `recover(eventId)`.

The stored event itself selects the event type and therefore the configured handler set. Missing or malformed persisted events fail closed.
