# ARCA — Handoff Termux ↔ GPT 001

Data: **2026-09-24**.

Estado: **FRENTE TERMUX ↔ GPT ATIVA; M5 PAUSADO SEM DESCARTE; PR #212 PRESERVADO ABERTO E SEM MERGE; FASE A `arca ask` IMPLEMENTADA EM BRANCH E AGUARDANDO CI**.

## Decisão

O desenvolvimento investigativo M5 foi temporariamente pausado a pedido do operador. O roadmap investigativo não foi alterado.

A nova prioridade é permitir conversa com GPT pelo Termux através das fronteiras do ARCA.

## Implementação da Fase A

Branch:

`feat/termux-openai-ask-v0-1-20260924`

Arquivos principais:

- `packages/agent/src/openai-provider.ts`;
- `packages/agent/src/openai-reasoning-bridge.ts`;
- `packages/cli/src/cli.ts`;
- `tests/openai-termux-ask.test.mjs`;
- `docs/ARCA_TERMUX_GPT_BRIDGE_V0_1.md`;
- `docs/ARCA_TERMUX_COMMANDS_V0_1.md`.

Fluxo:

`Termux → ARCA CLI → ReasoningProviderRegistry → Reasoning Transport Gate → OpenAI Responses API → ARCA → Termux`.

## Segurança

- chave somente por `OPENAI_API_KEY`;
- origem fixa `https://api.openai.com`;
- `POST /v1/responses`;
- `store:false`;
- redirects recusados;
- envio externo exige `--allow-external`;
- transporte `private-direct`, TLS e persistência efêmera;
- nenhum tool grant;
- nenhuma Core mutation;
- saída não persistida pelo bridge.

## Uso previsto após merge

```bash
export OPENAI_API_KEY='...'

npm run arca -- ask \
  --message "Onde paramos?" \
  --model gpt-6-luna \
  --allow-external
```

`--json` retorna metadados, hashes e usage.

## Próximo passo

1. CI completo da Fase A;
2. corrigir qualquer incompatibilidade;
3. merge somente se verde;
4. teste live opcional no Termux com uma chamada pequena, somente depois de o operador configurar sua própria API key;
5. Fase B: `arca chat` multi-turno, sem ferramentas automáticas.

Este checkpoint não substitui o handoff investigativo M5; é um handoff paralelo da frente Termux ↔ GPT.
