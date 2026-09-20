# ARCA Event Fabric v0.1

Fundação do sistema nervoso orientado a eventos do ARCA.

Eventos iniciais: `ci.completed`, `evidence.added`, `case.candidate`, `investigation.updated` e `auditor.contradiction`.

O Fabric não executa shell, não altera trust/ownership e não escolhe verdade por consenso. Ele recebe eventos tipados, gera identidade determinística, evita redispatch idêntico durante a vida do processo, registra journal observacional e convoca somente handlers explicitamente vinculados ao tipo.

Falha de um handler é isolada e não apaga o evento nem impede outros handlers.

## Próximas camadas

A implementação v0.1 é deliberadamente em memória. Antes de uso operacional: journal durável append-only, replay/idempotência persistente, assinatura/proveniência para fontes remotas, política de autorização por evento, budgets/backpressure e dispatcher que seleciona agentes especializados.

O objetivo é substituir polling desnecessário por trabalho disparado quando o ARCA realmente detecta algo material.
