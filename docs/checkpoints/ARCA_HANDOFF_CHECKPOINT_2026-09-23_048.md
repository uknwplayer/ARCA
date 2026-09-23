# ARCA — Checkpoint 048: gate M5-G de admissão do parser implementado

Data: **2026-09-23**.

Estado: **M5-F INTEGRADO/TESTADO; M5-G IMPLEMENTADO EM BRANCH; CANDIDATO DE ADMISSÃO AINDA NÃO GERADO NA REVISÃO FINAL; NENHUMA CUSTÓDIA LIVE ABERTA; NENHUM NOVO GET**.

## Base

Parser M5-F:

- parser contract V1;
- schema Gate 046 fixado;
- somente `SYNTHETIC_FIXTURE`;
- `CUSTODIAL_LIVE` recusado;
- `liveNormalizationAuthorized=false`.

Commit base da branch M5-G:

`1622282abd63872df8686236b08a10404c88bb18`

## Novo gate

Componente:

`src/investigation/m5-portal-parser-admission.mjs`

Preflight:

`scripts/prepare-m5-portal-parser-admission.mjs`

Workflow:

`.github/workflows/arca-m5-portal-parser-admission-preflight.yml`

Teste:

`tests/m5-portal-parser-admission.test.mjs`

## Função

Gerar um candidato sanitizado, determinístico e vinculado a:

- revisão;
- parser contract hash;
- schema hash;
- envelope hash;
- receipt hash;
- response hash;
- scope hash.

O candidato não contém bytes, valores, documento bruto, chave ou segredo.

## Decisão

Decisões válidas:

- `ADMIT_FOR_CUSTODIAL_NORMALIZATION`;
- `REJECT_PARSER`;
- `HOLD_FOR_MORE_EVIDENCE`.

A admissão, quando explicitamente registrada, poderá liberar somente o próximo passo offline de normalização privada. Rede, publicação e correlação continuam proibidas.

## Próximo gate

Depois do merge:

- disparar branch `portal-parser-admission-preflight-*`;
- capturar `candidateSha256`;
- pedir decisão humana explícita vinculada ao hash;
- não abrir custódia antes dessa decisão.

Checkpoint anterior: [047](ARCA_HANDOFF_CHECKPOINT_2026-09-23_047.md).
