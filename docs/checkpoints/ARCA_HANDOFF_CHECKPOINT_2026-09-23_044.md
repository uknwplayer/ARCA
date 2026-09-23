# ARCA — Checkpoint 044: TCU Acórdãos offline S2

Data: **2026-09-23**.

Estado: **TRANSFEREGOV S1 INTEGRADO; PORTAL GATE 042 AGUARDA CGU; TCU ACÓRDÃOS S2 IMPLEMENTADO OFFLINE; ZERO REDE TCU; NENHUM NOVO GET PORTAL**.

## Base

Main de partida:

`919ef15a0a3e15801eff7cb3f6ffbd4bbddb234e`

Transferegov S1 foi integrado pela PR #179. O snapshot V1 permanece histórico e o snapshot S1 contém a terceira fonte offline.

## S2 — TCU Acórdãos

Foi criado o snapshot:

`config/public-source-registry-s2.json`

Ele preserva S1 e promove `br.tcu.open-data` para `ACTIVE/OFFLINE_FIXTURE` usando o webservice oficial de Acórdãos.

Endpoint documentado:

`https://dados-abertos.apps.tcu.gov.br/api/acordao/recupera-acordaos`

## Entregas

- `src/investigation/tcu-acordaos-offline-adapter.mjs`;
- `examples/multisource-offline-fixtures/tcu-acordaos-national-v1.json`;
- `tests/tcu-acordaos-offline-adapter.test.mjs`;
- `scripts/validate-tcu-acordaos-offline-s2.mjs`;
- `config/public-source-registry-s2.json`;
- suporte compatível a `BR/NATIONAL` no Evidence Envelope;
- `npm run validate:tcu-s2`;
- etapa explícita no CI.

## Segurança

- fixture 100% sintética;
- zero rede;
- zero publicação;
- nenhuma conclusão adversa;
- decisão do TCU tratada como contexto documental;
- recurso/decisão posterior reconhecido como possível mudança de contexto;
- revisão humana obrigatória;
- snapshots V1 e S1 preservados.

## Próxima fonte

Depois do S2:

`S3 Siconfi/Tesouro Nacional`

Depois:

`S4 CEIS/CNEP → S5 DOU → S6 FNDE`.

## Portal

Gate 042 continua separado e aguardando retorno técnico da CGU. Nenhum quinto GET está autorizado.

Checkpoint anterior: [043](ARCA_HANDOFF_CHECKPOINT_2026-09-23_043.md).
