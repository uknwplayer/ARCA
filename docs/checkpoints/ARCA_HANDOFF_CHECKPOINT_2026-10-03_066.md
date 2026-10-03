# ARCA — Handoff checkpoint 066

Data: **2026-10-03**.

Estado: **PONTE TERMUX CHAT MULTI-PROVEDOR EM FECHAMENTO NO PR #217; RUNTIME TESTADO EM CI VERDE; M5 PRESERVADO/PAUSADO; MEMÓRIA V0.1 PRESERVADA; VINCE/EDGE NÃO REATIVADOS**.

## Escopo deste checkpoint

Este ciclo é uma exceção limitada ao congelamento da frente móvel: o operador solicitou explicitamente uma interface de conversa pelo Termux. A mudança não reabre Edge Steward, Runtime Autônomo Local, Vince Discovery Global ou expansão de capabilities do aparelho.

## Estado Termux chat

PR: **#217 — `feat(ai): tornar arca chat multi-provedor e offline por padrão`**.

Head de runtime verificado antes dos commits documentais:

`56a531cca04c0737939e55ae7a61e56be82278f2`

CI desse head:

`37155403202` — **success**.

Implementado:

1. `arca chat` abre em `offline` por padrão, sem chave, budget ou rede para modelo;
2. `/providers` apresenta `offline`, `gemini` e `openai`;
3. Gemini usa `GEMINI_API_KEY`, modelo padrão `gemini-2.5-flash` e exige `--allow-external`;
4. Gemini não recebe budget monetário interno automático, mas gratuidade não é garantida;
5. OpenAI mantém `OPENAI_API_KEY`, `--allow-external`, `--allow-paid-api` e budget de sessão explícito;
6. todos os históricos permanecem apenas em memória;
7. zero tools, zero shell e zero Core mutation;
8. zero fallback automático entre provedores.

Nenhuma chamada live Gemini/OpenAI foi feita durante o ciclo e nenhum gasto foi autorizado.

Handoff específico: `docs/checkpoints/ARCA_TERMUX_GPT_HANDOFF_003.md`.

## Estado da Arquitetura de Memória

O checkpoint 065 de 2026-09-26 continua sendo a referência arquitetural da Memória V0.1. Este ciclo não cria SQLite, PostgreSQL, vector store, embeddings ou persistência durável do chat.

A conversa continua sendo memória de processo. Qualquer persistência futura deve obedecer à precedência definida pela Arquitetura de Memória V0.1.

## Estado investigativo M5 preservado

O checkpoint operacional **064** permanece a referência do núcleo investigativo.

M5-N1 segue concluído para as duas contratações atuais: 9 itens observados, zero `temResultado=true`, cobertura completa e M5-N2 não aplicável a esses itens.

Nenhum novo GET PNCP/Portal foi executado neste ciclo. Nenhuma correlação/publicação foi autorizada.

## Congelamentos preservados

Continuam congelados no caminho crítico:

- ARCA Edge Steward;
- Runtime Autônomo Local;
- expansão Vince/Device;
- capacidades móveis além desta CLI de chat explicitamente solicitada.

## Documentos alterados neste ciclo

- `docs/ARCA_TERMUX_COMMANDS_V0_1.md` → V0.2;
- `docs/ARCA_TERMUX_GPT_BRIDGE_V0_1.md` → descrição multi-provedor;
- `docs/checkpoints/ARCA_TERMUX_GPT_HANDOFF_003.md`;
- este checkpoint 066;
- `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`;
- roadmap detalhado, registrando o trilho Termux chat como limitado.

## Próximos gates

1. concluir atualização documental;
2. CI completo do head final do PR #217;
3. merge somente com head exato verde e mergeável;
4. confirmar CI pós-merge da `main`;
5. smoke test offline no Termux;
6. somente depois, teste Gemini opcional com chave do operador e `--allow-external`;
7. não chamar OpenAI paga sem autorização monetária explícita.

## Retomada posterior do núcleo

Quando esta frente Termux for encerrada, a retomada M5 deve reler:

1. este checkpoint para saber por que M5 foi pausado;
2. checkpoint 064 para o estado operacional investigativo;
3. Arquitetura de Memória/checkpoint 065 quando houver persistência/contexto;
4. roadmap detalhado atual.

Não interpretar este checkpoint como autorização para reativar Edge/Vince/Runtime móvel.