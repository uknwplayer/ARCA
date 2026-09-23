# ARCA — Checkpoint 025: Vince V4 heterogêneo preparado; tentativa 004 inconclusiva por autorização de escrita

Data: **2026-09-23**.

Estado: **V4 GATE + VERIFICADOR CANÔNICOS; REPLIT WORKER ISOLADO IMPLEMENTADO; PRIMEIRA TENTATIVA LEU/EXECUTOU LOCALMENTE MAS NÃO PUBLICOU RESULTADO POR HTTP 403; NENHUM RETRY/FAILOVER**.

Main de entrada: `1fb944d63f2f4f2583b4cfaf203c8cd12dddac11`.

## Entregas canônicas

### V4 Gate

PR #120 integrou:

`docs/ARCA_VINCE_V4_HETEROGENEOUS_EXECUTION_GATE_V0_1.md`

CI da PR: `35813091513` — success.

CI pós-merge: `35813197758` — success.

O gate exige primeira missão V4 restrita a `git-status`, canal dedicado, sem shell arbitrário, sem secrets, sem retry/failover e sem declaração de attestation criptográfica forte.

### V4 verifier

PR #122 integrou:

`src/machine-bridge/vince-v4-replit.mjs`

`tests/vince-v4-replit.test.mjs`

CI da PR: `35813379118` — success.

CI pós-merge: `35813475322` — success.

O verificador:

- recalcula SHA-256 canônico da request;
- recalcula SHA-256 canônico do result;
- exige correlação exata de job/action/request hash;
- exige `git-status` concluído, sem timeout/truncation;
- valida branch/HEAD/gitDirty;
- gera `arca.vince-v4-heterogeneous-proof.v0.1`;
- registra `cryptographicWorkerAttestation=false`;
- não concede trust, retry, failover ou mutação do Core.

## Worker Replit

App identificado:

`ARCA Core v1 Foundation`

Modo V4 isolado implementado:

- requests: `remote-jobs/v4/requests`;
- results: `remote-jobs/v4/results`;
- request format: `arca-vince-v4-job`, protocolVersion 4;
- única ação: `git-status`;
- result format: `arca-vince-v4-result`;
- hashes canônicos SHA-256;
- provenance: gitBranch/gitHead/gitDirty;
- ledger local: `.arca-vince-v4/processed.json`;
- ciclo único: `npm run vince:v4:once`;
- não inicia junto do Workbench;
- não processa canais v1/v2.

O default V4 foi migrado do repositório legado arquivado para:

- repository: `uknwplayer/ARCA`;
- branch: `vince-v4-channel`.

## Live Probe 004

Issue: #121.

Request:

- job: `vince-v4-live-004`;
- action: `git-status`;
- request SHA-256: `93bcf2ebac650d8b61e95d2cbda9a482392b240c5354239279f29f9701b6af07`;
- request commit: `474f6774208d79bc7f901ceaf07086a9a6cbe9c9`.

Resultado operacional:

1. Replit leu a request;
2. Replit executou o passo local allowlisted `git-status`;
3. tentativa de PUT do resultado em `uknwplayer/ARCA` / `vince-v4-channel` retornou HTTP 403;
4. erro: `Resource not accessible by personal access token`;
5. nenhum arquivo de resultado foi criado;
6. ledger V4 não marcou o job como processado;
7. processo one-shot encerrou com exit code 1;
8. nenhum retry/failover ocorreu.

Classificação correta:

**INCONCLUSIVE_TRANSPORT_AUTHORIZATION_AFTER_LOCAL_EXECUTION**

Não declarar V4 live-proven ainda.

## Bloqueio atual

O token/conexão GitHub usada pelo Replit possui leitura suficiente para consumir a request, mas não escrita de Contents no repositório canônico.

A correção em andamento deve conceder somente o mínimo necessário:

`Contents: read/write`

para `uknwplayer/ARCA` / `vince-v4-channel`, sem expor token e sem alterar Workbench/v1/v2.

## Condição antes de qualquer retry

Não repetir `vince-v4-live-004` até confirmar escrita.

Após confirmação, decidir explicitamente entre:

- retomar 004, somente se a semântica de replay estiver segura e a request ainda válida; ou
- preferencialmente criar `vince-v4-live-005` com nova expiração para manter proveniência simples.

Nenhum retry automático está autorizado.

## Outros gates

Portal continua sem quarto GET autorizado.

Edge Steward continua congelado.
