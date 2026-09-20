# ADR-ARCA-0002 — Questão como nó de primeira classe

**Status:** aceito provisoriamente  
**Decisão:** `Q` é nó canônico ligado a `INV` por `has_question`.

## Motivo

A Public TRACE Projection já exigia questão explícita, enquanto estados antigos a mantinham apenas como atributo. Um nó permite múltiplas questões, TRACE real e conclusão ligada à pergunta sem injeção artificial.

## Compatibilidade

Migradores convertem `investigation.question_id` e `investigation.question` em nó `Q`, preservando o texto e o ID originais.
