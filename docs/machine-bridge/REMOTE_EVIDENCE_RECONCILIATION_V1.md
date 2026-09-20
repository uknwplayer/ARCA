# Remote Evidence Reconciliation Controller V1

## Purpose

Remote Evidence Processor V1 produces signed remote lifecycle evidence.

The origin still needs a safe way to observe that evidence after timeouts, restarts or delayed completion.

Remote Evidence Reconciliation Controller V1 closes that observation loop without introducing any execution path.

The controller is deliberately **observational-only**.

It cannot dispatch, re-dispatch, select a new peer or authorize failover.

## Inputs

The controller receives:

- local `CrossPeerRequestOwnershipStore`;
- local Mesh trust store;
- explicit remote evidence sources, each bound to one nodeId;
- clock / bounded clock skew.

A remote evidence source exposes only:

```text
storage.read(...)
```

No `forward()` capability is required or accepted.

## Explicit source set

Remote sources are supplied explicitly:

```text
nodeId -> evidence storage
```

Duplicate node IDs fail construction.

For each request the controller:

1. reads local ownership;
2. takes the existing `selectedNodeId`;
3. looks up exactly that configured source;
4. never scans another peer;
5. fails closed if the selected owner has no configured source.

This preserves:

```text
ownership != discovery
reconciliation != routing
```

## Private runtime fields

The following are private class fields:

- ownership store;
- trust store;
- remote storage sources;
- clock;
- clock-skew configuration.

The public snapshot contains only:

- configured node IDs;
- source count;
- `observationalOnly=true`;
- `canDispatch=false`;
- `automaticFailoverAllowed=false`.

Storage objects, credentials and transport internals are not exposed.

## Reconciliation states

### unbound

If no local owner exists, the controller does not read any remote source.

It reports the request as unbound but still does not authorize automatic failover itself.

### reserved + unseen

No local dispatch occurred and no remote evidence exists.

State remains reserved.

### reserved + remote evidence

This is a protocol/state contradiction in V1.

Because the current relay ordering writes dispatch evidence before network forward, remote accepted/rejected/completed evidence should not exist while local ownership remains only reserved.

V1 fails with:

```text
ARCA_REMOTE_EVIDENCE_LOCAL_DISPATCH_MISSING
```

It does not repair history automatically.

### in-flight / uncertain + unseen

Local state is preserved.

Missing remote evidence is still not proof of non-execution.

### in-flight + accepted

The signed acceptance is verified against the exact local ownership fingerprint.

Local dispatch state is not rewritten.

Public reconciliation state is `accepted`.

### uncertain + accepted

Public reconciliation state becomes:

```text
accepted-uncertain
```

This is stronger evidence than a bare timeout, but still not a terminal execution result.

No re-dispatch occurs.

### rejected

Signed rejection is verified against:

- selected owner;
- requestId;
- jobId;
- payloadHash;
- ownerBindingHash;
- current trusted Mesh identity.

The local dispatch/uncertain record remains unchanged.

The reconciliation result reports rejection, but:

```text
automaticFailoverAllowed = false
```

If local ownership is already completed, remote rejection is a contradiction and fails with:

```text
ARCA_REMOTE_EVIDENCE_STATE_CONFLICT
```

### completed

Signed completion is verified through the Remote Request Evidence reader/observer.

The resultHash is reconciled into local ownership using the existing create-only completion record.

If the local completion already has another resultHash, reconciliation fails with the existing:

```text
ARCA_CROSS_PEER_RESULT_CONFLICT
```

No semantic result body is copied into the ownership ledger.

## Source mismatch

If the selected owner has no explicitly configured remote evidence source:

```text
ARCA_REMOTE_EVIDENCE_SOURCE_MISSING
```

The controller does not try another peer.

## Trust behavior

The controller delegates evidence verification to the existing signed Remote Request Evidence primitives.

Therefore evidence must still satisfy:

- Ed25519 signature;
- current local trust store;
- expected nodeId;
- request/job correlation;
- payload hash;
- ownership binding;
- accepted -> completed statement binding;
- validity window.

A trust failure is never downgraded to an availability failure.

## No replay path

The controller has no executor, relay or peer forward function.

Every public reconciliation result includes:

```text
reDispatchPerformed = false
automaticFailoverAllowed = false
```

The only durable mutation V1 may perform is:

```text
verified remote completed
-> local ownership markCompleted(resultHash)
```

## runOnce

`runOnce({requestIds})` reconciles an explicit bounded batch.

Properties:

- caller must provide request IDs;
- IDs are deduplicated;
- maximum 100 unique IDs per call;
- no directory/catalog-wide request discovery;
- each error is reduced to an errorCode;
- raw exception text is not included in batch results.

This makes the controller scheduler-friendly without turning it into an autonomous request scanner.

## Security invariants

V1 preserves:

```text
remote evidence != authorization
reconciliation != routing
reconciliation != execution
accepted != completed
timeout != proof of non-execution
missing evidence != proof of non-execution
rejected != automatic failover authorization
completed proof may close local ownership only by resultHash
```

## Tests

V1 tests cover:

- sanitized public snapshot;
- unbound request performs zero remote reads;
- exact selected-owner source only;
- accepted evidence verification without local-state rewrite;
- accepted + uncertain derived state;
- completed evidence reconciles local ownership;
- rejection remains non-authorizing;
- missing explicit owner source fails closed;
- wrong ownerBindingHash is rejected;
- remote evidence before local dispatch marker is rejected;
- remote rejection vs local completion conflict;
- remote completion resultHash conflict;
- unseen evidence preserves uncertainty;
- bounded explicit batch / deduplication / sanitized errors;
- duplicate source node rejection.

## Non-goals

V1 does not add:

- request discovery;
- peer discovery;
- automatic polling over all ownership records;
- dispatch/re-dispatch;
- peer selection;
- failover authorization;
- trust enrollment/rotation;
- semantic result retrieval;
- distributed exactly-once guarantees.

## Next milestone

The strongest next milestone remains the **live two-operator federation proof**.

If a genuinely independent second repository/host is still unavailable, the next internal work should focus on deployment packaging or alternate rendezvous rather than weakening the fail-closed execution rules.
