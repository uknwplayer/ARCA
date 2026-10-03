# ARCA — Ponte Termux ↔ modelos de raciocínio V0.2

Atualizado em: **2026-10-03**  
Estado: **`arca ask` OPENAI PAGO PRESERVADO; `arca chat` MULTI-PROVEDOR IMPLEMENTADO NO PR #217; HEAD PRÉ-DOCS `56a531cca04c0737939e55ae7a61e56be82278f2`; CI `37155403202` VERDE; NENHUMA CHAMADA LIVE DE MODELO NESTE CICLO**

## Objetivo

Permitir conversa pelo Termux através das fronteiras do ARCA sem converter resposta de modelo em autoridade de execução, e sem exigir um provedor externo apenas para abrir o console.

```text
Termux
  ↓
ARCA CLI — arca chat
  ↓
catálogo de provedores
  ├─ offline  → zero rede
  ├─ Gemini   → GEMINI_API_KEY + --allow-external
  └─ OpenAI   → OPENAI_API_KEY + --allow-external + --allow-paid-api + budget
  ↓
sessão apenas em memória
  ↓
Termux
```

## `arca chat` — padrão offline

```bash
npm run arca -- chat
```

O console abre sem API key e sem budget. O modo `offline` não chama modelo externo. Dentro da sessão:

```text
/status
/context
/providers
/clear
/help
/exit
```

`/providers` mostra os três backends atuais: `offline`, `gemini` e `openai`.

## Gemini — externo, opt-in

```bash
export GEMINI_API_KEY='...'

npm run arca -- chat \
  --provider gemini \
  --allow-external
```

Modelo padrão atual: `gemini-2.5-flash`.

A implementação reutiliza `createGeminiProviderClient` já existente no Agent package. O adaptador Termux:

- exige `GEMINI_API_KEY`;
- exige `--allow-external` antes da rede;
- mantém histórico somente em RAM;
- não concede tools;
- não concede shell;
- não autoriza Core mutation;
- não faz fallback automático para OpenAI ou tier pago;
- não exige budget monetário interno do ARCA nesta rota.

O catálogo registra `freeTierEligible=true` e `freeTierGuaranteed=false`. Isso significa apenas que a rota foi desenhada para poder usar uma cota gratuita quando ela existir; não é garantia de gratuidade, disponibilidade ou quota na conta/projeto Google do operador.

## OpenAI — externo e monetariamente gated

### `arca ask`

```bash
export OPENAI_API_KEY='...'

npm run arca -- ask \
  --message "Onde paramos?" \
  --model gpt-6-luna \
  --allow-external \
  --allow-paid-api \
  --max-request-usd 0.01
```

### `arca chat`

```bash
npm run arca -- chat \
  --provider openai \
  --model gpt-6-luna \
  --allow-external \
  --allow-paid-api \
  --session-budget-usd 0.05
```

Uma chamada OpenAI só é admitida se houver simultaneamente autorização externa, autorização de API paga, teto monetário explícito, modelo com preço conhecido, snapshot de preços válido e estimativa conservadora abaixo do teto.

O gate não afirma controlar a fatura oficial. `billingCapGuaranteed=false`.

## Segurança comum do chat

- histórico apenas em memória do processo;
- nenhuma persistência durável automática;
- nenhum tool grant;
- nenhum shell;
- nenhuma Core mutation;
- nenhuma chamada automática ao Work/Machine Bridge;
- contexto automático de checkpoint/roadmap ainda desligado;
- sem fallback automático entre provedores;
- respostas de modelo não equivalem a decisão humana nem a autorização operacional.

No provedor OpenAI, permanecem ainda `store:false`, redirects recusados, origem fixa do adaptador e gate monetário. No Gemini, a rede continua fail-closed sem `--allow-external`.

## Relação com ChatGPT Work

O endpoint event-driven já existente continua separado:

```text
Termux → ARCA → GitHub → ChatGPT Work
```

Ele pode acordar uma tarefa Work correlacionada, mas não é um chat interativo nem reutiliza uma conversa de consumidor do ChatGPT.

Da mesma forma, `arca chat` usa o backend/API selecionado e uma sessão local em memória; ele não se conecta à sessão desta interface do ChatGPT.

## Evidência do ciclo multi-provedor

PR: **#217 — `feat(ai): tornar arca chat multi-provedor e offline por padrão`**.

Ciclo TDD:

1. teste RED definiu catálogo, Gemini em memória e console offline;
2. implementação adicionou catálogo e sessões sem ativar rede;
3. uma falha de precedência `??`/`||` foi detectada e corrigida;
4. head pré-documentação `56a531cca04c0737939e55ae7a61e56be82278f2` executou a suíte completa;
5. GitHub Actions run `37155403202`: **success**.

Arquivos de runtime alterados:

- `packages/agent/src/termux-chat-providers.ts`;
- `packages/agent/src/termux-chat-session.ts`;
- `packages/agent/src/index.ts`;
- `packages/cli/src/termux-chat.ts`;
- `packages/cli/bin/arca.mjs`;
- `tests/termux-multiprovider-chat.test.mjs`.

Nenhuma chamada Gemini/OpenAI foi realizada durante implementação/CI e nenhum gasto monetário foi autorizado neste ciclo.

## O que ainda não existe

- contexto automático de checkpoint/roadmap;
- persistência durável da conversa;
- seleção automática de provedor por custo/capability;
- consulta automática de quota/billing Gemini;
- tools automáticas;
- execução autônoma originada da resposta;
- reaproveitamento da sessão do aplicativo/site ChatGPT.

## Próximo estágio

Depois do merge desta fase:

1. smoke test **offline** no Termux;
2. teste Gemini live somente se o operador configurar sua própria chave e optar por `--allow-external`;
3. nenhum teste OpenAI pago sem autorização monetária explícita;
4. estudar contexto ARCA opt-in/minimizado somente em ciclo separado e sob a Arquitetura de Memória V0.1.
