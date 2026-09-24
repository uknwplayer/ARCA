# ARCA — Ponte Termux ↔ GPT V0.1

Data: **2026-09-24**  
Estado: **FASES A+B IMPLEMENTADAS EM BRANCH — gate monetário + `arca ask` + `arca chat`; aguardando CI/merge**

## Objetivo

Permitir conversa com GPT pelo Termux através das fronteiras do ARCA sem converter resposta de modelo em autoridade de execução.

```text
Termux
  ↓
ARCA CLI
  ↓
ReasoningProviderRegistry
  ↓
Reasoning Transport Gate
  ↓
Paid API Budget Gate
  ↓
OpenAI Responses API
  ↓
ARCA
  ↓
Termux
```

## Fase A — `arca ask`

```bash
export OPENAI_API_KEY='...'

npm run arca -- ask \
  --message "Onde paramos?" \
  --model gpt-6-luna \
  --allow-external \
  --allow-paid-api \
  --max-request-usd 0.01
```

## Fase B — `arca chat`

```bash
npm run arca -- chat \
  --model gpt-6-luna \
  --allow-external \
  --allow-paid-api \
  --session-budget-usd 0.05
```

A sessão guarda histórico apenas em RAM. Comandos locais: `/status`, `/context`, `/clear`, `/help`, `/exit`.

## Gate monetário

Snapshot de preços: **2026-09-24**. Fonte registrada no código: documentação oficial de preços da OpenAI.

Modelos inicialmente conhecidos pelo gate:

- `gpt-6-luna`;
- `gpt-6-sol`;
- `gpt-6-astra`.

O snapshot é considerado inválido depois de 30 dias sem atualização.

O preflight usa o tamanho UTF-8 do prompt como limite superior conservador de tokens de entrada e soma o máximo permitido de tokens de saída. A request é bloqueada se essa estimativa ultrapassar o teto informado pelo operador.

Após a resposta, o ARCA calcula uma estimativa baseada em `usage`. Isso **não representa a fatura oficial** e `billingCapGuaranteed=false`.

## Segurança

- chave somente em `OPENAI_API_KEY`;
- origem fixa `https://api.openai.com`;
- `POST /v1/responses`;
- `store:false`;
- redirects recusados;
- `private-direct`, TLS e payload efêmero;
- `--allow-external` obrigatório;
- `--allow-paid-api` obrigatório;
- budget obrigatório;
- nenhum tool grant;
- nenhum shell;
- nenhuma Core mutation;
- histórico do chat somente em memória;
- contexto automático do projeto ainda desligado.

## O que ainda não existe

- contexto automático de checkpoint/roadmap;
- persistência de conversa;
- chamada automática do Work;
- ferramentas automáticas;
- ledger durável de custo;
- execução autônoma originada de respostas.

## Próximo estágio

Depois do aceite/merge desta fase:

1. teste live mínimo no próprio Termux, somente com API key configurada pelo operador;
2. contexto ARCA opt-in/minimizado;
3. ledger local opcional de uso/custo;
4. somente depois estudar delegação controlada para Work/Machine Bridge.
