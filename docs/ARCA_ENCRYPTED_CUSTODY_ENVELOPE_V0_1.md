# Encrypted Custody Envelope V0.1

Status: **FOUNDATION**

## Purpose

Public GitHub Actions runners are ephemeral. A PNCP acquisition may correctly capture bytes before parsing and still lose those custody files when the job ends.

This component closes that gap by sealing a bounded custody directory into an authenticated encrypted envelope before any durable upload.

## Cryptographic profile

- AES-256-GCM authenticated encryption;
- scrypt key derivation with a random 16-byte salt;
- random 12-byte IV;
- 16-byte GCM authentication tag;
- minimum passphrase length of 24 characters.

The passphrase is never written into the envelope.

## Bound metadata

The public envelope binds the repository, exact revision, scope hash, file count, total byte count, payload hash and a content-root hash derived from file paths, sizes and SHA-256 digests.

Raw files live only inside the ciphertext.

## Fail-closed behavior

Sealing fails on symlinks, empty custody, weak passphrases or budget overflow. Opening fails on a wrong key, authentication failure, payload-hash mismatch, binding mismatch or per-file hash mismatch.

## Operational boundary

This component does not authorize network access and does not itself upload anything. A future live PNCP workflow must verify its network authorization and the presence of a custody encryption secret **before** making the first GET request.
