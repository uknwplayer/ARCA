# ARCA — Handoff checkpoint atual

Checkpoint: **2026-09-26 / Checkpoint 065 — Arquitetura de Memória V0.1 integrada documentalmente**

Estado: **nova arquitetura transversal de memória registrada; zero mudança de runtime, zero rede e zero novo banco; M5 permanece no estado operacional do checkpoint 064**.

Handoff mais recente: [checkpoint 065 — Arquitetura de Memória V0.1](ARCA_HANDOFF_CHECKPOINT_2026-09-26_065.md).

Checkpoint operacional anterior do núcleo investigativo: [checkpoint 064 — observação offline M5-N1 validou 9 itens e zero resultados](ARCA_HANDOFF_CHECKPOINT_2026-09-24_064.md).

## Decisão transversal nova — Arquitetura de Memória V0.1

O ARCA passa a separar explicitamente:

1. **memória cognitiva** — contexto, preferências e decisões de trabalho de IA/agentes;
2. **memória de projeto** — GitHub, código, docs, checkpoints, roadmap, Atlas, políticas, PRs e CI;
3. **memória operacional** — estado exato consultável por máquina, como eventos, filas, jobs, hashes, timestamps, budgets, leases e registros equivalentes;
4. **evidência/custódia** — camada separada, com proveniência, integridade, privacidade e revisão próprias.

Regra crítica: **memória cognitiva nunca, sozinha, cria ou altera fato investigativo, evidência, relação probatória, conclusão ou estado operacional canônico.**

Ordem de autoridade em conflito:

1. evidência/fonte primária verificada para fatos;
2. armazenamento operacional validado para estado de execução;
3. documentação técnica versionada para arquitetura/políticas/decisões;
4. memória cognitiva apenas como contexto auxiliar.

Documentos:

- [`ARCA_MEMORY_ARCHITECTURE_V0_1.md`](../ARCA_MEMORY_ARCHITECTURE_V0_1.md) — contrato normativo;
- [`ARCA_ATLAS_MEMORY_ARCHITECTURE_V0_1.md`](../atlas/ARCA_ATLAS_MEMORY_ARCHITECTURE_V0_1.md) — registro no Atlas;
- [`ARCA_MEMORY_ARCHITECTURE_ROADMAP_V0_1.md`](../ARCA_MEMORY_ARCHITECTURE_ROADMAP_V0_1.md) — trilho MA-0..MA-5.

## Estado investigativo preservado

O checkpoint 064 continua sendo a referência operacional para M5. M5-N1 foi concluído para as duas contratações atuais: o live `36051395397` obteve HTTP 200+200/STORED_PRIVATE; a observação offline `36052511200` usou zero source requests, validou 9 itens (4+5), cobertura completa e `totalItemsWithResult=0`. M5-N2 não se aplica a esses itens e não deve executar GETs de resultados.

O próximo passo investigativo continua sendo procurar outra ponte pública oficial ou ampliar a amostra de contratações sob os controles existentes. A Arquitetura de Memória não reativa Edge Steward, Runtime Autônomo Local, Vince Discovery Global ou outras frentes congeladas.

## Estado da ponte Termux ↔ GPT

O foco temporário de conversa ARCA ↔ GPT permanece válido. `arca ask` e `arca chat` seguem sujeitos ao `ReasoningProviderRegistry`, Reasoning Transport Gate e gate monetário. O histórico de chat atual permanece em memória de processo; persistência durável futura deverá obedecer à Arquitetura de Memória V0.1.

## Próximos passos do trilho de memória

- MA-0: concluído documentalmente;
- MA-1: classificar persistências existentes quando houver decisão de ativar essa frente;
- MA-2: persistência local leve somente quando existir caso de uso operacional real;
- MA-3: banco multiwriter somente se concorrência/serviço contínuo justificarem;
- MA-4: recuperação semântica futura sempre apontando para fonte canônica;
- MA-5: memória do Runtime Autônomo Local permanece congelada junto com esse runtime.

Não criar banco apenas para “ter memória”.

## Continuidade

Ao retomar qualquer trabalho que envolva memória, contexto persistente, cache, banco, embeddings, vector store, histórico de chat ou armazenamento de agente, ler primeiro:

1. este checkpoint;
2. `docs/ARCA_MEMORY_ARCHITECTURE_V0_1.md`;
3. o checkpoint operacional específico da frente em andamento;
4. o Atlas Técnico Vivo e o roadmap correspondente.

Para o núcleo investigativo M5, ler também o checkpoint 064 antes de qualquer execução.
