# ARCA — Checkpoint 043: expansão multifonte com Transferegov offline

Data: **2026-09-23**.

Estado: **GATE 042 DO PORTAL CONTINUA AGUARDANDO SUPORTE DA CGU; NENHUM QUINTO GET PORTAL AUTORIZADO; TRANSFEREGOV TRANSFERÊNCIAS ESPECIAIS ADICIONADO COMO TERCEIRO ADAPTADOR OFFLINE EM PR #179; ZERO REDE TRANSFEREGOV**.

## Motivação

O bloqueio HTTP 401 do Portal da Transparência não deve paralisar a expansão do núcleo investigativo. O ARCA passa a avançar em fontes públicas independentes, mantendo cada ativação live em gate separado.

O Transferegov.br disponibilizou em 2026 um novo ambiente oficial de APIs de Dados Abertos. A primeira integração escolhida é Transferências Especiais, por expor contexto de emendas, pagamentos e execução destinados a estados e municípios.

## Implementação

PR:
[#179](https://github.com/uknwplayer/ARCA/pull/179)

CI inicial da PR:
[35891562850](https://github.com/uknwplayer/ARCA/actions/runs/35891562850)

Arquivos principais:

- `src/investigation/transferegov-special-transfers-offline-adapter.mjs`;
- `examples/multisource-offline-fixtures/transferegov-special-transfers-sp-mg-v1.json`;
- `tests/transferegov-special-transfers-offline-adapter.test.mjs`;
- `config/public-source-registry-s1.json`;
- `config/public-source-registry-v1.json` preservado como snapshot histórico;
- `src/investigation/multisource-offline-gate.mjs`;
- `docs/ARCA_TRANSFEREGOV_SPECIAL_TRANSFERS_OFFLINE_V0_1.md`.

## Estado da fonte

`br.transferegov.public` no snapshot `public-source-registry-s1.json`:

- origem canônica: `https://api-publica.transferegov.gestao.gov.br/`;
- acesso: `official_public_api`;
- status: `ACTIVE`;
- modo executável: somente `OFFLINE_FIXTURE`;
- formatos declarados: JSON/CSV;
- rede: bloqueada nesta entrega.

O registro V1 permanece sem alteração operacional para preservar os digests históricos de M0/M1. A primeira execução do CI após promover a fonte diretamente em V1 detectou corretamente essa quebra de reprodutibilidade; a correção passou a usar snapshot S1.

## Segurança

A fixture é sintética e não contém alegações sobre pessoas ou entes reais. O adaptador:

- rejeita campos inesperados;
- rejeita origem divergente;
- rejeita UF incompatível;
- rejeita valor pago maior que o valor total;
- limita número de registros;
- emite Evidence Envelopes sem material bruto;
- mantém `adverseFinding=false`;
- mantém revisão humana;
- não possui capability live.

## Próximas fontes

Depois do Transferegov, a fila de expansão permanece:

- TCU Dados Abertos/Webservices;
- Siconfi/Tesouro Nacional;
- CEIS/CNEP;
- DOU;
- FNDE.

Cada fonte começa em fixture offline e só ganha rede após contrato, testes, budgets, custódia e gate humano próprios.

## Portal da Transparência

Gate 042 permanece inalterado. O contato técnico foi enviado para `listaapitransparencia@cgu.gov.br`. Nenhum novo GET é autorizado por este checkpoint.

Checkpoint anterior: [042](ARCA_HANDOFF_CHECKPOINT_2026-09-23_042.md).
