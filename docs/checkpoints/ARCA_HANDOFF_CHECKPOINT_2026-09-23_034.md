# ARCA — Checkpoint 034: Vince Probe 011 Selected One-Shot Live Proof

Data: **2026-09-23**.

Estado: **VINCE V5→V4.1.1 SELECTED ONE-SHOT LIVE-PROVEN; B EXECUTOU 1 GIT-STATUS; ATTESTATION ED25519 VALIDADA; CHALLENGE CONSUMIDO POR CAS; REPLAY REJEITADO SEM REEXECUÇÃO**.

## Gate

Issue: #150.

Fundação integrada:
- PR #151;
- commit `88a8ce42fabf8dd8814c78842a9570b3327728ca`;
- CI da PR #321: success;
- CI pós-merge #322: success.

## Seleção V5

A:
- `vince-termux-android-1`;
- estado `WITHDRAWN`;
- não elegível.

B:
- `vince-termux-android-2`;
- estado `AVAILABLE`;
- fingerprint `52c4131a111f7aab509556af7efc574afe326898bd8ae75742882028742cacc0`.

Route:
- candidateCount: 2;
- eligibleCount: 1;
- selectedEndpointId: `vince-termux-android-2`;
- route proof SHA-256: `39a68b500a6f91c00d1c5aecfcacc408b6d416b77f276f1aee784df1cc56c721`.

## Dispatch

Mission:
`vince-v41-v5-selected-live-011`

Request:
- action: `git-status`;
- SHA-256: `e6fe5cfb8f2df3f2dde12e8a9dd31b4cef5c00a48388c7d6c9af2623762ce0ec`.

Dispatch:
- selecionado: B;
- SHA-256: `e9a8f79b0ee421bd51ff88cab29b36f81c58723ba7c0b6134be7fc62df747532`;
- exactlyOneEligibleRequired: true;
- automaticRetryAllowed: false;
- automaticFailoverAllowed: false.

## Execução

B executou um único `git-status`.

Resultado:
- SHA-256: `f01be6a3d6b31d143d6c11094ab0a2903d0bd8a83e4fed1247d3e7a795e471e6`;
- git HEAD: `88a8ce42fabf8dd8814c78842a9570b3327728ca`;
- branch: `main`;
- dirty: false;
- exitCode: 0.

## Attestation e consumo

- attestation proof SHA-256: `6c4f1915c6d369be62e29ff844d779fafdcd289be25e2a128a2c07439982b5cc`;
- challenge SHA-256: `be3bcb7f25e8fe56567d1d84473e895ee8a9c8bc09078a988fe125754ecb5f8e`;
- registry blob após CAS/read-back: `b18090023ec01f292a1216d07a989ecdd87de779`;
- acceptance SHA-256: `7fa32564fcf88461e26daf0a92f6efd74d3154b7f6e2bce93aee189dfbaf16a0`.

## Replay

Resultado:
- `DURABLE_REPLAY_REJECTED`;
- workerNodeId: `vince-termux-android-2`;
- workerReexecuted: false;
- registryDurable: true.

## Conclusão

O Vince agora tem prova live integrada de:

`seleção → dispatch pinado → execução allowlisted → resultado Ed25519 → consumo durável → replay rejeitado`.

Work e Replit não participam do caminho operacional. GitHub Actions foi apenas CI. Edge Steward continua congelado.

## Limites

Ainda não há:
- failover físico multi-device;
- daemon 24/7;
- retry/failover automático pós-dispatch;
- resiliência à perda do telefone;
- shell genérico;
- autoridade de trust/main/publicação.

## Próximo gate recomendado

Antes de ampliar capabilities, provar **redundância física real** em outro dispositivo/host ou, se a prioridade continuar no núcleo investigativo, retornar ao M5 live sem reativar Edge Steward.

Não ampliar de `git-status` para shell arbitrário.

## Evidência

- `docs/ARCA_VINCE_V5_V411_LIVE_PROOF_011.md`;
- `artifacts/vince-v5-v411-live-proof-011.json`.
