# Durable Reasoning Pending V1

## Objective

Durable Reasoning Pending V1 converts restart-safe private reasoning from an exception/retry pattern into an explicit ARCA lifecycle.

Before this milestone, a durable opaque reasoning submission correctly returned control immediately by throwing a retryable `DurableOpaqueRpcPendingError`. That was safe for infrastructure, but it was not yet a product state.

V1 introduces:

```text
registered
  -> awaiting-reasoning
  -> result-ready
  -> completed
```

with a fail-closed `failed` state for non-pending execution errors.

The private instruction/context is not persisted by this state machine.

## Hash-only pending record

Format:

`arca-durable-reasoning-pending-v1`

Stored locally under:

`ARCA_HOME/reasoning-pending/<sha256(requestId)>.json`

The filename is a hash rather than the request ID so identifiers containing portable-path-unfriendly characters do not become path names.

The record contains only control/evidence metadata:

- requestId and payloadId;
- provider ID and provider descriptor hash;
- transport ID/profile hash;
- privacy classification hash/class;
- response format;
- exact standardized reasoning-request payload hash;
- Secure Reasoning Transport decision hash;
- Opaque Reasoning Transport attestation hash;
- decision timestamp;
- encrypted request packet/envelope hashes when submitted;
- continuation/result/final evidence hashes;
- pending state and ready notification sequence;
- record hash.

It does not persist:

- reasoning instruction;
- reasoning context;
- semantic model output;
- API credentials;
- encryption private keys;
- Creator session/passkey material.

## Start

`DurableReasoningPendingCoordinator.start(...)` performs the same policy checks required by Verified Reasoning over Durable Opaque RPC:

1. provider descriptor exists;
2. reasoning Capability Passport is currently `verified`;
3. provider/model/transport still match the verified passport;
4. purpose is explicitly confirmed;
5. provider identity is explicitly verified;
6. private processing is explicitly authorized;
7. exact standardized request passes Secure Reasoning Transport Gate.

Before the encrypted handoff, a hash-only local descriptor is registered.

If the encrypted request returns immediately as pending, the coordinator returns:

```json
{
  "state": "awaiting-reasoning",
  "requestId": "...",
  "payloadId": "..."
}
```

instead of surfacing a retry exception to the product layer.

## Crash windows and recovery

The pending descriptor is written before the remote call.

If the process dies:

- **before encrypted submission:** state can remain `registered`; the original product/source must retry the initial start because no remote work exists;
- **after encrypted submission but before local state update:** a later start with the same source request or a poll can discover the existing durable continuation/result by requestId;
- **while relays/endpoint are running:** Durable Opaque RPC state survives independently;
- **after terminal ciphertext exists:** `poll()` transitions the local record to `result-ready` without decrypting semantic output.

This deliberately avoids persisting private source text merely to close the first pre-submit crash window. A later source-specific encrypted local inbox may close that gap if needed.

## Ready wake

When terminal ciphertext becomes available, the pending store creates:

- `readySequence`;
- `readyPending=true`;
- terminal result hash.

`DurableReasoningPendingRuntime` can run continuously or via scheduler.

Its `runOnce()` scans `registered`, `awaiting-reasoning` and `result-ready` records.

An optional `onReady` callback receives:

- requestId;
- payloadId;
- providerId;
- readySequence;
- deterministic idempotency key;
- terminal result hash.

After a successful callback, the ready marker is acknowledged.

An optional async `shouldHandle(record)` filter allows a runtime to claim only its logical subset of pending reasoning records. Records rejected by the filter are counted as `ignored` and are neither polled nor ACKed. This is required when generic Creator chat and workflow-bound reasoning share one durable coordinator but have different continuation semantics.

Callback delivery is at-least-once across a crash between callback side effect and ACK; consumers must use the supplied idempotency key.

## Collect

`collect(requestId)` does not need the original private prompt.

It uses the hash-only pending descriptor plus the encrypted terminal result to:

1. verify the provider/capability/transport are still the same;
2. decrypt the response only at the origin;
3. validate `arca-reasoning-provider-result-v1`;
4. reconstruct `arca-reasoning-result-v1`;
5. reconstruct hash-only Durable Opaque reasoning execution evidence;
6. bind the result to the original payload hash, transport decision hash and attestation hash;
7. mark the pending record `completed`.

The semantic output is returned to the caller but is not written into the pending record.

A later collect can reconstruct the same result from terminal ciphertext without invoking the model again.

## Privacy and review

A completed result remains:

- `humanReviewRequired=true`;
- `coreMutationPerformed=false`;
- `privacyReclassificationRequired=true`.

The pending runtime does not publish, mutate Core or automatically continue an arbitrary workflow.

The next integration must hand the transient reasoning output to:

1. output privacy reclassification;
2. Human Review / policy;
3. only then an authorized workflow continuation.

## Product effect

Creator Console and Autonomy Workflow can now treat encrypted reasoning as ordinary asynchronous work rather than an error:

```text
submit
  -> "awaiting reasoning"
  -> app/process may close
  -> encrypted Mesh finishes later
  -> ready wake
  -> reconnect/scheduler
  -> collect
  -> reclassify
  -> Human Review
  -> continue
```

This is the missing lifecycle primitive for a direct ARCA experience that does not require a ChatGPT conversation to remain alive.
