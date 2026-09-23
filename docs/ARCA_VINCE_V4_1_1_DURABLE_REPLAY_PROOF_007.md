# ARCA — Vince V4.1.1 Durable Replay Proof 007

Status: **VERIFIED / DURABLE CONTROL-PLANE REPLAY REJECTION**.

Data: **2026-09-23**.

## Controle

- implementation PR: #134 — merged
- implementation commit: `384895a7174d1643b987eb124c60592e9a986499`
- trigger PR: #135 — merged
- trigger commit: `ed892ba47057f39608028a7032636c0a756802f5`
- implementation post-merge CI: `35831965058` — success
- trigger post-merge CI: `35832162156` — success
- replay proof workflow: `35832175245` — success
- replay proof job: `107087091665` — success
- historical mission: `vince-v41-termux-live-006`

## Durable registry

The control plane now persists accepted V4.1 challenges in the dedicated Termux channel:

`remote-jobs/v4.1/control/accepted-challenges.json`

Bootstrap commit:

`27cd38173566f5c45ccbd3673e196b6b5bcf6457`

The first durable entry migrates the already accepted live proof 006 and records:

- challenge SHA-256: `e64bc409b87cb7abb175f51c84de48651af29c94c4beb8ca294e79c6a9da59cd`
- request SHA-256: `7874056b43bc02e545da44d5d2bdb82f031f9a5b31e1961b2c41d264d211665a`
- result SHA-256: `30e869b62157178b1fabf245b80a0d2e49e759daa125f52bb58959518ccf3de6`
- proof SHA-256: `5112d8a007da47d94beb2e1a3d98d3f506a19c4a538f3502032dad16aa3bfd2a`
- worker node: `vince-termux-android-1`
- pinned fingerprint: `c6e1853d99e52875bd7bf019237ea470f1dc166a345d0a359408e39e0ec120b1`

No private key is stored in the registry.

## V4.1.1 acceptance protocol

A new acceptance path now:

1. loads and validates the durable accepted-challenge registry;
2. rejects an already consumed challenge before cryptographic re-verification;
3. verifies the pinned V4.1 Ed25519 result when the challenge is fresh;
4. builds the next registry state;
5. updates the GitHub blob using the current blob SHA as a compare-and-swap precondition;
6. reads the persisted registry back;
7. confirms exact challenge/proof correlation;
8. only then emits final `ATTESTED_VERIFIED_RESULT`.

The pre-commit stage emits only:

`ATTESTATION_VALID_PENDING_DURABLE_CONSUMPTION`

This avoids treating a cryptographically valid result as durably consumed before the control-plane write succeeds.

## Live replay proof

The proof workflow intentionally re-submitted the historical request/result pair from mission 006 to a fresh verifier process.

Observed log:

`Error: VINCE_V41_CHALLENGE_REPLAY`

Final proof marker:

`{"status":"DURABLE_REPLAY_REJECTED","missionId":"vince-v41-termux-live-006","workerReexecuted":false,"registryDurable":true}`

The workflow completed successfully because replay rejection was the expected result.

## Security consequence

This closes the V4.1 control-plane replay gap recorded by checkpoint 029:

- replay rejection survives verifier process restart;
- the historical accepted proof cannot be accepted a second time by a fresh verifier;
- the Termux worker was not executed again;
- worker authority was not expanded;
- Edge Steward remains frozen;
- no Portal/PNCP access occurred;
- no arbitrary shell capability was introduced.

The compare-and-swap write is sufficient for the current one-shot GitHub control path: concurrent writers starting from the same registry blob SHA cannot both successfully replace that same state. This is not presented as a general distributed-consensus protocol.

## Correct interpretation

V4.1.1 proves:

```text
accepted proof
  -> durable challenge registry
  -> fresh verifier process
  -> registry lookup
  -> replay detected
  -> fail closed
  -> no worker re-execution
```

Together with proof 006, the verified path is now:

```text
GitHub request
  -> Android/Termux one-shot
  -> pinned Ed25519 signature
  -> GitHub result
  -> cryptographic verification
  -> durable challenge consumption
  -> future replay rejected
```

It does **not** establish persistent 24/7 execution, arbitrary commands, autonomous trust expansion, production readiness, or Edge Steward activation.

## Next Vince gate

The next functional step is **V5 — endpoint availability/routing**:

- represent candidate execution endpoints with observed availability state;
- distinguish `AVAILABLE`, `UNREACHABLE` and `INCONCLUSIVE` from self-claims;
- require recent ACK/evidence before routing;
- keep failover/retry policy explicit;
- treat ChatGPT Work as a candidate until an event-trigger ACK is canonically proven.
