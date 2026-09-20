# ARCA Durable Private Custody V0.1

State: **IMPLEMENTED, LIVE CREDENTIAL NOT YET CONFIGURED**

This contract removes successful live custody from dependence on ephemeral runner storage.

## Boundary

The public ARCA repository contains only the generic persistence contract, validation code, tests and sanitized receipts. The durable target is configured at runtime and must report itself as a private repository before any PNCP GET is allowed.

The durable backend never receives the custody passphrase or plaintext source bytes. It receives only the already encrypted `arca.encrypted-custody-envelope.v0.1` object and sanitized live-proof metadata.

## Persistence semantics

Each encrypted envelope is addressed by its SHA-256 object hash:

```
custody/<hash-prefix>/<envelope-hash>.envelope.json
receipts/<hash-prefix>/<envelope-hash>.receipt.json
```

A receipt binds the encrypted envelope to its source repository/revision, scope hash, PNCP result hash, content-root hash, payload hash, file count and byte count.

The GitHub private-repository backend:

1. verifies that the target repository is private and not archived;
2. verifies the target branch exists;
3. checks both content-addressed paths before writing;
4. rejects partial pre-existing state and replacement attempts;
5. creates the envelope and receipt blobs;
6. creates one tree and one commit containing both;
7. advances the branch with a non-forced ref update;
8. verifies both stored blob hashes after the ref advance.

If the content is already present byte-for-byte, the write is idempotent and returns `ALREADY_STORED`.

## Live gate

When `ARCA_CUSTODY_DURABLE_REQUIRED=true`, the PNCP controlled live probe performs the private-vault preflight before constructing or using the PNCP live path. A missing credential, public target, archived target or unreachable branch blocks the PNCP GET.

After a successful acquisition, the encrypted envelope must be durably persisted before the probe returns success. The existing GitHub Actions artifact remains only a 90-day encrypted fallback/transport copy.

## Secrets

The workflow expects runtime secrets for:

- the custody encryption passphrase;
- the private vault repository reference;
- a dedicated cross-repository credential with the minimum permission needed to read/write repository contents.

No secret value belongs in source control, logs, proof documents or receipts.

## Security properties and limits

- plaintext custody is forbidden in the durable backend;
- content-addressed paths make silent replacement detectable;
- branch advancement is non-forced;
- a single commit contains both envelope and receipt;
- retries are idempotent only when stored bytes match exactly;
- classifier output and investigative ingress remain disabled in the controlled probe;
- human review remains required;
- anomaly is not irregularity.

Git history provides durable persistence and tamper visibility, but it is not WORM/object-lock storage. A later storage provider may add retention lock without changing the public receipt contract.
