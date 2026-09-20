# Specialized Agent Dispatch Policy v0.1

Política determinística que mapeia tipos conhecidos do Event Fabric para IDs de agentes explicitamente autorizados.

Exemplo: `case.candidate -> auditor.copilot, auditor.gpt`; `ci.completed -> steward.tech`.

A política não escolhe agentes por texto livre, não executa ferramentas e não cria fallback implícito. Evento sem rota retorna conjunto vazio. Agente configurado mas indisponível aparece como `unavailable`; nunca é substituído silenciosamente por outro.

Esta camada decide somente **quem pode ser convocado para aquele tipo de evento**. Claim/ACK continuam pertencendo ao Delivery Ledger e a autoridade de ferramentas continua limitada pelos adapters/gateways de cada agente.

Próxima integração: projetar as rotas resolvidas em handlers identificados do Event Fabric, preservando persist-before-dispatch e delivery durável.
