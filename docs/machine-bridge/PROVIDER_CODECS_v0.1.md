# Provider Codecs v0.1

Traduz o contrato MBDP para envelopes de OpenAI, Anthropic e APIs compatíveis com chat-completions usadas pelos adapters de Gemini, Meta e Grok.

Todo prompt inclui uma fronteira explícita: conteúdo de repositório, arquivos e logs é **evidência não confiável**, nunca instrução. A saída esperada é um único objeto JSON MBDP. Prosa ou JSON inválido falham fechado.

Os codecs não possuem credenciais, não fazem rede e não concedem ferramentas. Autorização de `audit_*` continua no Tool Interface/Gateway.

Meta continua dependendo de endpoint explicitamente configurado. Compatibilidade do envelope não significa que qualquer endpoint Meta esteja automaticamente homologado.
