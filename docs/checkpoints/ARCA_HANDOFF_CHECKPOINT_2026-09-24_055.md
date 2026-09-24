# ARCA — Checkpoint 055: Gate M5-M de cobertura PNCP contratos/empenhos preparado

Data: **2026-09-24**.

Estado: **M5-L CONCLUÍDO SEM CANDIDATO; SUPERFÍCIE OFICIAL PNCP CONTRATOS/EMPENHOS SELECIONADA; M5-M IMPLEMENTADO EM BRANCH; 2 ALVOS MÁXIMOS; ZERO RETRIES; PREFLIGHT PRIVADO E LIVE HASH-BOUND PREPARADOS; NENHUM NOVO GET PNCP EXECUTADO**.

## Base

Checkpoint anterior: [054](ARCA_HANDOFF_CHECKPOINT_2026-09-24_054.md).

Resultado M5-L preservado:

- run `36028937585`;
- 2 pares;
- 0 candidatos;
- 0 confirmados;
- `screeningSha256=06440986b4e2a360e13add77709ab6b2bc1b9d66847cb71173618f9c32881e95`.

## Decisão técnica

Não repetir M5-L e não forçar correlação.

A documentação oficial PNCP v2.6 foi revisada. O endpoint escolhido para ampliar cobertura é:

`GET /v1/orgaos/{cnpj}/contratos/contratacao/{anoContratacao}/{sequencialContratacao}`

Base de produção:

`https://pncp.gov.br/api/pncp`

Ele documenta retorno com fornecedor, referência PNCP da contratação, contrato/empenho, processo, órgão e valores.

## Implementação M5-M

Arquivos principais:

- `src/investigation/m5-pncp-contract-coverage-plan.mjs`;
- `src/investigation/m5-pncp-contract-coverage-private.mjs`;
- `src/investigation/m5-pncp-contract-coverage-transport.mjs`;
- `scripts/prepare-m5-pncp-contract-coverage-preflight.mjs`;
- `scripts/run-m5-pncp-contract-coverage-live.mjs`;
- `.github/workflows/arca-m5-pncp-contract-coverage-preflight.yml`;
- `.github/workflows/arca-m5-pncp-contract-coverage-live.yml`;
- `config/m5-pncp-contract-coverage.json`.

## Invariantes

- no máximo 2 contratações atuais;
- exatamente 1 alvo por contratação;
- `maxRequests=2`;
- `retries=0`;
- host fixo `pncp.gov.br`;
- path allowlisted;
- timeout 30 s;
- 64 KiB por resposta;
- preflight não executa source network;
- candidato público contém apenas hashes;
- live exige branch com `candidateSha256`;
- correlação/publicação permanecem bloqueadas.

## Estado de autorização

**Nenhum novo GET PNCP está autorizado por este checkpoint.**

O workflow live existe apenas como capability dormente.

## Próximo passo

Após merge, executar somente:

`m5-pncp-contract-coverage-preflight-*`

na revisão final.

O preflight deverá emitir `READY_FOR_EXPLICIT_SOURCE_AUTHORIZATION` e um `candidateSha256` canônico. Só depois será possível pedir autorização humana para exatamente os 2 GETs.

Nenhum request de fonte é necessário antes disso.
