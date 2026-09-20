# Federation Runtime Refresh Controller V1

## Purpose

Federation Runtime Assembly V1 builds one safe runtime generation from an explicit trusted peer set.

Federation Runtime Refresh Controller V1 keeps that same peer set usable over time without introducing discovery or automatic trust expansion.

The controller solves two operational problems:

1. a peer that was unavailable during assembly can later recover and be reintroduced through a new generation;
2. a runtime generation must stop being usable if the durable trust catalog changes underneath it.

## Core rule

Refresh is allowed to change **availability**, not **authority**.

The configured peer set is cloned at controller construction and does not grow later.

A new catalog peer is never discovered into the controller automatically.

## Runtime generations

Each successful refresh creates a new runtime generation.

A generation contains:

- the assembled Federation Runtime;
- catalog pins for every configured peer;
- a monotonically increasing generation number;
- refresh timestamps.

A catalog pin contains only:

- peerId;
- nodeId;
- catalog revision;
- catalog recordHash.

Credential references and secrets are excluded from the public controller snapshot.

## Refresh algorithm

For every refresh:

1. read and pin every explicitly configured catalog peer;
2. require each peer to exist and remain active;
3. call Federation Runtime Assembly V1 using the immutable configured peer set;
4. read the same catalog records again;
5. require all pins to be unchanged;
6. publish the new generation only after all checks pass.

If any step fails, the controller invalidates the current generation.

It does not keep a last-known-good runtime after a failed refresh.

## Why failed refresh invalidates the previous generation

Keeping an older runtime after a trust-related refresh failure could allow routing through:

- a disabled peer;
- a rotated identity;
- a changed transport binding;
- an invalid/tampered catalog record.

The V1 safety rule is therefore:

```text
refresh failure -> no active generation
```

Recovery requires another successful refresh.

## Forward guard

Before every `forward(...)` or `advertise()`:

1. the controller requires an active runtime generation;
2. every configured peer's current catalog record is read;
3. each record must still be active;
4. revision + recordHash + nodeId must match the generation pin;
5. any read/integrity error invalidates the generation;
6. only then may the current runtime forward.

This closes the window between periodic refresh cycles.

A catalog disable or identity rotation therefore prevents use of the stale generation before its next scheduled refresh.

## Health behavior

Health is not pinned.

The current Runtime Assembly / Peer Selector reads health dynamically during routing.

This means:

- a resolved peer can enter cooldown without requiring a rebuild;
- selection can avoid that peer immediately;
- a peer that was not resolved during assembly cannot appear in the relay until a successful refresh creates a new generation.

## Recovery of unavailable peers

A peer absent from one generation because it was:

- stale;
- unavailable;
- cooling down;

can return only through a later refresh of the same explicit configured peer set.

The controller never substitutes or discovers an unknown peer.

## Scheduling

V1 supports:

- `refreshOnce()` for scheduler/manual use;
- `start()` for bounded periodic refresh;
- `stop()` for orderly shutdown.

Default refresh interval:

60 seconds.

Allowed range:

1 second to 1 hour.

Refresh operations are serialized. Overlapping timer/manual calls cannot build concurrent generations.

## Failure state

The public snapshot exposes a sanitized state:

- `uninitialized`;
- `ready`;
- `invalid`.

It also exposes:

- generation;
- running flag;
- refresh interval;
- last refresh attempt/success timestamps;
- sanitized last error code;
- configured peer IDs;
- current catalog pins;
- nested Federation Runtime public snapshot.

Raw exception messages, credential references and secrets are not included.

## Important error codes

### ARCA_FEDERATION_RUNTIME_UNAVAILABLE

No successful generation exists yet.

### ARCA_FEDERATION_RUNTIME_STALE

The catalog changed, was disabled, became unreadable or failed integrity validation after the generation was created.

### ARCA_FEDERATION_RUNTIME_TRUST_INVALID

A refresh failed because the trust/identity boundary became invalid.

### ARCA_FEDERATION_RUNTIME_REFRESH_FAILED

A refresh failed for a reason that does not map to a narrower safe public code.

## Configuration immutability

The controller clones its explicit `peerConfigs` during construction.

Mutating the caller's original array later cannot add peers to the controller.

Resolver/peer option objects are defensively copied/frozen for the controller generation policy.

Stateful security objects such as catalog, health store and trust store remain shared intentionally.

## Security properties

Runtime Refresh V1 cannot:

- enroll a peer;
- add a peer discovered later in the catalog;
- enable a disabled peer;
- rotate an identity;
- modify repository/ref/root;
- change credential references after construction;
- convert health into trust;
- bypass catalog pins;
- keep routing through a stale generation after detected catalog change;
- keep last-known-good routing after refresh failure;
- add automatic post-forward failover;
- authorize execution.

## Tests

V1 tests cover:

- initial successful generation;
- no credentialRef exposure in snapshots;
- catalog disable invalidating before forward;
- identity/catalog rotation invalidating before advertise;
- catalog read/integrity failure invalidating before forward;
- failed refresh discarding the previous generation;
- catalog mutation during generation build;
- serialized overlapping refresh calls;
- unavailable peer recovery through a later generation;
- no discovery of newly-added catalog peers;
- immunity to caller mutation of the original peer config array;
- start/stop lifecycle;
- forward-before-refresh fail-closed behavior.

## Current limits

V1 refreshes the whole explicit peer set as one generation.

It does not yet provide:

- per-peer hot-swap without generation rebuild;
- distributed controller leader election;
- persisted controller generation state;
- independent-host live federation proof;
- cross-peer exactly-once failover.

Those remain separate problems.

## Next milestone

After Refresh V1 is merged and green, the architectural priority returns to the live federation proof between two independently controlled repositories/hosts.

If no second real host/repository is available, the next safe work item is cross-peer request ownership / idempotency evidence, not open discovery.
