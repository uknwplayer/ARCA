# ARCA — Checkpoint 049: admissão M5-H registrada e executor local-only preparado

Data: **2026-09-23**.

Estado: **CANDIDATO M5-G ADMITIDO; DECISÃO HUMANA CANÔNICA REGISTRADA; NORMALIZADOR CUSTODIAL OFFLINE IMPLEMENTADO E TESTADO APENAS COM FIXTURE/ENVELOPE SINTÉTICO; EXECUÇÃO SOBRE O GATE 046 AINDA NÃO REALIZADA; ZERO NOVO GET; ZERO PUBLICAÇÃO; ZERO CORRELAÇÃO**.

## Decisão humana

Candidato:

`0bcf1806c2480b2f82f8efff43e67436460043375d302fb6fcf44c80ec3e97f9`

Revisão:

`df9a3f29e5d824c8ed39914e7133551edec044e8`

Decisão:

`ADMIT_FOR_CUSTODIAL_NORMALIZATION`

Timestamp registrado:

`2026-09-23T22:27:00.000Z`

Restrições:

- sem rede de fonte;
- sem novo GET;
- sem publicação;
- sem correlação.

## Implementação

Novo módulo:

`src/investigation/m5-portal-custodial-normalization.mjs`

Novo CLI local-only:

`scripts/normalize-m5-portal-custody-local.mjs`

Novo registro:

`config/m5-portal-parser-admission-gate046.json`

Novo validador:

`scripts/validate-m5-custodial-normalization-admission.mjs`

Novo teste:

`tests/m5-portal-custodial-normalization.test.mjs`

## Segurança

O executor não possui fetch/HTTP e não baixa custódia.

Ele só abre um envelope já local, usando passphrase já presente no ambiente.

A prova pública/sanitizada não inclui valores normalizados nem bytes brutos.

## Fronteira operacional descoberta

Para executar sobre o Gate 046, o envelope criptografado e a passphrase precisam estar co-localizados no ambiente que roda o CLI.

Hoje eles estão guardados na infraestrutura privada GitHub/Actions. Buscar esse material do GitHub seria um transporte de rede e violaria a leitura estrita da autorização atual `sem rede`.

Por isso, a execução live **não foi feita** neste checkpoint.

## Próximo passo

Ou:

1. materializar localmente envelope + passphrase e executar o CLI sem rede;

ou:

2. obter autorização separada para transporte de custódia privada via GitHub, sem tocar no Portal e sem ampliar publicação/correlação.

Checkpoint anterior: [048](ARCA_HANDOFF_CHECKPOINT_2026-09-23_048.md).
