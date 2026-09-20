# Tool-enabled MBDP Auditor v0.1

Une o adapter de auditor ao Auditor Tool Interface sem acoplar o protocolo a um provedor.

Fluxo: controller convoca agente → agente pode solicitar ferramentas read-only → resultados voltam ao contexto privado daquele turno → agente produz análise final → Deliberation Room registra a mensagem.

O host controla identidade, ferramentas e orçamento. O agente não pode inventar uma ferramenta de escrita: somente objetos marcados `readOnly=true` são executados. `maxToolCalls` limita loops autônomos.

A função `reason` é o ponto de integração futuro com OpenAI, Anthropic, Gemini ou modelo local. Credenciais do provedor não pertencem a este módulo.
