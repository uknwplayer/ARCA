# Mesh Encrypted Envelope V1

## Objective

Mesh Encrypted Envelope V1 adds the payload-confidentiality primitive required before ARCA may send non-public reasoning through an opaque relay.

It deliberately does **not** enable private Mesh reasoning by itself. The Secure Reasoning Transport Gate remains fail-closed for private `opaque-relay` traffic until encrypted request/response routing is integrated and tested end to end.

The primitive is:

```text
trusted Ed25519 node identity
        |
        v
signed X25519 recipient key
        |
        v
ephemeral X25519 agreement
        |
        v
HKDF-SHA-256
        |
        v
AES-256-GCM encrypted payload
```

Intermediate storage/relays receive only public routing/cryptographic metadata plus ciphertext.

## Recipient encryption key

A Mesh node keeps its Ed25519 identity key for signatures and uses a **separate X25519 key pair** for payload encryption.

The public X25519 descriptor uses:

`arca-mesh-encryption-recipient-v1`

and is wrapped in the existing signed-statement format under the new domain:

`arca.mesh.encryption-key.v1`

The signed recipient descriptor binds:

- node ID;
- Ed25519 identity ID;
- X25519 algorithm;
- X25519 public key;
- SHA-256 X25519 key fingerprint;
- purpose `mesh-payload-encryption`.

The X25519 private key is returned only as an in-memory Node.js `KeyObject`. It is not serialized into the signed descriptor.

When a `MeshIdentityTrustStore` is supplied, the Ed25519 signer of the X25519 key must be the currently pinned identity for that node.

## Envelope format

Encrypted payloads use:

`arca-mesh-encrypted-envelope-v1`

Public header fields include:

- requestId;
- payloadId;
- origin node alias;
- recipient node;
- recipient Ed25519 identity ID;
- recipient X25519 key fingerprint;
- exact signed recipient-statement hash;
- ephemeral X25519 public key;
- random HKDF salt;
- random AES-GCM IV;
- issued/expiry timestamps;
- algorithm identifiers;
- ciphertext hash;
- envelope hash.

The plaintext itself does not appear in the envelope.

## Cryptography

V1 uses Node.js standard cryptography only:

- key agreement: **X25519**;
- KDF: **HKDF-SHA-256**;
- AEAD: **AES-256-GCM**;
- IV: random 96-bit;
- HKDF salt: random 256-bit;
- ephemeral X25519 key pair: generated per envelope.

The HKDF context binds:

- protocol domain;
- requestId;
- payloadId;
- recipient node;
- recipient encryption-key fingerprint.

AES-GCM AAD binds the complete public envelope header.

Changing routing/correlation/recipient cryptographic metadata therefore causes authentication failure or envelope-hash failure.

## Plaintext wrapper

Before encryption, the payload is canonicalized and wrapped as:

```json
{
  "format": "arca-mesh-encrypted-payload-v1",
  "version": 1,
  "payloadHash": "<sha256>",
  "payload": {}
}
```

The plaintext hash is **inside** the encrypted data. It is not exposed to relays.

This avoids leaking a stable hash of a low-entropy private payload through repository/mailbox metadata.

After decryption the endpoint recomputes and verifies the plaintext hash.

## Decryption proof

Successful decryption returns local metadata using:

`arca-mesh-decryption-proof-v1`

The proof contains:

- requestId / payloadId;
- origin / recipient node;
- recipient identity/key references;
- ciphertext hash;
- envelope hash;
- decrypted payload hash;
- decryption timestamp.

The raw payload is returned separately to the local caller.

V1 decryption proof is local runtime evidence, not a publicly signed attestation.

## Replay protection

`MeshEncryptedEnvelopeReplayGuard` tracks accepted envelope hashes until their expiry plus clock skew.

Replay state is process-local in V1.

A federated production deployment still needs durable or monotonic anti-replay state when multiple endpoint processes share one identity/key.

Replay is recorded only after successful authenticated decryption so an invalid ciphertext cannot consume a valid replay slot.

## Lifetime binding

An encrypted envelope may not outlive the signed recipient-key attestation used to create it.

This prevents an origin from constructing a message whose declared validity extends beyond the recipient key's authenticated lifetime.

## Secret boundary

Encrypted Mesh payloads may carry private investigation/reasoning context, but structured credentials remain prohibited.

V1 rejects secret-like fields such as:

- API keys/tokens;
- passwords;
- private keys;
- cookies;
- credential fields;
- authorization/bearer values.

Encryption is not permission to turn Mesh into a secret-distribution system.

## What relays can see

A relay may see:

- requestId / payloadId;
- origin and destination aliases;
- algorithm identifiers;
- public recipient identity/key references;
- ephemeral X25519 public key;
- timestamps;
- ciphertext size/hash;
- ciphertext.

A relay cannot read the JSON payload without the recipient X25519 private key.

Tests explicitly assert that private message strings and example personal names do not occur in serialized envelopes.

## What V1 proves

V1 proves:

- an X25519 encryption key can be cryptographically bound to a trusted Ed25519 Mesh identity;
- sender and recipient derive the same one-time content key;
- AES-GCM protects confidentiality and integrity;
- public header metadata is authenticated as AAD;
- ciphertext/header/tag tampering fails closed;
- the wrong endpoint private key cannot decrypt;
- untrusted recipient identity is rejected when trust pinning is required;
- replay can be detected;
- plaintext does not appear in the envelope;
- encrypted-envelope lifetime cannot exceed recipient-key attestation lifetime.

## What V1 does not yet enable

V1 does **not** yet:

- replace the V3 job envelope with ciphertext;
- put encrypted packets into GitHub Mesh Mailbox;
- provide bidirectional encrypted request/response RPC;
- hide routing metadata;
- provide traffic-analysis resistance;
- persist replay state across machines;
- authorize an endpoint merely because it can decrypt;
- enable private `opaque-relay` in Secure Reasoning Transport Gate.

Therefore the existing privacy gate must remain conservative.

## Next integration

The next milestone is **Opaque Mesh RPC V1**:

1. route an encrypted request packet through trusted signed relays;
2. decrypt only at the selected verified endpoint;
3. execute only the specifically authorized capability;
4. encrypt the response back to an origin reply key;
5. verify signed hop receipts in both directions;
6. bind request/result correlation;
7. add durable anti-replay state;
8. run an end-to-end private reasoning fixture where relay/mailbox storage contains ciphertext only.

Only after that proof should the Reasoning Transport Gate accept a private `opaque-relay` transport.
