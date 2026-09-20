# Mesh Node Identity V1

## Objective

Mesh Node Identity V1 adds cryptographic node identity to Machine Bridge without turning GitHub, DNS, a relay operator or a self-declared node name into the root of trust.

The foundation is Ed25519:

```text
node alias
  + Ed25519 public key
  -> SHA-256 key fingerprint
  -> mesh identity descriptor
  -> signed advertisement / signed receipt
```

This layer is deliberately independent from transport. A future node can use GitHub mailbox, private-direct, WebSocket/QUIC or another relay while preserving the same identity.

## Identity descriptor

Format:

`arca-mesh-node-identity-v1`

Fields include:

- `nodeId`: human/route alias;
- `algorithm=Ed25519`;
- SPKI public key;
- SHA-256 public-key fingerprint;
- `identityId=ed25519:<fingerprint>`;
- descriptor hash.

The public identity contains no private key.

`generateMeshNodeIdentity(nodeId)` exists for runtime/bootstrap tooling and tests. It returns a Node.js private `KeyObject` in memory plus the public identity descriptor.

The private key must not be serialized into:

- Git;
- Mesh advertisements;
- jobs/results;
- logs;
- project-history;
- public ledgers.

Deployment should load private key material from an OS-backed keystore, HSM, GitHub secret or equivalent secret boundary.

## Signed statements

Format:

`arca-mesh-signed-statement-v1`

A statement binds:

- a domain;
- signer identity;
- nonce;
- issued/expiry timestamps;
- exact canonical payload SHA-256;
- payload;
- Ed25519 signature;
- statement hash.

The signature input has an explicit ARCA Mesh domain separator before canonical JSON.

Supported V1 domains:

- `arca.mesh.node-advertisement.v1`;
- `arca.mesh.receipt.v1`.

Cross-domain reuse fails closed.

## Signed node advertisements

`signMeshNodeAdvertisement(...)` requires the advertisement `nodeId` to equal the signer identity `nodeId`.

A signed advertisement can therefore bind:

- node alias;
- capabilities;
- reachable capabilities;
- heartbeat;
- transport metadata;
- operator metadata;

to a particular public key.

Changing any signed payload field invalidates the payload hash / statement hash / signature.

This removes the current assumption that a JSON file claiming `nodeId=relay-a` is enough to establish identity.

## Signed receipts

`signMeshReceipt(...)` signs a relay/endpoint receipt under the forwarding node identity.

This is separate from the existing Mesh V0 SHA-256 receipt chain.

The intended evolution is:

```text
payload hash
  -> chained receipt hash
  -> node signature over receipt
  -> trusted public key
```

Hash chaining provides integrity linkage; signatures provide origin authentication. They solve different problems.

V1 does not yet make signed receipts mandatory in the current relay runtime.

## Replay protection

Every signed statement carries a nonce and bounded validity window.

`MeshReplayGuard` rejects a repeated:

`identityId + domain + nonce`

during the accepted validity window, including configured clock skew.

The V1 replay guard is process-local. It is useful for local/direct runtimes and tests, but is not a distributed replay database.

A federated deployment needs durable/shared replay state, sequence numbers or another monotonic anti-replay mechanism at the trust boundary.

## Trust pinning and key rotation

A mathematically valid signature does not answer whether the signer is trusted.

`MeshIdentityTrustStore` therefore separates signature validity from trust policy.

It pins:

`nodeId -> current key fingerprint`

A new key for an existing node alias is rejected unless rotation is explicit.

`rotate(...)` can require the expected current fingerprint, preventing blind overwrite of a node's trust record.

The current trust store is in-memory foundation code. Durable deployment policy is still required.

## Secret minimization

Signed payloads reject secret-like structured fields including:

- authorization;
- bearer/token;
- password/secret;
- API key;
- client secret;
- private key;
- cookie;
- credential-like fields.

The signer should never turn a public attestation into a secret-distribution channel.

This is structural defense-in-depth and does not claim to detect arbitrary secrets embedded inside free text.

## What V1 proves

V1 proves that ARCA can:

- generate/represent Ed25519 node identity;
- bind a node alias to a public-key fingerprint;
- sign advertisements and receipts;
- detect payload/signature/identity tampering;
- enforce signature domain separation;
- enforce bounded statement lifetime;
- detect nonce replay in a runtime;
- pin trust to a key fingerprint;
- rotate a pinned node key explicitly.

## What V1 does not prove

V1 does not yet provide:

- globally unique or state-issued node identity;
- Sybil resistance;
- certificate authority or WebPKI integration;
- distributed trust/reputation;
- durable cross-host replay database;
- automatic key distribution;
- HSM/OS-keystore deployment;
- signed GitHub mailbox enforcement;
- signed relay routing enforcement;
- end-to-end payload encryption;
- private reasoning over opaque relays.

A node can generate many valid Ed25519 identities. Signatures establish continuity/authentication for a key; they do not establish social/operator trust on their own.

## Integration sequence

The safe next sequence is:

1. accept/store signed node advertisements alongside legacy Mesh advertisements;
2. add a strict mode that routes only through trusted signed identities;
3. sign every relay receipt and verify the receipt signer against the routed node;
4. persist anti-replay/sequence state;
5. add X25519/HPKE-style or equivalent end-to-end encrypted envelopes for payload confidentiality;
6. only then permit non-public reasoning through `opaque-relay`.

## Relation to blockchain / public ledger

A blockchain is not required for node signatures.

If a future Trust Ledger is added, it should anchor compact public facts such as:

- identity fingerprints;
- key-rotation attestations;
- signed capability roots;
- receipt/Merkle roots.

It should not contain private keys, reasoning payloads, investigation data or private Human Review decisions.
