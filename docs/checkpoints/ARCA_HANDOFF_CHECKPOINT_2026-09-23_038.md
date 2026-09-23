# ARCA — Checkpoint 038: M5 Fase C observação estrutural do schema Portal integrada

Data: **2026-09-23**.

Estado: **M5 FASES A+B+C OFFLINE INTEGRADAS E TESTADAS; OBSERVAÇÃO ESTRUTURAL DO PRIMEIRO 2xx PREPARADA; M5 LIVE AINDA BLOQUEADO PELO PRIMEIRO 2xx PORTAL AUTORIZADO**.

## Integração

Issue: #161 — `M5 Fase C — observação estrutural do primeiro schema Portal 2xx`.

PR: #162 — `feat(m5): adicionar observação estrutural do schema Portal`.

Commit canônico:
`14679f0b2649d033a48a5d72beb72ce813afab2e`.

CI da PR:
- run #339 / `35855501213`;
- conclusão: **success**;
- M5-A: success;
- M5-B: success;
- M5-C: success;
- repositório/publicação: success.

CI pós-merge:
- run #340 / `35855589032`;
- conclusão: **success**;
- M5-A: success;
- M5-B: success;
- M5-C: success;
- verificação do repositório: success.

## Novo componente

`src/investigation/m5-portal-schema-observer.mjs`

Função: observar a estrutura de uma resposta Portal já custodial sem expor valores e sem admitir parser automaticamente.

A observação registra:

- tipo da raiz;
- quantidade de registros;
- campos observados;
- tipos por campo;
- presença por campo;
- hashes da estrutura e da observação;
- vínculos a scope, resposta, envelope e recibo de custódia.

Não inclui valores.

## Integração no probe M4b

O probe `arca-portal-related-documents-live-probe.mjs` agora segue:

```text
captura
  ↓
hash dos bytes
  ↓
selagem
  ↓
custódia durável
  ↓
verificação do recibo
  ↓
reabertura byte a byte
  ↓
M5-C observação estrutural
  ↓
validação DTO atual
```

Se a validação DTO falhar por schema drift, a observação estrutural válida permanece disponível para revisão.

O CLI expõe somente:

- `schemaObservationState`;
- `observedSchemaSha256`.

Nenhum valor dos registros é impresso.

## Estados

- `SCHEMA_OBSERVED`;
- `SCHEMA_DRIFT_REVIEW_REQUIRED`.

Drift não gera retry automático nem novo GET.

## Revisão humana

Decisões possíveis:

- `APPROVE_FOR_PARSER_DESIGN`;
- `REJECT_SCHEMA`;
- `HOLD_FOR_MORE_EVIDENCE`.

Mesmo `APPROVE_FOR_PARSER_DESIGN` mantém:

- parserImplementationAuthorized=false;
- normalizationAuthorized=false;
- networkAuthorized=false;
- publicationAuthorized=false.

O parser real só pode ser implementado depois de um schema live efetivamente observado e em gate separado.

## CI canônico

Novo validador:

`npm run validate:m5-phase-c`

O CI principal agora exige M5-A + M5-B + M5-C.

## O que NÃO aconteceu

- nenhum novo GET Portal;
- nenhum quarto GET;
- nenhum token usado;
- nenhum 2xx fabricado;
- nenhum schema live inventado;
- nenhum parser real criado;
- nenhuma normalização live;
- nenhuma publicação;
- nenhum achado adverso.

## Próximo gate

O próximo bloqueio material continua externo:

1. confirmar token Portal oficialmente ativo;
2. gerar/revisar o preview do escopo aplicável;
3. obter nova autorização explícita e limitada;
4. executar exatamente um novo GET;
5. se houver 2xx, custodiar os bytes;
6. M5-C observar o schema real;
7. revisão humana do schema;
8. somente depois desenhar e testar o parser;
9. alimentar M5-A/M5-B com entrada live normalizada.

Não executar novo GET por inferência.

## Frentes congeladas

- Vince permanece no Probe 011;
- Controlled Self-Improvement congelado;
- Edge Steward congelado;
- M10 Produto/Governança/Interface congelado;
- M7-CIV planejado, não ativo.
