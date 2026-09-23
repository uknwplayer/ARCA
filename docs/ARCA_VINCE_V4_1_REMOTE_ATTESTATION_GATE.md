# ARCA — Vince V4.1 Remote Worker Attestation Gate

Status: **DESIGN GATE / AGUARDA CONTRATO FINAL REPLIT**.

## Goal

Upgrade V4 from verified heterogeneous transport/execution/return to a bounded cryptographic worker-attestation proof.

V4.1 must preserve the V4 action boundary: the first live attested mission remains only `git-status`.

## Required properties

A V4.1 request must bind:

- dedicated V4.1 schema/version;
- safe job id;
- `action = git-status`;
- expiry;
- 32-byte unpredictable challenge/nonce;
- canonical request SHA-256.

A V4.1 result must bind:

- exact request/job/action;
- exact challenge;
- canonical result payload hash;
- execution timestamps/status/exit code;
- Git branch/HEAD/dirty provenance;
- persistent worker public identity;
- Ed25519 signature over a fixed domain plus canonical payload bytes.

## Persistent worker identity

The worker private key must:

- never enter Git;
- never enter stdout/stderr/results/logs;
- never be returned to ARCA;
- live only in a protected Replit Secret/credential boundary;
- persist across worker restarts;
- be independently rotatable/revocable.

The public identity must include at least:

- fixed worker node id;
- algorithm = Ed25519;
- SPKI public key;
- SHA-256 fingerprint of SPKI.

## ARCA trust rule

A valid signature is not enough.

ARCA must pin an explicitly reviewed public identity/fingerprint before accepting a live V4.1 result.

Unknown or changed fingerprints fail closed.

No trust-on-first-use during result verification.

## Signed bytes

The final contract must define a single fixed domain and exact canonicalization.

The signature must cover at least:

- job id;
- action;
- challenge;
- request SHA-256;
- result SHA-256 or equivalent canonical payload hash;
- Git provenance;
- execution status/timestamps;
- worker identity fingerprint.

Changing any bound field must invalidate the signature.

## Replay protection

A challenge:

- is unique to one mission;
- expires with the request;
- may be accepted at most once;
- cannot be reused under a different job id.

Replaying a previously valid result under a new request must fail.

## Authority

V4.1 does not grant:

- new execution actions;
- arbitrary shell;
- retry/failover;
- trust expansion;
- core mutation;
- merge/main.write;
- investigative publication.

## First acceptance proof

The first live V4.1 proof requires:

1. persistent worker public identity reviewed/pinned;
2. fresh one-shot challenge;
3. one `git-status` request;
4. one Replit one-shot cycle;
5. signed result returned;
6. ARCA recomputes canonical hashes/fingerprint;
7. ARCA verifies Ed25519 signature against pinned identity;
8. ARCA proves challenge/job correlation;
9. no retry/failover.

If the Replit environment cannot securely persist the private key outside Git, V4.1 remains blocked rather than falling back to an embedded or ephemeral key.
