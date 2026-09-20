# Federation Peer Catalog V1

## Purpose

Federation V1 proves that a Mesh peer can be bound to an explicit remote repository domain and an explicitly trusted Ed25519 identity.

Federation Peer Catalog V1 makes that operator decision durable.

The catalog stores **trust configuration only**. It does not store credentials, bearer tokens, private keys, model secrets or arbitrary execution instructions.

## Record

Each record uses:

`arca-federation-peer-record-v1`

and binds:

- `peerId` — local operator label;
- `nodeId` — remote Mesh node;
- status — `active` or `disabled`;
- revision;
- exact GitHub mailbox transport:
  - repository;
  - ref;
  - root;
- exact remote identity:
  - node ID;
  - Ed25519 identity ID;
  - key fingerprint;
- created/updated timestamps;
- SHA-256 record hash.

The record is intentionally insufficient to connect by itself. A credential must still be supplied out-of-band to construct the remote mailbox transport.

## Enrollment

Enrollment is explicit and create-only.

An existing peer record is not silently overwritten. Identity changes use the rotation operation.

This avoids trust-on-first-use and accidental replacement of a known peer with another key.

## Disable / enable

A peer may be durably disabled without deleting its trust history.

Disabled peers fail closed before federation resolution.

Re-enabling is an explicit state transition and advances the record revision.

## Identity rotation

Identity rotation requires:

1. the same node ID;
2. the exact currently pinned fingerprint supplied as `expectedCurrentFingerprint`;
3. a valid next Ed25519 identity descriptor.

A blind overwrite is rejected.

The operation advances the revision and seals the new record hash.

## Resolution

`FederationPeerCatalog.resolve(...)` combines the catalog with `GitHubMeshFederationPeerResolver`.

Before routing it requires:

- the peer record to exist and be active;
- the runtime mailbox repository/ref/root to equal the catalog record;
- the remote signed advertisement to be trusted;
- the remote key fingerprint to equal the catalog pin;
- the remote identity ID to equal the catalog identity.

Runtime resolver options cannot override the catalog mailbox/trust store binding or pinned fingerprint.

## Persistence safety

Records are written atomically through temporary-file + rename.

Records are size-bounded and hash-sealed.

Secret-like fields are rejected during record validation/sealing.

The catalog contains no credential material.

## Non-goals

The catalog does not provide:

- automatic discovery;
- automatic trust;
- public federation enrollment;
- secret storage;
- GitHub token management;
- node reputation;
- billing;
- Sybil resistance;
- scheduler authority.

It records an operator trust decision and makes later routing prove that it still matches.

## Tests

The V1 tests cover:

- durable enrollment/read/list;
- absence of credential-like material;
- disable/enable transitions;
- exact-fingerprint identity rotation;
- tamper detection through record hash;
- successful resolution against the catalog-pinned repository and identity;
- refusal of a different repository domain;
- refusal of disabled peers.

## Next step

A UI/Creator surface may later expose peer enrollment as a privileged Human Review action.

That UI must still keep credentials in the existing credential boundary and must not make signed advertisements self-authorizing.
