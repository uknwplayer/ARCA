# ARCA — Vince V4.1 Termux Live Probe 006 Gate

Status: **PINNED IDENTITY / REQUEST NOT YET DISPATCHED**.

Worker public identity reviewed from the dedicated channel:

- nodeId: `vince-termux-android-1`
- algorithm: `Ed25519`
- key fingerprint: `c6e1853d99e52875bd7bf019237ea470f1dc166a345d0a359408e39e0ec120b1`
- source blob: `90a26eca42bb76fe0cb1abb6b6eca69e12ae3708`

The fingerprint was independently recomputed from the published SPKI bytes before pinning.

Canonical pin:

`config/vince-v4.1/trusted-workers/vince-termux-android-1.json`

The verifier rejects any result whose nodeId, SPKI or fingerprint differs from this pin, even if another Ed25519 signature is otherwise valid.

## Mission

Planned job id:

`vince-v41-termux-live-006`

Action:

`git-status`

The request will be written only to the dedicated branch:

`vince-v41-termux-channel`

No request is written by this gate PR.

## Verification

After the Android worker publishes the signed result, issue #130 can trigger:

`ARCA_VINCE_V41_TERMUX_VERIFY_006`

The workflow:

1. checks out canonical ARCA;
2. fetches only the dedicated channel branch;
3. materializes the exact request/result pair;
4. verifies request hash, result hash, challenge correlation, pinned identity, Ed25519 signature and policy;
5. emits an attestation proof artifact.

No retry, failover, trust modification, core mutation or main write is performed.
