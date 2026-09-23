# ARCA — Checkpoint 047: parser financeiro Portal implementado offline

Data: **2026-09-23**.

Estado: **GATE 046 CONCLUÍDO; PRIMEIRO 2xx FINANCEIRO CUSTODIAL PRESERVADO; PARSER V1 IMPLEMENTADO E TESTADO SOMENTE EM FIXTURE SINTÉTICA; HASH DE SCHEMA DO GATE 046 FIXADO; LIVE NORMALIZATION CONTINUA BLOQUEADA; ZERO NOVO GET**.

## Base

Main de partida:

`cbb7730281101e0db1b3480ccf86bcb3af066563`

CI pós-merge do checkpoint 046:

https://github.com/uknwplayer/ARCA/actions/runs/35918420632

Conclusão: **success**.

## Âncora live preservada

Gate 046:

- preflight: `35916999807`;
- live: `35917902630`;
- HTTP 200;
- 1 registro;
- 440 bytes;
- `retries=0`;
- `STORED_PRIVATE`;
- `observedSchemaSha256=79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`.

Nenhum byte live foi aberto ou normalizado nesta etapa.

## Novo componente

`src/investigation/m5-portal-related-documents-parser.mjs`

Função: implementar um parser V1 preso ao schema observado e executável somente em fixture sintética.

Arquivos:

- `src/investigation/m5-portal-related-documents-parser.mjs`;
- `examples/multisource-offline-fixtures/m5-portal-related-documents-parser-v1.json`;
- `tests/m5-portal-related-documents-parser.test.mjs`;
- `scripts/validate-m5-portal-parser.mjs`;
- `docs/ARCA_M5_PORTAL_RELATED_DOCUMENTS_PARSER_V0_1.md`.

## Invariantes

- exatamente 11 campos;
- todos strings;
- schema hash exato do Gate 046;
- parser de data e BRL fail-closed;
- fase restrita a Empenho/Liquidação/Pagamento;
- nenhum identificador de pessoa é inferido de texto livre;
- refs derivadas por hash;
- rede `false`;
- publicação `false`;
- achado adverso `false`;
- revisão humana `true`;
- `liveNormalizationAuthorized=false`.

## Limite

Esta entrega **não** executa o parser sobre o registro real do Gate 046.

O modo `CUSTODIAL_LIVE` é explicitamente recusado.

Nenhum novo GET ao Portal está autorizado ou é necessário.

## Próximo gate

Criar M5-G de admissão da normalização custodial:

`Gate 046 custody → parser V1 aprovado → reabertura privada → normalização → normalizationSha256 → source binding → Fase B`

Tudo isso pode ocorrer offline. A aplicação do parser aos bytes live deve exigir decisão humana explícita e não concede autorização de publicação/correlação adversa.

Checkpoint anterior: [046](ARCA_HANDOFF_CHECKPOINT_2026-09-23_046.md).
