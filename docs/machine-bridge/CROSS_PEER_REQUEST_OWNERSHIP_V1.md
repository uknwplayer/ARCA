# Cross-Peer Request Ownership / Idempotency Evidence V1

## Purpose

Federation Health and Peer Selection can choose a trusted operational peer.

That is not enough to make post-failure failover safe.

Once a remote forward begins, a timeout does **not** prove that the remote side failed to enqueue, claim, execute, or persist the request.

Cross-Peer Request Ownership / Idempotency Evidence V1 adds a durable local evidence layer that answers:

- which peer was selected as owner for a request;
- whether network dispatch was allowed to begin;
- whether the outcome is still unknown;
- whether completion was later observed;
- whether selecting a different peer would violate the current ownership evidence.

V1 intentionally does **not** enable automatic failover.

## Core invariant

```text
timeout != proof of non-execution
absence of result != proof of non-execution
```

Therefore:

```text
dispatch started + no completion evidence
-> uncertain
-> cross-peer failover blocked
```

## Durable evidence layout

For every `requestId`, the store writes create-only evidence under:

```text
<ownership-root>/<requestId>/
  binding.json
  dispatch.json
  uncertain.json
  completion.json
```

Files are create-only.

No event rewrites a prior evidence file.

### binding.json

Binds the request fingerprint to exactly one selected node:

- requestId;
- jobId;
- payloadHash;
- relayNodeId;
- selectedNodeId;
- createdAt;
- SHA-256 recordHash.

The first binding wins.

A later attempt with:

- a different job/payload/relay -> request conflict;
- a different selected node -> ownership conflict.

### dispatch.json

Written **before** the relay calls the selected peer.

It proves that the guarded execution path crossed the dispatch boundary.

Only one dispatch marker may be created for V1.

A second guarded dispatch for the same request is rejected before another downstream network call is made.

### uncertain.json

Written when the downstream call throws after dispatch started.

Only a sanitized failure category is retained:

- timeout;
- transport;
- remote;
- protocol;
- unknown.

Raw error messages are not persisted.

### completion.json

Written when a correlated result is observed.

It stores only:

- request/job correlation;
- binding hash;
- selected node;
- resultHash;
- observedAt.

The semantic result is not copied into the ownership ledger.

Completion can be recorded after uncertainty if a durable result appears later.

## Derived states

### unbound

No owner exists.

A peer may be selected.

### reserved

An owner is bound, but no dispatch marker exists.

The selected owner may proceed to the dispatch boundary.

V1 does not rebind this reservation to a different peer automatically.

### in-flight

Dispatch marker exists and no terminal evidence exists.

Cross-peer failover is blocked.

### uncertain

Dispatch started and a failure was observed, but completion is unknown.

Cross-peer failover is blocked.

### completed

Completion evidence exists.

No further dispatch is allowed by the guard.

## Relay integration

`MachineBridgeMeshRelay` accepts an optional `requestOwnership` guard.

When absent, historical behavior is unchanged.

When present, the relay:

1. performs normal route/capability/loop filtering;
2. selects one compatible peer;
3. appends its route receipt;
4. reserves the request to that selected node;
5. writes dispatch-started evidence;
6. calls the peer exactly once;
7. records completion evidence on correlated success;
8. records uncertainty on thrown failure.

A second relay call cannot silently drift to another peer for the same request.

## Federation Runtime integration

`assembleFederationRuntime(...)` can receive the same optional `requestOwnership` guard.

The public Federation Runtime snapshot exposes only:

```text
requestOwnershipEnabled: true|false
```

No ownership root path, credential reference, semantic result, or error message is added to the public snapshot.

## Late-result reconciliation

The ownership store exposes `reconcileCompletion(requestId, { lookupResult })`.

This operation is observational only.

It may:

- look up an already durable result;
- verify request/job correlation;
- record its resultHash;
- move `in-flight` or `uncertain` to `completed`.

It does **not**:

- redispatch;
- choose a new peer;
- enqueue work;
- infer non-execution from a missing result.

If lookup returns no result, the request remains `in-flight` or `uncertain`.

## Idempotency boundary

V1 provides a local durable ownership lock around the guarded relay path.

It prevents:

- two concurrent guarded downstream forwards for one request;
- selector drift to another peer after the first ownership binding;
- automatic retry after an uncertain outcome.

It does not claim distributed exactly-once execution across arbitrary independent hosts.

A remote system could still execute work and fail before publishing observable completion evidence.

That unresolved crash window is exactly why V1 blocks cross-peer failover after dispatch begins.

## Recovery semantics

### Crash before binding

No evidence exists.

Normal selection may happen.

### Crash after binding but before dispatch marker

State is `reserved`.

No network dispatch is proven by the guarded path.

V1 keeps the same selected owner rather than automatically rebinding.

### Crash after dispatch marker

State is `in-flight`.

Do not select another peer.

### Timeout / transport failure after dispatch marker

State becomes `uncertain`.

Do not select another peer.

### Result appears later

Use observational reconciliation.

State becomes `completed` without replay.

## Security properties

V1 does not:

- create trust;
- alter peer enrollment;
- alter health state;
- choose capabilities;
- authorize execution;
- expose credentials;
- store semantic request/result content;
- store raw error messages;
- discover peers;
- perform automatic failover;
- treat timeout as non-execution;
- treat missing result as non-execution.

## Tests

V1 tests cover:

- create-once ownership binding;
- fingerprint conflict;
- different-peer ownership conflict;
- second dispatch rejected before network;
- timeout -> uncertain;
- no-result reconciliation remains uncertain;
- late-result reconciliation -> completed;
- resultHash conflict;
- tamper detection;
- selector drift blocked after first timeout;
- concurrent duplicate relay calls causing exactly one downstream call;
- completion correlation mismatch -> uncertain;
- bounded sanitized failure categories.

## Current limit and next step

This ledger answers:

```text
what do we know locally about ownership and outcome?
```

It does not yet provide cryptographic remote proof that a peer definitively **did not** accept a request.

Safe cross-peer failover requires stronger evidence, for example a protocol where the remote ownership domain can produce verifiable acceptance/rejection/completion statements or where all peers participate in one atomic request-ownership authority.

Until such evidence exists:

```text
uncertain -> no automatic cross-peer failover
```
