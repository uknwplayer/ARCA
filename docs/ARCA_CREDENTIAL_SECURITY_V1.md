# ARCA Credential Security v1

**Status:** backend security foundation  
**Scope:** API keys, bearer tokens and OAuth tokens used by Agent Gateway connections

## Objective

ARCA treats user credentials as host secrets, not normal application data.

The ARCA Agent, Core, Registry, jobs, results, reports and public connection catalog must not receive or persist credential plaintext. Authenticated outbound calls use a Credential Broker that opens the encrypted credential only at the transport boundary.

## Cryptography

The v1 local vault uses AES-256-GCM authenticated encryption and scrypt key derivation. Each stored version uses a random salt and IV. The credential reference is included as authenticated data. SHA-256 is used for encrypted-record metadata and for the audit hash chain.

The vault does not persist the master passphrase/key returned by `keyProvider`.

## Stored record

Persistent storage contains ciphertext and non-secret metadata only. Public credential listings expose the credential reference, timestamps, algorithm/KDF identifiers, `ciphertextSha256`, `recordHash` and caller-supplied non-secret metadata.

The public listing never returns plaintext.

## Runtime boundary

For an authenticated Agent Gateway call:

1. Gateway validates the endpoint and builds the non-secret request.
2. Gateway sends `credentialRef`, authentication mode and request to Credential Broker.
3. Broker asks Credential Vault to decrypt just in time.
4. Broker adds the provider authentication header and performs the outbound request.
5. Mutable key/plaintext buffers are cleared when the callback finishes where the runtime permits.
6. Gateway receives the provider response, not the credential.

A runtime string created for an HTTP header cannot be reliably overwritten because strings are immutable and garbage-collected. This limitation must be stated clearly to users.

## Audit trail

Credential operations generate secret-free events for store, rotation, use and deletion. Each event has sequence, timestamp, operation, `credentialRef`, non-secret details, previous hash and current hash.

`verifyAuditTrail()` recomputes the chain and fails when content, sequence, predecessor link or event hash is inconsistent.

## What a user can verify

Without knowing the secret, a user or independent auditor can inspect:

1. `packages/agent/src/credential-vault.ts`;
2. that public Registry descriptors omit credential references/secrets;
3. that authenticated Gateway calls require Credential Broker;
4. that persisted records contain encrypted material rather than plaintext keys;
5. `ciphertextSha256` and `recordHash`;
6. audit-chain continuity;
7. `tests/credential-vault.test.mjs` and `tests/agent-gateway.test.mjs`.

Future release packaging should also support reproducible or signed artifacts so a user can compare the distributed build with audited source.

## Important limits

The vault protects stored credentials and narrows where plaintext is handled. It does not make a credential impossible to observe on a device that is already under unauthorized control while the credential is actively being used.

The filesystem audit store in this first version is intended for a single writer. Multi-process deployments should add an external transactional lock/store before sharing one audit log between processes.

## Host requirements

A production host should keep the vault master key outside Git and outside the encrypted credential files, preferably using a user-controlled secret, OS keychain, hardware-backed keystore or dedicated secret manager. Remote provider calls should use HTTPS and local model APIs should remain on loopback whenever possible.

## Frontend requirement for later

The connection screen must display the backend `securityNotice`, provide access to audit metadata/hashes, and never provide a "show stored key" feature. Replacing a key should be a rotation operation, not reveal-and-edit.
