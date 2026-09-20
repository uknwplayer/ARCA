# ADR-ARCA-0004 — Event log como fonte operacional de verdade

**Status:** aceito provisoriamente  
**Decisão:** toda mudança material produz evento append-only. O estado atual é projeção reconstruível.

## Formato inicial

NDJSON local, sequência monotônica, ator explícito e cadeia SHA-256. O formato não depende de banco de dados e pode ser convertido posteriormente para SQLite ou outro armazenamento transacional sem alterar o protocolo.

## Limite

Hash encadeado detecta adulteração, mas não prova autoria. Assinatura pertence ao adaptador criptográfico.
