# MBDP Controller v0.1

O controller convoca adapters de auditor sem conhecer fornecedores específicos. Ele fornece somente o snapshot permitido pela fase, aplica timeout e avança fases deterministicamente.

## Invariantes
- nenhum adapter recebe credencial do sistema auditado;
- timeout/silêncio não significa concordância;
- adapters não controlam mudança de fase;
- limite de turnos evita loops;
- falhas inesperadas são fail-closed;
- adapters reais de provedores serão adicionados separadamente, atrás desta interface.

O contrato mínimo de adapter é `{agentId, provider, model, analyze(input)}`. Isso permite OpenAI, Anthropic, Gemini, modelos locais e futuros provedores sem alterar o protocolo.
