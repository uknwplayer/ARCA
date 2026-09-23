# ARCA — Checkpoint 029: Vince V4.1 Termux Live Attestation Proof 006

Data: **2026-09-23**.

Estado: **VINCE V4.1 LIVE-PROVEN EM ANDROID/TERMUX COM IDENTIDADE ED25519 PINADA; RESULTADO ASSINADO E VERIFICADO; EDGE STEWARD CONTINUA CONGELADO**.

Main de entrada: `11f07a0debc60af113c9f3e3951d055e1d170250`.

Issue: #130 — completed.

Verification run: `35830210570` — success.

Verification job: `107080816772` — success.

Proof artifact id: `10736243638`.

Proof document: [ARCA_VINCE_V4_1_TERMUX_LIVE_PROOF_006.md](../ARCA_VINCE_V4_1_TERMUX_LIVE_PROOF_006.md).

## Resultado

A primeira missão V4.1 em Android/Termux foi concluída e criptograficamente atestada.

Fluxo:

```text
ARCA/GitHub
 -> request V4.1 + challenge
 -> Termux one-shot
 -> git-status
 -> Ed25519 signed result
 -> dedicated GitHub channel
 -> pinned verifier
 -> ATTESTED_VERIFIED_RESULT
```

Worker:

- `vince-termux-android-1`
- fingerprint:
  `c6e1853d99e52875bd7bf019237ea470f1dc166a345d0a359408e39e0ec120b1`

Hashes:

- request:
  `7874056b43bc02e545da44d5d2bdb82f031f9a5b31e1961b2c41d264d211665a`
- result:
  `30e869b62157178b1fabf245b80a0d2e49e759daa125f52bb58959518ccf3de6`
- proof:
  `5112d8a007da47d94beb2e1a3d98d3f506a19c4a538f3502032dad16aa3bfd2a`

The worker observed canonical ARCA HEAD:

`11f07a0debc60af113c9f3e3951d055e1d170250`

Independent recomputation matched request hash, result hash, SPKI fingerprint, Ed25519 signature and proof hash.

## Security properties observed

- private key remained local to Termux;
- public identity was reviewed and pinned before dispatch;
- action restricted to `git-status`;
- no shell;
- no daemon;
- no retry;
- no failover;
- no trust modification;
- no core mutation;
- no authority expansion;
- no Portal/PNCP access.

## Replay state

The worker has a local durable challenge ledger and the accepted proof is recorded in the dedicated channel.

Hardening still pending: make the GitHub verifier automatically consult a durable accepted-challenge registry before accepting the same proof again. Current verifier's challenge ledger is process-local.

This is a verifier replay-hardening issue, not a duplicate worker execution issue.

## Architectural consequence

V4.1 no longer depends on Replit for strong remote attestation.

The ARCA now has two heterogeneous external execution paths:

1. Replit — V4 transport/execute/return live-proven, without worker attestation;
2. Android/Termux — V4.1 transport/execute/return + pinned Ed25519 attestation live-proven.

Replit remains useful but is no longer a dependency for V4.1.

## Next recommended Vince gate

**V4.1.1 — durable control-plane challenge consumption.**

Goal:

- accepted challenge registry is checked before verification;
- successful verification records consumption atomically enough for the one-shot control path;
- repeated verifier invocation of the same accepted proof fails closed;
- no worker re-execution is required.

After V4.1.1, a natural next functional step is V5 endpoint availability/routing.

## Other gates

Portal remains without a fourth GET authorization.

Edge Steward remains frozen.
