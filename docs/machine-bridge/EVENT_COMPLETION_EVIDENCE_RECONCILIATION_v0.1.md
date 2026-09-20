# Event Completion Evidence Reconciliation v0.1

## Purpose

Resolve an ambiguous Event Fabric delivery without replaying the handler when an explicitly trusted completion source can prove that the original operation completed.

This is reconciliation, not retry.

## Components

### Completion Evidence Ledger

`createEventCompletionEvidenceLedger()` stores one create-only completion observation for each exact `eventId + handlerId`.

The durable record contains only:

- `eventId`;
- `handlerId`;
- `resultHash`;
- `evidenceHash`;
- `sourceId`;
- observation time;
- tamper-evident `recordHash`.

It does not store semantic result payloads.

Conflicting completion evidence for the same delivery fails closed.

### Reconciliation Controller

`createEventReconciliationController()` requires:

- the durable Event Store;
- the Delivery Ledger;
- the Completion Evidence Ledger;
- an Event Recovery Authorization Policy;
- a host-controlled `completionSource.lookupVerified()`.

The controller only queries the completion source when an existing delivery is explicitly classified `reconcile-only`.

A source result must correlate exactly to the requested `eventId` and `handlerId` and provide bounded hashes plus a source identity.

## State model

```
claimed / failed
      |
      | recovery policy = reconcile-only
      v
lookupVerified()
  |          |
 none      verified completion
  |          |
  v          v
uncertain   create-only evidence record
             |
             v
       completed-evidenced
```

The original Delivery Ledger state is not rewritten. A `failed` delivery remains `failed`; a `claimed` delivery remains `claimed`. The evidence ledger overlays a verified completion observation.

This preserves the distinction between local execution bookkeeping and later completion evidence.

## Recovery View

When completion evidence exists for a previously claimed/failed delivery, the Recovery View reports:

`completed-evidenced -> action: none`

Evidence without any corresponding Delivery Ledger record is a conflict and fails closed.

## Security invariants

- no handler is invoked by reconciliation;
- no retry, reclaim or failover is introduced;
- unclaimed work is never reconciled as though it had executed;
- completion evidence must be exact-correlated and hash-bounded;
- semantic output is not persisted by this layer;
- conflicting evidence cannot replace the first durable observation;
- a completion source is an explicit host trust boundary and must return only already-verified evidence.

The next boundary is provider-specific evidence adapters that can satisfy `lookupVerified()` from cryptographically signed or otherwise independently verifiable completion receipts.
