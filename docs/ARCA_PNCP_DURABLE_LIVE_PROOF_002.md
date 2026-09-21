# ARCA PNCP Durable Live Proof 002

Status: **VERIFIED CONTROLLED LIVE ACQUISITION WITH DURABLE PRIVATE CUSTODY**

This record documents the first PNCP controlled-live acquisition outside the initial SP sample that succeeded with durable private custody required before the public GET could proceed.

Only sanitized proof metadata is recorded here. No plaintext custody bytes, ciphertext payload, private-vault repository name, credential, token or passphrase is published.

## Execution identity

- Public control plane revision: `b20e377f8b9b4f7831e3b4b3877913a5c35ac09e`
- GitHub Actions run: `35547609136`
- Workflow: `.github/workflows/arca-pncp-controlled-live-probe.yml`
- Event: `workflow_dispatch`
- Conclusion: `success`
- Artifact ID: `10617290889`
- Artifact SHA-256: `5b3bc63aa747bd32a5cc2a6af0c9740ed46c16abbb16f085411aebc9a22a3c1b`

Run: https://github.com/uknwplayer/ARCA/actions/runs/35547609136

## Explicit live scope

This was an explicit one-shard test scope, not a default jurisdiction:

- UF: `AP`
- Date: `20260918`
- Modalidade ID: `6`
- Shard: `BR-UF-AP`
- Authorization confirmation: `PNCP_PUBLIC_GET_ONLY`

Hard budgets:

- max shards: `1`
- max pages: `1`
- max records: `10`
- page size: `10`
- retries: `0`
- network timeout: `30000 ms`

The national plan remains generic across all 27 UFs.

## Sanitized acquisition result

The workflow emitted:

- status: `CAPTURED_AND_SEALED`
- network used: `true`
- target count: `2`
- observation count: `0`
- classifier emitted signals: `false`
- investigation ingress used: `false`
- automatic adverse publication: `false`
- human review required: `true`
- anomaly is not irregularity: `true`

Identifiers:

- plan fingerprint: `82b888103e12428b6884dd17724ba63636cfa805e1a443acdf0e2fb2e4548435`
- result hash: `748f89ff89c53a1379d4df451aa318f61d97fb33d3ce976701137807ee051021`

## Custody result

Custody was captured before parsing, sealed locally, then persisted to the durable private backend before the workflow returned success.

- encrypted: `true`
- envelope hash: `c707689e04d7bd091a59555d883a2d2a4d716b442b485d8b3b55efa1c65c6202`
- content root hash: `2155ee7ce33a99e1ecd12f1fc36a6b0ca135947e73ceb1806b6f899c56cf2c2b`
- payload hash: `2fe19f06df41b8af5a384193c90a07df7eb01a768eb050be6e7a71934685b78c`
- file count: `3`
- plaintext custody bytes represented inside encrypted payload: `6289`
- plaintext published: `false`
- durable custody required: `true`
- durable custody status: `STORED_PRIVATE`
- durable receipt hash: `ad1fd3f1c3e09637f48f8e387f47f518392246cb30338704e914bac99028e19b`
- vault commit reference hash: `270f2268c805a08816a7453af8182221601443a0cefb31937606f0379578d1d4`
- plaintext stored in durable backend: `false`

The private backend advanced exactly one non-forced commit from the prior custody head. The SHA-256 of that private commit identifier equals the public `vaultCommitRefHash` above.

## Artifact contents

The fallback artifact contains:

- `pncp-live-custody.envelope.json`
- `pncp-live-proof.json`

The artifact is retained for 90 days as a fallback/transport copy. The durable private custody no longer depends on that artifact retention.

## What this proves

For the AP test shard, ARCA demonstrated that:

1. authorization and secret checks passed;
2. the private durable custody backend passed preflight before the PNCP acquisition path;
3. a real public PNCP GET succeeded;
4. the response was captured before parsing;
5. bounded targets were derived;
6. the custody set was sealed into an authenticated encrypted envelope;
7. the encrypted envelope and durable receipt were committed to private persistence before success;
8. the resulting private commit can be verified through a public hash reference without revealing its location;
9. no classifier output, investigative ingress or automatic adverse publication occurred.

## Prior availability observations

Two preceding controlled attempts against other UFs failed safely before any durable write:

- `AC`: network timeout at the configured 30-second bound;
- `AL`: transport-level `fetch failed` before a usable HTTP response.

Those failures did not advance the private custody head and therefore did not create partial custody state.

They are source-availability observations only. They are not evidence of procurement irregularity.

## Next gate

This proof closes the durable-custody prerequisite for a single live shard.

The next stage should stop treating source unavailability as a terminal workflow failure and instead model it as a bounded observer outcome such as `SOURCE_UNAVAILABLE`, allowing a national scheduler to continue to later shards without equating source failure with irregularity.

Before widening live coverage, that availability path should be tested offline and under strict per-run shard/failure budgets.
