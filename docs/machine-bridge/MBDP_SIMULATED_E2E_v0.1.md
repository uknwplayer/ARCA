# MBDP — Teste integrado simulado v0.1

Este teste exercita o circuito completo sem chamar provedores externos:

1. controller convoca dois auditores simulados;
2. cada auditor consulta uma evidência pelo Auditor Gateway;
3. primeira rodada permanece cega;
4. análises são reveladas;
5. ambos produzem challenge e rebuttal;
6. ambos emitem conclusão final;
7. sala encerra;
8. mensagens permanecem encadeadas por hash;
9. leituras ficam registradas por auditor.

O teste NÃO demonstra comunicação com OpenAI, Anthropic ou outro serviço externo e NÃO deve ser descrito como consenso independente entre modelos reais. Ele valida apenas a integração determinística dos componentes internos antes de introduzir credenciais e APIs externas.
