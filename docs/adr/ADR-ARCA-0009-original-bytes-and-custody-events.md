# ADR-ARCA-0009 — Bytes originais e custódia append-only

- **Status:** aceito
- **Decisão:** preservar o fluxo de bytes original e registrar transformações e revisões em log encadeado; `manifest.json` é somente projeção.

## Contexto

Sobrescrever o original ou guardar apenas texto extraído impede distinguir captura, transformação e interpretação. Um único JSON mutável também não preserva a ordem das decisões.

## Decisão

A primeira captura grava bytes em `original/` e `ACQUISITION_CAPTURED`. Cada transformação grava novo arquivo em `derivatives/` e evento próprio. Cada revisão gera `REVIEW_RECORDED`. Sequência, hash anterior e SHA-256 canônico tornam adulteração local detectável.

## Consequências

- o original nunca é normalizado;
- derivado sempre declara entrada, saída e ferramenta;
- revisão não reescreve a história;
- projeção pode ser reconstruída;
- assinatura e ancoragem externa permanecem fora do escopo.
