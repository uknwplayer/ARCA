# ARCA — Vince V4.1 Termux Live Proof 006

Status: **VERIFIED / PINNED ED25519 REMOTE ATTESTATION**.

Data: **2026-09-23**.

## Controle

- canonical ARCA revision observed by worker: `11f07a0debc60af113c9f3e3951d055e1d170250`
- live probe issue: #130 — closed completed
- verification workflow: `35830210570` — success
- verification job: `107080816772` — success
- proof artifact id: `10736243638`
- proof artifact digest: `sha256:8befb3a38d9a6f7c9fea080bbfce2992c21d07ebf86917327430e1f287a8d2c9`

## Worker

- runtime: Android / Termux
- nodeId: `vince-termux-android-1`
- algorithm: `Ed25519`
- pinned fingerprint: `c6e1853d99e52875bd7bf019237ea470f1dc166a345d0a359408e39e0ec120b1`
- public identity source blob: `90a26eca42bb76fe0cb1abb6b6eca69e12ae3708`

The SPKI fingerprint was independently recomputed before pinning.

The private key remained local to the Android device and was never stored in GitHub or printed by the worker.

## Request

Mission:

`vince-v41-termux-live-006`

Action:

`git-status`

Request SHA-256:

`7874056b43bc02e545da44d5d2bdb82f031f9a5b31e1961b2c41d264d211665a`

Challenge:

32-byte base64url challenge, correlated exactly between request and result.

Automatic retry and failover were disabled.

## Remote execution result

The Termux worker returned:

- status: `completed`
- exitCode: `0`
- timedOut: `false`
- stdoutTruncated: `false`
- stderrTruncated: `false`
- gitBranch: `main`
- gitHead: `11f07a0debc60af113c9f3e3951d055e1d170250`
- gitDirty: `false`
- result SHA-256:
  `30e869b62157178b1fabf245b80a0d2e49e759daa125f52bb58959518ccf3de6`

## Attestation verification

The canonical verifier required:

1. exact request/result correlation;
2. canonical request SHA-256;
3. canonical result SHA-256;
4. exact pinned nodeId;
5. exact pinned SPKI;
6. exact pinned SPKI fingerprint;
7. Ed25519 signature over the V4.1 signature domain and canonical payload;
8. successful `git-status`;
9. zero timeout/truncation;
10. no authority expansion.

Final state:

`ATTESTED_VERIFIED_RESULT`

Proof SHA-256:

`5112d8a007da47d94beb2e1a3d98d3f506a19c4a538f3502032dad16aa3bfd2a`

The following were independently recomputed outside the workflow and matched exactly:

- request hash;
- result hash;
- SPKI fingerprint;
- Ed25519 signature;
- proof hash.

## Authority

The verified proof records:

- `automaticRetryPerformed=false`
- `failoverAuthorized=false`
- `authorityExpanded=false`
- `coreMutationPerformed=false`
- `trustModified=false`

This execution did not reactivate the Edge Steward and did not create a background service.

## Replay notes

The Termux worker keeps a local durable challenge ledger and records the challenge after publishing the result.

The accepted proof was also recorded in the dedicated channel at:

`remote-jobs/v4.1/accepted/vince-v41-termux-live-006.json`

The current GitHub verifier uses an in-process challenge ledger during a verification run. Therefore the cryptographic attestation and worker-side replay protection are proven, while **durable control-plane rejection of re-verifying an already accepted proof remains a hardening item**.

This does not permit a second worker execution, because the Termux worker's local ledger rejects the consumed challenge. It only means a previously signed result could still be re-verified by a fresh verifier run unless the accepted-proof registry is consulted automatically.

## Correct interpretation

This proof establishes:

```text
GitHub request
  -> Android/Termux one-shot
  -> pinned Ed25519 worker identity
  -> git-status
  -> signed result
  -> GitHub channel
  -> canonical verification
  -> ATTESTED_VERIFIED_RESULT
```

It does **not** establish:

- persistent 24/7 execution;
- Edge Steward activation;
- arbitrary shell execution;
- automatic trust expansion;
- merge or main-write authority;
- investigative source access;
- production readiness.
