# ARCA — Vince Probe 011 Live Proof

Status: **LIVE-PROVEN / SELECTED ONE-SHOT EXECUTION / DURABLE REPLAY REJECTION**.

Data: **2026-09-23**. Issue: **#150**.

## Resultado

O Probe 011 integrou com sucesso a seleção V5 à execução V4.1.1:

`V5 route → 1 elegível → dispatch pinado → 1 git-status → resultado Ed25519 → consumo durável → replay rejeitado`.

## Seleção

- candidatos: 2;
- elegíveis: 1;
- A: `WITHDRAWN`;
- B: `AVAILABLE`;
- selecionado: `vince-termux-android-2`;
- route proof SHA-256: `39a68b500a6f91c00d1c5aecfcacc408b6d416b77f276f1aee784df1cc56c721`.

## Request e dispatch

Request:
- ação: `git-status`;
- request SHA-256: `e6fe5cfb8f2df3f2dde12e8a9dd31b4cef5c00a48388c7d6c9af2623762ce0ec`.

Dispatch:
- selecionado: `vince-termux-android-2`;
- fingerprint: `52c4131a111f7aab509556af7efc574afe326898bd8ae75742882028742cacc0`;
- dispatch SHA-256: `e9a8f79b0ee421bd51ff88cab29b36f81c58723ba7c0b6134be7fc62df747532`;
- retry automático: false;
- failover automático: false;
- exatamente um elegível exigido: true.

## Execução one-shot

B executou exatamente uma missão permitida.

Resultado:
- result SHA-256: `f01be6a3d6b31d143d6c11094ab0a2903d0bd8a83e4fed1247d3e7a795e471e6`;
- branch: `main`;
- HEAD: `88a8ce42fabf8dd8814c78842a9570b3327728ca`;
- dirty: false;
- exitCode: 0;
- timeout: false;
- saída truncada: false.

O resultado foi assinado pela identidade Ed25519 pinada de B.

## Consumo durável

O verificador confirmou:
- seleção ↔ worker;
- request ↔ dispatch;
- request ↔ result;
- pin ↔ identidade;
- assinatura Ed25519;
- challenge ainda não consumido.

Depois atualizou o registry V4.1.1 com CAS e read-after-write.

Acceptance:
- attestation proof SHA-256: `6c4f1915c6d369be62e29ff844d779fafdcd289be25e2a128a2c07439982b5cc`;
- challenge SHA-256: `be3bcb7f25e8fe56567d1d84473e895ee8a9c8bc09078a988fe125754ecb5f8e`;
- registry blob SHA: `b18090023ec01f292a1216d07a989ecdd87de779`;
- acceptance SHA-256: `7fa32564fcf88461e26daf0a92f6efd74d3154b7f6e2bce93aee189dfbaf16a0`.

## Replay

O comando `replay-check` retornou:

- `DURABLE_REPLAY_REJECTED`;
- worker: `vince-termux-android-2`;
- `workerReexecuted:false`;
- `registryDurable:true`.

Portanto o mesmo challenge não foi aceito novamente e B não foi reexecutado.

## Dependências e autoridade

No caminho operacional:
- Work não foi usado;
- Replit não foi usado;
- GitHub Actions não foi executor;
- Edge Steward permaneceu congelado;
- nenhuma autoridade foi ampliada;
- nenhum shell arbitrário foi liberado;
- capability permaneceu somente `git-status`.

## O que foi provado

Foi provado que o Vince consegue:
1. escolher um worker elegível;
2. vincular criptograficamente o dispatch à seleção e ao request;
3. impedir execução por identidade errada;
4. executar uma missão allowlisted uma única vez;
5. verificar o resultado assinado;
6. consumir o challenge de modo durável;
7. rejeitar replay sem reexecutar o worker.

## Limites

Ainda não foi provado:
- failover físico entre aparelhos;
- serviço 24/7;
- daemon persistente;
- retry/failover automático seguro após dispatch;
- resiliência à perda do telefone;
- execução concorrente multi-device.

Evidência estruturada: `artifacts/vince-v5-v411-live-proof-011.json`.
