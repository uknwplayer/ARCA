# Executor Mesh 004 — Live Verified Result Ingestion Proof

Status: **LIVE VERIFIED**

## Canonical control plane

- Repository: `uknwplayer/ARCA`
- Workflow run: `35521650527`
- Canonical commit: `79d08e928d052af2518928320f3abd5ca04df4f6`
- Job: `arca-mesh004-live-linux-004`
- Profile: `smoke`
- Local execution disabled: true
- Canonical conclusion: success

The dispatcher selected `github-satellite-linux` and created dispatch commit:

`23af2f91e9f48e3c2d7eb5922c9825472abf22dd`

## Satellite execution

- Repository: `uknwplayer/arca-execution-satellite`
- Workflow run: `35521660278`
- Conclusion: success
- Executor: `github-satellite-linux`
- Platform: Linux
- Python: 3.12.14
- Result exit code: 0
- Checks: `python-runtime`, `filesystem-write`

## Artifact evidence

- Artifact ID: `10608216646`
- Artifact name: `arca-linux-executor-result-35521660278`
- Artifact digest: `sha256:03203f9a41fd32b6999c0f4d1a9bb9de5d6602f625ef019576251d75dad3effb`
- Artifact contained exactly one `execution-result.json`.
- Request SHA-256: `0b90dc966f0f32f5129f6fc59002fc8465ae4c2502ab52917bc55ebf0e04066a`
- Claimed semantic result SHA-256: `c371d91e5bdef21933bea810597e27e93787a516f7f3f688828cc70e91c81882`
- Independent recomputation of the semantic result SHA-256 matched exactly.
- Independent recomputation of the downloaded ZIP SHA-256 matched the GitHub artifact digest exactly.

## Canonical acceptance receipt

The canonical workflow retrieved the remote result and emitted:

- Schema: `arca.executor-receipt.v0.1`
- Job ID: `arca-mesh004-live-linux-004`
- Executor: `github-satellite-linux`
- Provider family: `github-git-queue`
- Profile: `smoke`
- Result SHA-256: `c371d91e5bdef21933bea810597e27e93787a516f7f3f688828cc70e91c81882`
- Verification state: **ACCEPTED**

## Trust boundary

This proof verifies automated result ingestion, not trust promotion. The satellite executed only the bounded public profile and did not receive authority to modify Core, change executor admission/trust state, run arbitrary secret-bearing work, or self-accept its own evidence. Acceptance remained a canonical control-plane decision.

The artifact redirect fix also keeps the control-plane bearer credential scoped to GitHub API requests; the external signed artifact URL is fetched without replaying the Authorization header.

## Result

Mesh 004's required live gate is satisfied end-to-end:

`canonical dispatch -> satellite execution -> artifact retrieval -> identity/profile/schema verification -> semantic hash recomputation -> canonical ACCEPTED receipt`
