# PNCP Controlled Live Probe V0.1

Status: **PREPARED — NOT EXECUTED**

## Purpose

This is the first live-network entrypoint for the national PNCP observer. It is deliberately smaller than the national scheduler cycle.

A run may select any Brazilian UF, but no UF is configured as a default or privileged jurisdiction.

## Hard limits

Each run is restricted to:

- one explicitly selected UF shard;
- one explicitly selected date;
- one PNCP modalidade id;
- one page;
- at most ten records;
- zero retries.

The classifier is disabled and the investigation ingress is not called. The goal of this proof is acquisition and custody, not investigative inference.

## Preflight gates

Before checkout or network execution, the workflow requires:

1. the exact confirmation `PNCP_PUBLIC_GET_ONLY`;
2. a repository secret named `ARCA_PNCP_CUSTODY_PASSPHRASE`;
3. that secret to contain at least 24 characters.

The script repeats the same authorization check before constructing the live transport.

## Custody

The public response is captured before parsing by the existing acquisition path. After the selected shard succeeds, the custody directory is sealed with the encrypted-custody envelope and plaintext temporary files are deleted.

The workflow uploads only:

- `pncp-live-custody.envelope.json` — encrypted ciphertext plus authenticated metadata;
- `pncp-live-proof.json` — sanitized hashes, counts and scope.

No raw PNCP response is uploaded in plaintext.

## Safety boundary

A successful probe is not an irregularity finding and does not create an investigation. Human review remains required before any adverse publication or promotion of evidence.
