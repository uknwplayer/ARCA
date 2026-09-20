# Event Remote Completion Source v0.1

## Purpose

Bridge signed Mesh Remote Request Evidence into Event Fabric completion reconciliation without copying semantic results and without retrying the handler.

This adapter composes two existing Machine Bridge safety boundaries:

`Event Fabric ambiguous delivery -> Recovery Policy reconcile-only -> signed Remote Request Evidence -> Completion Evidence Ledger`

## Durable remote binding

Before a remote handler dispatch is considered recoverable, the origin records a create-only binding between:

- Event Fabric `eventId`;
- stable `handlerId`;
- Mesh `nodeId`;
- remote `requestId`;
- remote `jobId`;
- `payloadHash`;
- `ownerBindingHash`.

The binding is tamper-evident and conflict detecting. It does not contain credentials, semantic result content or private keys.

The adapter never guesses a remote request from an event. No binding means no remote completion lookup.

## Verified completion lookup

`createEventRemoteCompletionSource()` implements the `lookupVerified()` interface required by Event Completion Evidence Reconciliation.

It:

1. loads the exact durable event/handler remote binding;
2. selects only the explicitly configured evidence source for the bound node;
3. calls `readRemoteRequestEvidence()`, which verifies the signed decision/completion chain against Mesh trust;
4. verifies the completion again against the exact bound requestId/jobId/payloadHash/ownerBindingHash;
5. returns only:
   - Event `eventId`;
   - `handlerId`;
   - remote `resultHash`;
   - signed completion `statementHash` as `evidenceHash`;
   - bounded source identity `mesh:<nodeId>`.

The semantic result is never returned or persisted by this adapter.

## Non-completion states

Remote `unseen`, `accepted` and `rejected` states do not become completion evidence. Reconciliation remains unresolved and no redispatch occurs.

## Security invariants

- no automatic peer discovery;
- no trust-on-first-use;
- no event-to-request guessing;
- no handler invocation;
- no failover;
- no retry/reclaim;
- exact cryptographic correlation to the bound remote request fingerprint;
- signed completion evidence is hash-only at the Event Fabric layer.

The next integration step is to create the event-to-remote binding automatically at the same trusted boundary that starts an actual Event Fabric remote handler dispatch, before that dispatch crosses the Mesh transport.
