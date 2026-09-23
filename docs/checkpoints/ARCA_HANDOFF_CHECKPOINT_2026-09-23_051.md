# ARCA — Checkpoint 051: estrutura PNCP live observada e parser V1 preparado

Data: **2026-09-23**.

Estado: **PORTAL LIVE NORMALIZADO E M5-I INTEGRADO; CUSTÓDIA PNCP HISTÓRICA REABERTA APENAS PARA OBSERVAÇÃO ESTRUTURAL; ZERO NOVO GET PNCP; PARSER PNCP V1 IMPLEMENTADO EM FIXTURE SINTÉTICA; FORNECEDOR NÃO OBSERVADO E NÃO INFERIDO; CORRELAÇÃO AINDA BLOQUEADA**.

## Observação PNCP

Run:

https://github.com/uknwplayer/ARCA/actions/runs/35932200063

Resultado:

- `SCHEMA_OBSERVED`;
- 3 arquivos;
- 6289 bytes custodiais;
- `observedStructureSha256=4a00de8f61190819cc6e172f45438dcb22dc1c952430fc7a1c79f2cc0dcfabb9`;
- `observationSha256=8b413570a251392d3c0f2f07b4e5598f9db351b2678ad136e7a6ade01d6cdd14`;
- valores não incluídos;
- bytes crus não incluídos;
- zero rede do observador.

## Estrutura útil

A página PNCP custodial contém 2 registros de contratação e metadados de paginação.

O schema observado permite normalizar:

- identificador PNCP;
- CNPJ/órgão;
- unidade;
- município/UF;
- ano/sequencial;
- modalidade;
- processo;
- objeto;
- publicação;
- situação;
- valor estimado.

Não há fornecedor/adjudicatário nessa página.

## Parser

Novo:

`src/investigation/m5-pncp-live-parser.mjs`

O parser é fail-closed e, nesta etapa, executa apenas fixture sintética.

Ele registra explicitamente:

`supplierObserved=false`

Essa ausência é uma característica da cobertura da fonte consultada, não um indício e não pode ser preenchida por inferência.

## Próximo passo

Após CI/merge:

1. admitir o parser PNCP para a custódia histórica;
2. normalizar os 2 registros já capturados;
3. resselar resultado no cofre privado;
4. gerar binding PNCP compatível com a Fase B;
5. só então avaliar se os dois lados têm informação suficiente para correlação.

Nenhum novo GET PNCP ou Portal é necessário para a normalização.

Checkpoint anterior: [050](ARCA_HANDOFF_CHECKPOINT_2026-09-23_050.md).
