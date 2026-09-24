# ARCA — Handoff Termux ↔ GPT 002

Data: **2026-09-24**.

Estado: **M5 PAUSADO; PR #212 PRESERVADO ABERTO; FASE A `arca ask` JÁ INTEGRADA; FASE B `arca chat` + GATE MONETÁRIO IMPLEMENTADOS EM BRANCH E AGUARDANDO CI**.

## Base

Main antes desta entrega:

`4b50f0fde11d7e245941009ce84e95993ec08f1d`

CI pós-merge da Fase A:

`36068925811` — **success**.

## Gate monetário

Uma chamada OpenAI só é admitida se houver simultaneamente:

- autorização externa;
- autorização de API paga;
- teto monetário explícito;
- modelo com preço conhecido;
- snapshot de preços ainda válido;
- estimativa conservadora abaixo do teto.

Snapshot inicial: **2026-09-24**, expirando após 30 dias sem refresh.

O gate não afirma controlar a fatura oficial. `billingCapGuaranteed=false`.

## Fase B — chat

Comando pretendido após merge:

```bash
export OPENAI_API_KEY='...'

npm run arca -- chat \
  --model gpt-6-luna \
  --allow-external \
  --allow-paid-api \
  --session-budget-usd 0.05
```

Estado de sessão:

- histórico apenas em memória;
- budget consumido não é restaurado por `/clear`;
- sem tools;
- sem shell;
- sem Core mutation;
- contexto automático do projeto desligado.

Comandos: `/status`, `/context`, `/clear`, `/help`, `/exit`.

## Próximo passo

1. executar CI completo;
2. corrigir se necessário;
3. merge se verde;
4. parar antes de qualquer chamada live paga;
5. operador configura sua própria API key e decide se quer fazer um teste mínimo no Termux.

O roadmap M5 continua pausado e não foi alterado.
