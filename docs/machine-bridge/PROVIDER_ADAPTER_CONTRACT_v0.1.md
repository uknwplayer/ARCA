# Provider Adapter Contract v0.1

Contrato para conectar modelos reais ao MBDP sem colocar SDKs ou fornecedores dentro do núcleo.

O host fornece uma função `invoke(request)` específica do provedor. O núcleo aceita somente duas respostas: solicitar uma ferramenta `audit_*` ou emitir uma mensagem final. A camada seguinte ainda valida se a ferramenta solicitada existe e é read-only.

Configuração prevista por secret store:
- ARCA_OPENAI_API_KEY / ARCA_OPENAI_MODEL
- ARCA_ANTHROPIC_API_KEY / ARCA_ANTHROPIC_MODEL
- ARCA_GEMINI_API_KEY / ARCA_GEMINI_MODEL
- ARCA_META_API_KEY / ARCA_META_MODEL
- ARCA_GROK_API_KEY / ARCA_GROK_MODEL

Nenhuma chave deve ser commitada, registrada em logs ou enviada à Deliberation Room. O repositório não provisiona credenciais automaticamente.

Esta etapa NÃO chama APIs externas; estabelece o contrato e o boundary de secrets para a integração real posterior.
