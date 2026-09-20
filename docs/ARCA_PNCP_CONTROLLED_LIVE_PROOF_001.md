# ARCA PNCP Controlled Live Proof 001

Status: **VERIFIED CONTROLLED LIVE ACQUISITION**

This record documents the first deliberately bounded live PNCP acquisition executed by the ARCA national PNCP path. It records only sanitized proof metadata. No plaintext custody payload is published here.

## Execution identity

- Repository: `uknwplayer/ARCA`
- Revision: `a1a7e1c8b9344fda526877b3879f13a3f6c4ec50`
- GitHub Actions run: `35544888070`
- Workflow: `.github/workflows/arca-pncp-controlled-live-probe.yml`
- Run event: `workflow_dispatch`
- Run conclusion: `success`
- Started: `2026-09-20T23:31:18Z`
- Artifact ID: `10616740880`
- Artifact SHA-256: `80ca12c81444bbafc132baa28eb690906c101ec547961f5835573a26db6cd91d`
- Artifact retention expiry: `2026-12-19T23:31:18Z`

Run: https://github.com/uknwplayer/ARCA/actions/runs/35544888070

## Explicit live scope

This was an explicitly selected test scope, not a national default:

- UF: `SP`
- Date: `20260918`
- Modalidade ID: `6`
- Shard: `BR-UF-SP`
- Authorization confirmation: `PNCP_PUBLIC_GET_ONLY`

Hard budgets:

- max shards: `1`
- max pages: `1`
- max records: `10`
- page size: `10`
- retries: `0`

The national plan remains generic across all 27 UFs. This live proof does not establish SP or any municipality as a default jurisdiction.

## Sanitized result

The workflow emitted:

- status: `CAPTURED_AND_SEALED`
- network used: `true`
- target count: `10`
- observation count: `0`
- classifier emitted signals: `false`
- investigation ingress used: `false`
- automatic adverse publication: `false`
- human review required: `true`
- anomaly is not irregularity: `true`

Identifiers:

- plan fingerprint: `82b888103e12428b6884dd17724ba63636cfa805e1a443acdf0e2fb2e4548435`
- result hash: `61545642e051c3b976c2ed4543ab7ea4459075dbe29f52a85d7b8a9617479ed1`

## Custody result

Custody was sealed before the ephemeral runner ended.

- encrypted: `true`
- algorithm: `AES-256-GCM`
- KDF: `scrypt` with `N=16384, r=8, p=1`
- envelope hash: `721710162d3cdad2fd7aa07305d3425bbcaa0a21d0b0f01d0f8de79e326679e8`
- content root hash: `68949d5b98f38a2bbd3ab3bc3864332b9bbab89a5db75e58d23c3754a56172e0`
- payload hash: `55bf24779d9aadba7cd4856c4c698a0035b2dbdae3faf73daab38e2c2b415287`
- custody file count: `3`
- plaintext custody bytes: `21854`
- plaintext published: `false`
- sealed at: `2026-09-20T23:31:30.945Z`

The Actions secret used to derive the encryption key was masked in logs and is not recorded in this proof.

## Artifact contents

The uploaded artifact contains exactly:

- `pncp-live-custody.envelope.json`
- `pncp-live-proof.json`

The envelope contains ciphertext and public integrity metadata. The proof contains sanitized execution metadata. No raw PNCP response bytes are intentionally published as a plaintext artifact.

## What this proves

This execution proves, for the bounded scope above, that the ARCA path can:

1. pass explicit authorization and custody-secret gates;
2. perform a real public PNCP GET through the controlled live runner;
3. capture the successful response into custody before parsing;
4. derive bounded targets;
5. seal custody into an authenticated encrypted envelope;
6. upload only encrypted custody plus sanitized proof;
7. finish without classifier output, investigation ingress, or automatic adverse publication.

## What this does not prove

This proof does **not** establish that any procurement record is irregular, anomalous, fraudulent, or adverse. It does not validate autonomous classification quality. It does not authorize continuous national scanning.

The current GitHub Actions artifact is also a transport/retention bridge, not permanent evidence storage. The artifact is configured for 90-day retention. Long-term autonomous operation still requires durable private custody storage and key-management policy.

## Next gate

Before widening live collection, ARCA should add durable private custody persistence outside ephemeral Actions retention. After that, the next live stage can introduce bounded derived-change classification and route only actionable signals into the shared investigation queue while preserving the rule:

> anomaly is not irregularity; adverse conclusions require human review.
