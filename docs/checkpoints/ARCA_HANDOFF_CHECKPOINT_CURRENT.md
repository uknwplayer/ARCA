# ARCA — Handoff checkpoint atual

Checkpoint: **2026-10-03 / Checkpoint 066 — `arca chat` multi-provedor no Termux**

Estado: **PR #217 em fechamento documental; runtime multi-provedor verificado em CI; zero chamada live de modelo; M5 permanece pausado no estado operacional do checkpoint 064; Arquitetura de Memória V0.1 do checkpoint 065 preservada; Edge/Vince/Runtime móvel continuam congelados fora do escopo limitado desta CLI**.

Handoff mais recente: [checkpoint 066 — Termux chat multi-provedor](ARCA_HANDOFF_CHECKPOINT_2026-10-03_066.md).

Handoff específico da ponte: [Termux ↔ modelos 003](ARCA_TERMUX_GPT_HANDOFF_003.md).

Referências preservadas:

- [checkpoint 065 — Arquitetura de Memória V0.1](ARCA_HANDOFF_CHECKPOINT_2026-09-26_065.md);
- [checkpoint 064 — observação offline M5-N1 validou 9 itens e zero resultados](ARCA_HANDOFF_CHECKPOINT_2026-09-24_064.md).

## Estado da ponte Termux ↔ modelos

O `arca chat` passa a ter três backends explícitos:

1. **offline** — padrão; sem chave, sem budget e sem rede para modelo;
2. **gemini** — exige `GEMINI_API_KEY` + `--allow-external`; default `gemini-2.5-flash`; elegível a free tier, mas gratuidade não é garantida;
3. **openai** — preserva `OPENAI_API_KEY`, `--allow-external`, `--allow-paid-api` e budget explícito.

Comandos locais: `/status`, `/context`, `/providers`, `/clear`, `/help`, `/exit`.

Em todos os modos o histórico permanece apenas em memória do processo. Nenhum modelo recebe tools, shell ou autoridade para alterar o Core. Não existe fallback automático entre provedores nem reaproveitamento de uma sessão do aplicativo/site ChatGPT.

PR: **#217**. Head de runtime verificado antes dos commits documentais: `56a531cca04c0737939e55ae7a61e56be82278f2`. CI: `37155403202` — **success**.

Nenhuma chamada live Gemini/OpenAI foi feita durante este ciclo e nenhum gasto monetário foi autorizado.

## Estado da Arquitetura de Memória

A arquitetura transversal do checkpoint 065 continua vigente:

1. memória cognitiva;
2. memória de projeto;
3. memória operacional;
4. evidência/custódia como camada separada.

Memória cognitiva nunca, sozinha, cria ou altera fato investigativo, evidência, relação probatória, conclusão ou estado operacional canônico.

Este ciclo não criou banco, vector store, embeddings ou persistência de conversa.

## Estado investigativo preservado

O checkpoint 064 continua sendo a referência operacional para M5. M5-N1 foi concluído para as duas contratações atuais: o live `36051395397` obteve HTTP 200+200/STORED_PRIVATE; a observação offline `36052511200` usou zero source requests, validou 9 itens (4+5), cobertura completa e `totalItemsWithResult=0`. M5-N2 não se aplica a esses itens e não deve executar GETs de resultados.

Nenhum novo GET PNCP/Portal foi executado na frente Termux chat.

## Congelamentos preservados

A autorização específica para trabalhar no `arca chat` **não** reativa:

- Edge Steward;
- Runtime Autônomo Local;
- Vince Discovery Global;
- expansão de capabilities do aparelho;
- serviço móvel 24/7.

## Próximos passos

1. concluir documentação e roadmap do PR #217;
2. executar CI completo no head final;
3. merge somente se o head exato estiver verde e mergeável;
4. confirmar CI pós-merge da `main`;
5. fazer primeiro um smoke test offline no Termux;
6. teste Gemini live é opcional e exige chave do operador + `--allow-external`;
7. OpenAI paga continua proibida sem autorização monetária explícita;
8. só depois encerrar esta pausa e retomar M5 pelo checkpoint 064.

## Documentos de retomada

Para Termux chat:

1. este checkpoint;
2. `docs/checkpoints/ARCA_TERMUX_GPT_HANDOFF_003.md`;
3. `docs/ARCA_TERMUX_COMMANDS_V0_1.md`;
4. `docs/ARCA_TERMUX_GPT_BRIDGE_V0_1.md`.

Para M5:

1. este checkpoint para entender a pausa;
2. checkpoint 064 para o estado operacional;
3. roadmap detalhado atual;
4. Atlas Técnico Vivo e política GET por custo quando aplicável.
