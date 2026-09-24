# ARCA — Ponte Termux ↔ GPT V0.1

Data: **2026-09-24**  
Estado: **FASE A — `arca ask` one-shot, offline-tested; `arca chat` interativo ainda não implementado**

## Objetivo

Permitir que o operador converse com um modelo GPT diretamente pelo Termux através das fronteiras do ARCA, sem transformar uma resposta de modelo em autoridade de execução.

A primeira fase deliberadamente começa por uma pergunta única:

```text
Termux
  ↓
ARCA CLI
  ↓
ReasoningProviderRegistry
  ↓
Reasoning Transport Gate
  ↓
OpenAI Responses API
  ↓
ARCA
  ↓
Termux
```

## Comando planejado nesta fase

```bash
export OPENAI_API_KEY='...'

npm run arca -- ask \
  --message "Onde paramos?" \
  --model gpt-6-luna \
  --allow-external
```

`--allow-external` é obrigatório porque a mensagem pode conter comunicação privada e será enviada a um provedor externo.

A API key nunca entra no payload do Reasoning Registry, saída pública, log deliberado ou repositório.

## Segurança

- origem fixa: `https://api.openai.com`;
- endpoint: `POST /v1/responses`;
- redirects recusados;
- `store:false`;
- transporte ARCA: `private-direct`, TLS, persistência efêmera;
- mensagem classificada como `restricted/privateCommunication`;
- envio externo exige opt-in explícito;
- `humanReviewRequired=true`;
- `coreMutationPerformed=false`;
- nenhuma ferramenta é exposta ao modelo nesta fase;
- nenhuma resposta pode autorizar a própria execução;
- erros do provedor são sanitizados.

## Custos

O ARCA não fixa preços no código. Preços e modelos mudam. O modelo pode ser selecionado por `--model` ou `ARCA_OPENAI_MODEL`.

A primeira fase limita `max_output_tokens` e retorna os contadores de uso informados pelo provedor. Um ledger monetário será uma etapa posterior, antes de automação recorrente.

## O que esta fase não faz

- não mantém conversa multi-turno;
- não lê automaticamente checkpoint/roadmap;
- não chama Work;
- não executa shell;
- não altera o Core;
- não aciona ferramentas;
- não guarda o texto da conversa.

## Próximo estágio — Fase B

Adicionar `arca chat` interativo reutilizando o mesmo bridge:

1. loop de terminal;
2. estado de sessão controlado;
3. comandos locais `/status`, `/context`, `/exit`;
4. contexto ARCA opt-in e minimizado;
5. budget de tokens/sessão;
6. nenhuma ferramenta automática.

Somente depois da Fase B deve ser discutida delegação controlada para Machine Bridge/Work.
