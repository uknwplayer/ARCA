# ARCA — Vince V4 Live Proof 005 — GitHub → Replit → GitHub

Status: **VERIFIED HETEROGENEOUS TRANSPORT/EXECUTION/RETURN**.

Data: **2026-09-23**.

## Scope

This proof covers one bounded synthetic mission:

- job: `vince-v4-live-005`
- action: `git-status`
- control plane: canonical ARCA / GitHub
- remote runtime: Replit
- transport: GitHub Contents channel V4
- request channel: `remote-jobs/v4/requests`
- result channel: `remote-jobs/v4/results`
- channel branch: `vince-v4-channel`

No PNCP/Portal access, arbitrary shell, secrets, retry, failover, trust mutation or core mutation was allowed.

## Request

Canonical request SHA-256:

`c0699f366877a97793330b3587c2c4b7742a66d2f2be4d1a835a2800ecaede32`

The request was created only after retiring the inconclusive job 004 from the active queue.

## Replit execution

The isolated Replit worker executed exactly one `vince:v4:once` cycle.

Observed worker report:

- discovered: 1
- completed: 1
- ignored: 0
- rejected: 0
- process ended after one cycle

Remote result:

- status: `completed`
- exitCode: `0`
- timedOut: `false`
- output truncated: `false`
- git branch: `feat/aie-0.4-foundation`
- git HEAD: `8055e6ba7e8ad9140a0f69146e61216efc895a90`
- gitDirty: `false`

Result SHA-256:

`3ded72842a195693d90664ff644f0309742a7331e4c735f2f44d51b3b83dd2e7`

## Independent verification

The ARCA V4 verifier independently checks:

- request schema/version and exact allowlisted action;
- expiry at execution time;
- request canonical hash;
- result schema/version;
- job/action correlation;
- result canonical hash;
- valid timestamps;
- successful exit;
- no timeout;
- no truncation;
- Git branch/HEAD/dirty provenance.

The canonical V4 proof hash is:

`4b4bdc2fe101ba502cdb42a2dd9244bafed997c17581a2f8c3959702987a9e39`

## What this proves

For this specific route:

```text
canonical ARCA / GitHub
    -> V4 request
    -> Replit independent runtime
    -> allowlisted git-status
    -> V4 result
    -> GitHub return channel
    -> ARCA canonical hash/correlation verification
```

This is the first live heterogeneous Vince V4 transport/execution/return proof.

## Limits

This does **not** prove:

- cryptographic worker attestation;
- persistent Replit worker identity;
- global exactly-once semantics;
- distributed claim/lease;
- arbitrary task execution;
- production readiness;
- automatic trust/admission.

The V4 proof explicitly records:

`cryptographicWorkerAttestation=false`

A future V4.1 may add persistent remote identity/signature and a challenge-response binding without widening the action allowlist.
