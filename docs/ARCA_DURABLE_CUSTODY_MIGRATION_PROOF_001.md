# ARCA Durable Custody Migration Proof 001

Status: **VERIFIED DURABLE PRIVATE MIGRATION**

This record documents the first migration of an existing encrypted PNCP custody envelope from an ephemeral GitHub Actions artifact into the ARCA durable private custody backend.

Only sanitized proof metadata is recorded here. No plaintext custody bytes, ciphertext payload, private-vault repository name, credential or token is published.

## Execution identity

- Public control plane revision: `8f7a8e084190615d1700c19fed61a90e60bea14d`
- Migration workflow run: `35546194827`
- Source controlled-live run: `35544888070`
- Workflow: `.github/workflows/arca-durable-custody-migration.yml`
- Event: `workflow_dispatch`
- Conclusion: `success`

Run: https://github.com/uknwplayer/ARCA/actions/runs/35546194827

## Source artifact verification

The migration workflow downloaded the encrypted artifact from source run `35544888070`.

- source artifact ID: `10616740880`
- source artifact SHA-256: `80ca12c81444bbafc132baa28eb690906c101ec547961f5835573a26db6cd91d`
- encrypted envelope hash: `721710162d3cdad2fd7aa07305d3425bbcaa0a21d0b0f01d0f8de79e326679e8`
- source result hash: `61545642e051c3b976c2ed4543ab7ea4459075dbe29f52a85d7b8a9617479ed1`
- content root hash: `68949d5b98f38a2bbd3ab3bc3864332b9bbab89a5db75e58d23c3754a56172e0`
- encrypted payload hash: `55bf24779d9aadba7cd4856c4c698a0035b2dbdae3faf73daab38e2c2b415287`
- custody file count: `3`
- plaintext custody bytes represented inside encrypted payload: `21854`

The source artifact digest checked by the download step matched the artifact digest previously recorded for the controlled-live proof.

## Durable migration result

The migration emitted:

- status: `MIGRATED_PRIVATE`
- durable receipt hash: `b0a6de28d133d1d15c045bd8fe4a5fb2a616057ed2b2dcd13145b656fba0676c`
- vault commit reference hash: `7f019b99e53c18a41f65945c61afd372473ba59bbda978d35390be58c8df7d36`
- plaintext read: `false`
- plaintext stored: `false`
- decryption performed: `false`
- PNCP network used by migration: `false`
- classifier emitted signals: `false`
- investigation ingress used: `false`
- automatic adverse publication: `false`
- human review required: `true`
- anomaly is not irregularity: `true`

The private-vault branch advanced through a non-forced commit containing the encrypted envelope plus its durable receipt. The SHA-256 of the resulting private commit reference matches the public `vaultCommitRefHash` above.

## Migration proof artifact

The migration workflow also uploaded a sanitized proof artifact:

- artifact ID: `10616768014`
- artifact SHA-256: `0a4b2574de0c1795c7d5b09b1ae751186d5c83750e946dc0936c18a02fa3e39e`
- artifact size: `710` bytes
- retention: 90 days

The durable encrypted custody does not depend on the retention of this proof artifact. The proof artifact is a convenience record; the durable encrypted envelope and receipt are persisted separately.

## What this proves

For the first controlled-live PNCP custody envelope, ARCA has now demonstrated:

1. retrieval of the exact prior encrypted artifact;
2. digest verification of that source artifact;
3. no decryption during migration;
4. private-backend preflight before persistence;
5. content-addressed storage of the encrypted envelope;
6. creation of a durable receipt bound to the original acquisition hashes;
7. a non-forced private commit containing envelope and receipt;
8. a public sanitized proof that can verify the private commit reference without exposing the private location.

## What this does not prove

This proof does not make Git history equivalent to WORM/object-lock storage. It also does not authorize continuous national collection, autonomous adverse conclusions or publication without human review.

The next stage may now test a new controlled-live PNCP probe with durable private custody required from the start, so a live acquisition cannot succeed unless the private vault is available before the PNCP GET.
