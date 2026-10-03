# ARCA — Handoff Termux ↔ modelos 003

Data: **2026-10-03**.

Estado: **M5 PAUSADO; FRENTE TERMUX CHAT LIMITADA ATIVA; PR #217 MULTI-PROVEDOR IMPLEMENTADO; CI PRÉ-DOCUMENTAÇÃO VERDE; ZERO CHAMADA LIVE DE MODELO; ZERO GASTO AUTORIZADO**.

## PR e evidência

PR: **#217 — `feat(ai): tornar arca chat multi-provedor e offline por padrão`**.

Head de runtime verificado antes da atualização documental:

`56a531cca04c0737939e55ae7a61e56be82278f2`

CI:

`37155403202` — **completed / success**.

A suíte completa e os gates do repositório passaram nesse head.

## Comportamento implementado

### Offline — default

```bash
npm run arca -- chat
```

- não exige API key;
- não exige budget;
- não faz rede para modelo;
- `/providers` lista `offline`, `gemini`, `openai`.

### Gemini

```bash
export GEMINI_API_KEY='...'
npm run arca -- chat --provider gemini --allow-external
```

- reutiliza `createGeminiProviderClient`;
- modelo padrão `gemini-2.5-flash`;
- histórico apenas em memória;
- `toolsAuthorized=false`;
- `coreMutationAuthorized=false`;
- rede bloqueada sem `--allow-external`;
- não requer budget monetário interno do ARCA;
- `freeTierEligible=true` e `freeTierGuaranteed=false`;
- nenhum fallback automático para OpenAI/tier pago.

### OpenAI

```bash
export OPENAI_API_KEY='...'
npm run arca -- chat \
  --provider openai \
  --allow-external \
  --allow-paid-api \
  --session-budget-usd 0.05
```

Mantém gate monetário, autorização externa, autorização paga e budget explícito.

## Segurança preservada

- memória de conversa somente no processo;
- nenhuma tool automática;
- nenhum shell;
- nenhuma mutação do Core;
- nenhuma execução automática pelo Work/Machine Bridge;
- nenhuma chamada live Gemini/OpenAI neste ciclo;
- nenhuma credencial adicionada ao repositório;
- M5 não foi alterado;
- Vince/Edge/Runtime móvel não foram reativados.

## Arquivos de runtime do PR

- `packages/agent/src/index.ts`;
- `packages/agent/src/termux-chat-providers.ts`;
- `packages/agent/src/termux-chat-session.ts`;
- `packages/cli/bin/arca.mjs`;
- `packages/cli/src/termux-chat.ts`;
- `tests/termux-multiprovider-chat.test.mjs`.

## Documentação deste ciclo

- `docs/ARCA_TERMUX_COMMANDS_V0_1.md` atualizado para V0.2;
- `docs/ARCA_TERMUX_GPT_BRIDGE_V0_1.md` atualizado para a topologia multi-provedor;
- este handoff 003;
- checkpoint global 066;
- roadmap detalhado deve registrar a frente como limitada e não concorrente com M5.

## Próximo passo

1. terminar a atualização documental;
2. executar CI do head documental final;
3. merge do PR #217 somente se o head exato estiver verde e mergeável;
4. verificar CI pós-merge na `main`;
5. depois, no Termux, primeiro smoke test offline;
6. teste Gemini live somente se o operador configurar a própria chave e optar explicitamente por `--allow-external`;
7. OpenAI continua sem teste pago sem autorização monetária explícita.

Não retomar M5 dentro deste ciclo de fechamento da ponte Termux.