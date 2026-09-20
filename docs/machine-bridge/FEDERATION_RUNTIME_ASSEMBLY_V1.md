# Federation Runtime Assembly V1

## Purpose

Federation V1, Peer Catalog, Peer Health and Deterministic Peer Selection define separate pieces of a safe federated runtime.

Federation Runtime Assembly V1 composes those pieces without collapsing their authority boundaries.

The assembly path is:

```text
explicit peer config
  -> durable catalog record
  -> binding-scoped health check
  -> credential broker boundary
  -> require-trusted remote mailbox
  -> cryptographic peer resolution
  -> health-wrapped remote peer
  -> explicit selector bindings
  -> MachineBridgeMeshRelay
```

The runtime does not create trust, discover peers or persist credentials.

## Explicit configuration

Assembly requires a non-empty explicit `peerConfigs` list.

Each entry contains only:

- `peerId`;
- `credentialRef`.

Credential references must use:

`vault://...`

Raw tokens/passwords are rejected at the assembly boundary.

The peer's repository/ref/root and Ed25519 identity are not supplied by this list. They remain authoritative in the durable Federation Peer Catalog.

Duplicate peer IDs are rejected.

## Credential boundary

The recommended GitHub mailbox factory is:

`createBrokeredGitHubMeshMailboxFactory(...)`

It accepts a Credential Broker implementing `authorizedFetch(...)`.

The Machine Bridge transport stores only a non-secret marker token.

On each GitHub HTTP request:

1. the transport builds the normal request;
2. the broker receives the `credentialRef`;
3. the broker retrieves/decrypts the actual secret inside its credential boundary;
4. the broker replaces the Authorization header;
5. the secret is presented to GitHub;
6. the secret is not returned to the Federation Runtime.

This matches the existing Credential Vault / Credential Broker model.

No honest runtime can guarantee that a secret never exists in process memory at use time; the relevant guarantee is that the secret is not persisted or exposed to the catalog, selector, jobs, results or runtime snapshot.

## Trust before runtime routing

For each configured peer:

1. the catalog record must exist;
2. the record must be active;
3. transport kind must be `github-mailbox`;
4. health binding is computed from exact node + transport + public identity;
5. active cooldown is checked before the mailbox/credential boundary is touched;
6. mailbox factory must return the exact catalog repository/ref/root;
7. mailbox identity policy must be `require-trusted`;
8. Federation V1 resolution verifies the signed advertisement and local trust store;
9. the Assembly's authoritative clock is passed into federation signature/heartbeat verification;
10. the catalog revision + recordHash are rechecked after resolution;
11. any catalog mutation during assembly aborts the build;
12. only the resolved trusted peer is added to the relay.

A transport or identity mismatch aborts assembly.

## Availability handling

Operational unavailability is not equivalent to a trust error.

If a configured trusted peer is:

- in active cooldown;
- absent;
- stale;
- temporarily unavailable through a classified transport condition;

it may be represented in the assembly snapshot as unavailable while other explicitly configured trusted peers continue to resolve.

The runtime never substitutes an unknown peer.

If an advertisement exists but is cryptographically rejected, assembly fails instead of treating the peer as ordinary downtime.

## Runtime snapshot

`snapshot()` returns public operational metadata:

- format/version;
- relay node ID;
- assembly timestamp;
- configured peer count;
- resolved peer count;
- unavailable peer count;
- resolved public peer descriptors including pinned catalog revision/recordHash;
- unavailable peer IDs/node IDs/categories/retry timestamps;
- whether signed receipts are required.

It does not include:

- credentialRef;
- bearer tokens;
- passwords;
- private keys;
- mailbox objects;
- forward functions.

The snapshot represents assembly-time availability.

A peer that was unavailable during assembly is not silently discovered later. The operator/runtime controller must explicitly reassemble or run a future bounded refresh mechanism.

## Signed receipts

V1 defaults to `requireSignedReceipts=true`.

Strict mode requires a local receipt signer whose identity node ID equals the configured relay node ID.

This avoids constructing a strict federated relay that cannot authenticate its own Mesh hop.

An operator may explicitly disable strict receipt enforcement for a compatibility deployment, but doing so does not change peer trust requirements.

## Health interaction

Health is consulted before mailbox construction.

Therefore a peer in active cooldown does not trigger:

- credential retrieval;
- GitHub reads;
- remote advertisement lookup.

A successful resolved peer is wrapped by the existing health layer, so later forwarding success/failure updates binding-scoped health.

## Selection interaction

The Assembly builds `FederationPeerSelector` from the same explicit peer IDs.

Only actually resolved peers are inserted into the relay candidate map.

The selector therefore cannot revive an unavailable peer or select a node outside the relay's real compatible candidate set.

Health continues to be evaluated at selection time.

## No automatic failover

The Assembly preserves the Peer Selection V1 rule:

```text
one selection decision -> one forward attempt
```

It does not add automatic second-peer retry after forwarding begins.

## Security properties

Federation Runtime Assembly V1 does not:

- persist secrets;
- accept raw tokens as peer config;
- derive trust from credential possession;
- mutate the peer catalog;
- enable disabled peers;
- rotate identities;
- discover new peers;
- broaden capabilities;
- authorize actions;
- bypass Human Review;
- bypass health cooldown;
- bypass Mesh hop/loop checks;
- implement automatic post-forward failover.

## Tests

V1 tests prove:

- multiple explicit trusted peers assemble successfully;
- health-aware selector chooses the healthy peer;
- snapshot excludes credential references/secrets;
- cooldown prevents mailbox/credential resolution;
- one operationally unavailable peer can be omitted while another trusted peer remains usable;
- trust rejection aborts assembly;
- raw credential material is rejected;
- duplicate peer config is rejected;
- strict mode requires a signer matching the local relay node;
- brokered GitHub mailbox delegates Authorization replacement to the Credential Broker instead of holding the real token.

## Current limits

V1 is a one-time assembly primitive.

It does not yet provide:

- periodic peer refresh;
- hot-add/hot-remove;
- credential rotation propagation without reassembly;
- independent-host live proof;
- safe cross-peer post-forward failover.

These are intentionally separate concerns.

## Next step

The next meaningful milestone is a live runtime probe between independently controlled hosts/repositories.

If a second real operator/repository remains unavailable, the next implementation step should be a bounded Runtime Refresh Controller that reassembles only the already-configured peer set and never expands trust automatically.
