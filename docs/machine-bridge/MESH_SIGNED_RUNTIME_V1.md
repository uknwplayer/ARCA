# Mesh Signed Runtime V1

## Objective

Mesh Signed Runtime V1 connects the Ed25519 identity foundation to actual Machine Bridge routing and durable node discovery without breaking the existing legacy Mesh deployment.

Two runtime controls are added:

1. signed relay/endpoint receipts;
2. signed node advertisements in GitHub Mesh Mailbox.

The security goal is to stop treating a node alias or mutable JSON file as sufficient proof of who produced a route claim.

## Signed receipts in the routing runtime

`MachineBridgeMeshRelay` and `MachineBridgeMeshEndpoint` can now receive a `receiptSigner`.

When present, each hop appends the existing hash-chain receipt and then signs the complete receipt with the forwarding node's Ed25519 identity.

The signed payload includes:

- nodeId;
- nextNode;
- hop number;
- requestId;
- jobId;
- forwardedAt;
- previous receipt/payload hash;
- receiptHash.

The old SHA-256 chain remains intact. The signature is an additional origin-authentication layer.

## Strict receipt mode

Relay, endpoint and client constructors now accept:

- `requireSignedReceipts`;
- optional `trustStore`.

With strict mode:

- an unsigned previous hop is rejected;
- a malformed signature is rejected;
- signed receipt payload must exactly match the hash-chain receipt;
- when a trust store is present, the signing key must be the currently pinned key for that node alias.

A fully strict route can therefore enforce:

```text
receipt chain integrity
  + receipt signer identity
  + current trusted key
```

Legacy mode remains the default so the current deployed GitHub Actions Mesh does not suddenly require undeployed private keys.

## Historical receipt verification

Signed receipt cryptography is verified against the receipt's own forwarding time rather than today's wall clock.

This is intentional: a terminal result should remain cryptographically inspectable after the routing statement's live anti-replay window expires.

Freshness/replay enforcement belongs at ingress/dispatch time. Historical authenticity and live replay protection are separate concerns.

## Signed GitHub Mesh advertisements

`GitHubMeshMailboxTransport` now supports identity policies:

- `legacy`;
- `require-signed`;
- `require-trusted`.

### legacy

Existing unsigned advertisements remain accepted.

Valid signed advertisements are also understood, enabling migration without a flag day.

### require-signed

Unsigned registration is refused and discovery returns only cryptographically valid signed advertisements.

No operator trust is implied beyond control of the signing key.

### require-trusted

Requires a `MeshIdentityTrustStore`.

Only signed advertisements whose key fingerprint is the currently pinned key for that node alias are returned.

This is the first mode suitable for a controlled federation where operators exchange/pin keys out-of-band.

## registerSignedNode

`registerSignedNode(...)`:

1. normalizes the existing node advertisement;
2. binds the full GitHub mailbox transport descriptor;
3. signs the advertisement;
4. verifies the statement immediately;
5. optionally applies trust policy and replay guard;
6. stores the signed statement at the existing node path.

Private key material is used only by the caller/runtime signer and is not written into the repository.

## Discovery result metadata

Signed discovery entries expose:

- normalized node advertisement;
- signed/not-signed flag;
- public identity descriptor;
- trust status;
- original signed statement.

A higher-level route planner can therefore distinguish:

```text
compatible capability
from
cryptographically identified capability
from
locally trusted cryptographically identified capability
```

These are intentionally separate states.

## Replay

A `MeshReplayGuard` can be attached to signed registration ingress.

The existing V1 guard is process-local. GitHub repository state does not yet provide a distributed nonce database.

For independent operators, the next iteration should add durable monotonic advertisement sequence/epoch state or another cross-process replay mechanism.

## Migration compatibility

Current workflows do not have Ed25519 private keys deployed.

Therefore V1 does **not** switch the production GitHub Mesh workflows to strict mode automatically.

Migration should be explicit:

1. provision one node key per operator/node in secret storage;
2. publish/pin public identities;
3. register signed advertisements;
4. verify strict discovery alongside legacy routing;
5. sign receipts;
6. enable `require-trusted` / `requireSignedReceipts`;
7. retire unsigned compatibility only after all live nodes are migrated.

## Security boundaries

Signed runtime V1 does not provide:

- Sybil resistance;
- operator reputation;
- distributed replay persistence;
- confidentiality of payloads;
- end-to-end encryption;
- private reasoning over relays;
- automatic key provisioning;
- permission to execute a capability merely because the node is trusted.

Identity, capability verification and authorization remain independent.

## Next step: encrypted Mesh envelope

With node identity and signed route evidence in place, the next missing primitive for private reasoning is payload confidentiality.

The next layer should add an actual cryptographic envelope where:

- origin encrypts to an authorized endpoint;
- intermediate relays see routing metadata but not plaintext;
- envelope binds requestId/payload hash/policy/deadline;
- recipient key is bound to the trusted node identity;
- nonce/replay protection is enforced;
- decryption occurs only at the selected endpoint;
- private payload never enters Git plaintext.

Only after this is tested should Secure Reasoning Transport Gate allow non-public `opaque-relay` traffic.
