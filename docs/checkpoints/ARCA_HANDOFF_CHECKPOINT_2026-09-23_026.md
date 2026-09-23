# ARCA — Checkpoint 026: Vince V4 Live Proof 005

Data: **2026-09-23**.

Estado: **VINCE V4 LIVE-PROVEN LIMITADO ENTRE GITHUB/ARCA E REPLIT; TRANSPORTE + EXECUÇÃO + RETORNO VERIFICADOS; ATTESTATION CRIPTOGRÁFICA DO WORKER AINDA PENDENTE**.

Main de entrada: `587a29672b5aa3d89bfa0754cd24ddb3c8743ed6`.

PR de prova: #124.

CI da prova: `35814497158` — success.

Issue live: #121 — fechada/completed.

Prova detalhada: [ARCA_VINCE_V4_LIVE_PROOF_005.md](../ARCA_VINCE_V4_LIVE_PROOF_005.md).

## Resultado

A missão pública/sintética `vince-v4-live-005` atravessou dois ambientes operacionais diferentes:

```text
ARCA / GitHub control plane
    -> dedicated V4 queue
    -> Replit isolated one-shot worker
    -> allowlisted git-status
    -> structured result
    -> GitHub V4 result channel
    -> canonical ARCA verifier
    -> VERIFIED_RESULT
```

Request:

- job: `vince-v4-live-005`;
- action: `git-status`;
- request SHA-256: `c0699f366877a97793330b3587c2c4b7742a66d2f2be4d1a835a2800ecaede32`.

Remote Replit result:

- status: `completed`;
- exitCode: `0`;
- timedOut: `false`;
- stdout/stderr truncated: `false`;
- git branch: `feat/aie-0.4-foundation`;
- git HEAD: `8055e6ba7e8ad9140a0f69146e61216efc895a90`;
- gitDirty: `false`;
- result SHA-256: `3ded72842a195693d90664ff644f0309742a7331e4c735f2f44d51b3b83dd2e7`.

Canonical ARCA V4 proof:

`daea9c2cb9bf6cb25aa947ac16fd6af8b83a016ff8e8235b031a657b6e80e95e`

The canonical verifier independently recomputed request/result hashes and checked exact correlation, timestamps, success status and Git provenance.

## Worker behavior

The Replit worker executed one isolated cycle:

- discovered: 1;
- completed: 1;
- ignored: 0;
- rejected: 0;
- process exited after one cycle.

The worker is not a daemon and does not start with the Workbench.

Dedicated transport:

- repository: `uknwplayer/ARCA`;
- branch: `vince-v4-channel`;
- requests: `remote-jobs/v4/requests`;
- results: `remote-jobs/v4/results`.

## Probe 004 history

Probe 004 remains historical/inconclusive:

- request was read;
- local `git-status` executed;
- result PUT failed HTTP 403;
- no result was accepted;
- no retry/failover occurred;
- job 004 was retired rather than rerun.

The GitHub integration was then corrected to a connection reporting `push:true`; job 005 used a fresh job ID.

## Security / interpretation

The V4 proof records:

- `cryptographicWorkerAttestation=false`;
- `automaticRetryPerformed=false`;
- `failoverAuthorized=false`;
- `authorityExpanded=false`;
- `coreMutationPerformed=false`;
- `trustModified=false`.

Therefore this proves **heterogeneous transport/execution/return**, not strong independent attestation of the Replit worker.

Do not claim:

- persistent cryptographic Replit identity;
- globally exactly-once execution;
- distributed claim/lease;
- arbitrary task execution;
- production readiness;
- automatic trust/admission.

## Next gate

Recommended V4.1:

- persistent remote worker identity;
- challenge/nonce bound to each mission;
- worker-side signed result/receipt;
- explicit trust pinning in canonical ARCA;
- keep first action allowlist narrow;
- prove tampered/replayed result rejection.

V3.2 signed recovery identity remains implemented/tested offline.

Portal remains without fourth GET authorization.

Edge Steward remains frozen.
