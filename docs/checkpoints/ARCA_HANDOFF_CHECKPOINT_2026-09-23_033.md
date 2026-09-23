# ARCA — Checkpoint 033: Vince V5 Termux A/B Live Proof 010

Data: **2026-09-23**.

Estado: **VINCE V5 TERMUX A/B LIVE-PROVEN; SELEÇÃO A→B PROVADA; ZERO DISPATCH; WORK OPCIONAL; REPLIT SOMENTE HISTÓRICO; EDGE STEWARD CONGELADO**.

## Gate

Issue pré-registrada: #143 — `Vince V5 Probe 010 — Termux A/B signed presence routing`.

Fundação:
- PR #144 — V5 Termux A/B;
- PR #146 — pin explícito do worker B.

## Identidades

A:
- `vince-termux-android-1`
- fingerprint `c6e1853d99e52875bd7bf019237ea470f1dc166a345d0a359408e39e0ec120b1`

B:
- `vince-termux-android-2`
- fingerprint `52c4131a111f7aab509556af7efc574afe326898bd8ae75742882028742cacc0`

As chaves privadas permaneceram somente no Termux.

## Fase 1

Presença B READY:
- observedAt `2026-09-23T09:17:15.057Z`
- SHA-256 `1e2358be85bb24547c30617bd328edce8a146232acc21fdb7553d85ae8c4182d`

Presença A READY:
- observedAt `2026-09-23T09:17:31.521Z`
- SHA-256 `c271d7214007ff0b2709f72873e91cc0c1a5f19e4b66a754dccb31fa8efd3acf`

Seleção em `2026-09-23T09:19:36.274Z`:
- A AVAILABLE;
- B AVAILABLE;
- candidatos: 2;
- elegíveis: 2;
- selecionado: `vince-termux-android-1`;
- dispatch: false.

## Fase 2

A publicou WITHDRAWN:
- observedAt `2026-09-23T09:21:06.166Z`
- SHA-256 `1333d57c5f6704bb7ac86cab8a6b2e469cc7e7798a4a4cf145224aa7537f9529`

Seleção em `2026-09-23T09:22:11.190Z`:
- A `INCONCLUSIVE / SIGNED_PRESENCE_WITHDRAWN`;
- B `AVAILABLE / CRYPTOGRAPHIC_READY_LEASE`;
- candidatos: 2;
- elegíveis: 1;
- selecionado: `vince-termux-android-2`;
- dispatch: false.

## Conclusão técnica

Foi provado failover **lógico de rota** entre duas identidades Termux independentes. O Vince não depende de Work ou Replit para essa função.

Não foi provado:
- failover físico do aparelho;
- serviço 24/7;
- daemon;
- dispatch automático;
- execução pós-seleção;
- redundância multi-dispositivo.

## Evidência

- `docs/ARCA_VINCE_V5_TERMUX_AB_LIVE_PROOF_010.md`
- `artifacts/vince-v5-termux-ab-live-proof-010.json`

## Próximo gate recomendado

Combinar as duas provas já existentes:

`V5 selection → one-shot git-status → V4.1.1 Ed25519 verification → durable challenge consumption`.

Condições:
- um único endpoint selecionado;
- um único request;
- sem retry automático;
- sem failover automático;
- nenhuma segunda execução sem reconciliação explícita;
- nenhuma ampliação de capability além de `git-status`;
- Edge Steward continua congelado.
