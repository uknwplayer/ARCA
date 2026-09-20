# Federation Peer Health / Backoff V1

## Purpose

Federation V1 establishes explicit trust between operators. Federation Peer Catalog V1 persists that trust decision.

Peer Health / Backoff V1 adds a separate operational layer that answers a different question:

> Is this already-trusted peer currently worth attempting?

Health state never creates, rotates, disables or expands trust.

## Separation of authority

Trust and health are separate stores.

Trust record:

- peerId;
- nodeId;
- repository/ref/root;
- Ed25519 identity/fingerprint;
- active/disabled status.

Health record:

- binding hash;
- success/failure counters;
- last attempt/success/failure timestamps;
- bounded cooldown;
- sanitized failure category.

A peer may be trusted but temporarily unavailable.

A peer may also be cryptographically rejected. That is **not** a health condition and must not be softened into retry/backoff semantics.

## Binding

Health is bound to:

- nodeId;
- repository;
- ref;
- mailbox root;
- Ed25519 identityId;
- key fingerprint.

The SHA-256 binding hash changes when the public identity or transport domain changes.

Old failures therefore do not poison a newly rotated identity.

## States

Health is derived from the durable counters/timestamps.

### unknown

No successful or failed attempt exists for the current binding.

Attempt allowed.

### healthy

The current binding has a successful attempt and zero consecutive failures.

Attempt allowed.

### degraded

One or more consecutive failures exist, but no active cooldown blocks a probe.

Attempt allowed.

If a previous cooldown expired, the next attempt is a probe.

### cooldown

The failure threshold has been reached and the bounded retry interval has not expired.

Attempt blocked locally before remote repository access.

## Default backoff

Default policy:

- cooldown begins after 2 consecutive failures;
- base cooldown: 5 seconds;
- exponential growth by consecutive failure count;
- maximum cooldown: 5 minutes;
- counter is bounded.

The policy can be configured by the local operator, within hard safety bounds.

A success resets consecutive failures and clears cooldown.

Historical total successes/failures remain available for operational diagnosis.

## Failure categories

Only fixed sanitized categories are persisted:

- timeout;
- unavailable;
- transport;
- remote;
- protocol;
- unknown.

Raw exception text is not persisted in the health record.

## Trust-sensitive failures

Federation resolution now distinguishes an actually absent/stale peer from an exact node advertisement that exists but is rejected.

The following remain trust/protocol errors and do not automatically create health backoff:

- untrusted signer;
- key/fingerprint mismatch;
- rejected/invalid signed advertisement;
- transport binding mismatch;
- catalog identity mismatch.

An absent or stale trusted node may be recorded as unavailable.

A present signed advertisement whose signer is not locally trusted is surfaced explicitly as an untrusted identity error; it is not rewritten as ordinary unavailability.

GitHub 429/5xx or network/fetch errors may be recorded as transport failures.

## Forward wrapper

A successfully resolved, trusted peer can be wrapped by the health store.

Before each forward:

1. cooldown is checked locally;
2. active cooldown blocks the attempt;
3. successful forward records success;
4. operational failure records a sanitized failure category;
5. the original error is rethrown.

The wrapper does not modify:

- federation identity evidence;
- capabilities;
- trust store;
- catalog record;
- authorization.

## Persistence

Health records use:

`arca-federation-peer-health-v1`

Records are:

- local;
- size-bounded;
- SHA-256 sealed;
- written atomically;
- serialized per peer within one store instance.

V1 assumes one authoritative local health-store writer per runtime. Multi-process distributed CAS is not introduced here.

## Security properties

Health cannot:

- enroll a peer;
- trust a new key;
- rotate identity;
- enable a disabled peer;
- change repository/ref/root;
- grant capability;
- authorize execution;
- bypass Human Review;
- select an unknown peer.

A changed trust binding starts with effective health `unknown` rather than inheriting cooldown from the previous binding.

## Tests

V1 covers:

- unknown -> degraded -> cooldown;
- bounded exponential cooldown;
- cooldown enforcement before remote reads;
- expired cooldown -> probe-ready degraded state;
- success -> healthy reset;
- binding rotation isolation;
- tamper detection;
- wrapper success/failure recording;
- unavailable-node backoff;
- cryptographic identity rejection remaining outside health backoff.

## Next step

The next useful layer is policy-controlled multi-peer selection among **already-enrolled** peers.

That selection must use:

- catalog trust first;
- health second;
- capabilities only as compatibility;
- deterministic policy;
- no automatic trust expansion;
- no open discovery.
