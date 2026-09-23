# Secure Mesh Signer Broker V1

## Purpose

Remote Request Evidence V1 requires an Ed25519 signer.

A deployable runtime should not receive the raw private key as an ordinary object, environment value, Git-backed file or public configuration field.

Secure Mesh Signer Broker V1 introduces a closed signing boundary backed by the existing encrypted Credential Vault.

## Architecture

```text
runtime
  -> closed signer method
  -> Mesh Signer Broker
  -> EncryptedCredentialVault.withCredential(...)
  -> decrypt key only inside callback
  -> create Ed25519 KeyObject
  -> sign approved Mesh statement type
  -> return signed public statement
```

The caller receives the signed statement, not the private key.

## Vault key reference

The broker accepts a private key reference only in the form:

```text
vault://...
```

The reference is captured inside the broker closure.

It is not exposed by:

- the public descriptor;
- JSON serialization of the broker;
- signed statements;
- runtime snapshots.

## Key format

V1 expects the vault secret to contain an Ed25519 private key that Node.js `createPrivateKey()` can parse.

The tested deployment representation is PKCS#8 PEM stored **inside the encrypted Credential Vault**.

The PEM is not stored in Git or ordinary runtime configuration.

## Closed operations

The broker intentionally does not expose a generic `signStatement(payload, domain)` method.

V1 exposes only closed, typed operations, including:

- `signNodeAdvertisement(...)`;
- `signReceipt(...)`;
- `signRequestEvidence(...)`;
- `signCognitiveSubstitutionReceipt(...)`;
- `signReconciledFailoverReceipt(...)`;
- `signVinceRecoveryReceipt(...)`.

This keeps the signing authority bounded to already-defined Mesh statement classes.

## Identity pinning

The broker is configured with a public Mesh identity.

Every signing operation reconstructs the private KeyObject inside the vault callback.

Existing Mesh signing code verifies that the private key derives to the configured public identity fingerprint.

A wrong key fails closed with:

```text
ARCA_MESH_SIGNER_IDENTITY_MISMATCH
```

Malformed/missing key material fails with:

```text
ARCA_MESH_SIGNER_KEY_UNAVAILABLE
```

Errors are sanitized and do not include the vault reference or raw key material.

## Audit

Every signing operation uses:

```text
EncryptedCredentialVault.withCredential()
```

with a bounded purpose such as:

```text
mesh-sign:request-evidence:<nodeId>
mesh-sign:receipt:<nodeId>
mesh-sign:node-advertisement:<nodeId>
mesh-sign:vince-recovery-receipt:<nodeId>
```

The existing Credential Vault records `credential.used` audit events without storing the secret.

## Remote Request Evidence integration

`RemoteRequestEvidenceLedger` now accepts a signer interface.

Two modes remain possible:

### Test/fixture signer

A direct `{ identity, privateKey }` signer can still be supplied for synthetic tests.

The ledger normalizes it into a signing interface and does not retain the raw private key on `ledger.signer`.

### Production broker

A `createVaultMeshSignerBroker(...)` instance can be supplied directly.

The ledger then receives:

- public identity;
- `signRequestEvidence()`.

It never receives `privateKey`.

## Memory limitation

V1 does **not** claim that the private key never exists in memory.

That would be false.

During signing:

1. the Credential Vault decrypts the key inside `withCredential()`;
2. Node.js creates an Ed25519 KeyObject;
3. the statement is signed;
4. the vault zeroes its plaintext credential buffer when the callback exits.

A process-level attacker with memory/code-execution control may still defeat this boundary.

The security improvement is authority minimization and storage isolation, not magical elimination of plaintext memory.

## What is not introduced

V1 does not add:

- raw private-key environment variables;
- private keys in Git;
- private keys in Machine Bridge jobs/results;
- a key-export API;
- a generic arbitrary-domain signing API;
- trust expansion;
- peer discovery;
- authorization expansion;
- automatic failover.

## Public descriptor

The broker may expose only public information:

- format/version;
- nodeId;
- identityId;
- keyFingerprint;
- `keySource = vault`;
- supported operation names.

It does not expose the vault reference.

## Tests

V1 tests verify:

- broker public descriptor contains no keyRef/private key;
- no generic signing method exists;
- request evidence is signed successfully through the vault boundary;
- Credential Vault audit records use without secret leakage;
- advertisement/receipt closed methods work;
- wrong key fails with sanitized identity mismatch;
- missing/malformed key fails with sanitized unavailable error;
- Remote Request Evidence Ledger works using only the broker interface;
- non-`vault://` references are rejected before credential access.

## Next deployment step

The next deployable remote processor should receive:

- public Mesh identity;
- vault key reference;
- Credential Vault instance/key provider;
- closed Mesh Signer Broker;
- Remote Request Evidence Ledger.

It should **not** receive raw PEM/private-key bytes as configuration.

A live two-operator federation proof remains the external milestone once a second independent repository/host is available.
