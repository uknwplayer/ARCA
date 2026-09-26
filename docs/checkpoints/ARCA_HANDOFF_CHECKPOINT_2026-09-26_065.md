# ARCA — Handoff checkpoint 065

Data: **2026-09-26**

Tema: **Arquitetura de Memória V0.1 — separação entre contexto cognitivo, memória de projeto, estado operacional e evidência**

Estado: **DECISÃO ARQUITETURAL INTEGRADA DOCUMENTALMENTE / ZERO MUDANÇA DE RUNTIME / ZERO REDE / ZERO NOVO BANCO**

Base imediatamente anterior ao checkpoint: `ec548fa73375811c869b5f2e612bef43924a1d7f`.

Checkpoint anterior: [`ARCA_HANDOFF_CHECKPOINT_2026-09-24_064.md`](ARCA_HANDOFF_CHECKPOINT_2026-09-24_064.md).

## Objetivo do bloco

Transformar a ideia de usar memória de IA como contexto persistente em um contrato seguro e reutilizável, sem tratá-la como banco de dados canônico nem misturá-la com evidência investigativa.

## Decisão permanente

O ARCA passa a adotar quatro responsabilidades claramente separadas:

1. **Memória cognitiva** — contexto, preferências, decisões de trabalho e conhecimento semântico auxiliar para IA/agentes.
2. **Memória de projeto** — GitHub, código, documentação, checkpoints, roadmap, Atlas, políticas, PRs e CI como registro técnico versionado/auditável.
3. **Memória operacional** — armazenamento estruturado para estado exato consultável por máquina: eventos, jobs, filas, entidades, relações, hashes, timestamps, budgets, leases e registros equivalentes.
4. **Evidência/custódia** — permanece separada e sujeita às regras de proveniência, integridade, privacidade e revisão do ARCA.

Regra crítica: **memória cognitiva nunca, sozinha, cria ou modifica fato investigativo, evidência, relação probatória, conclusão ou estado operacional canônico.**

## Ordem de autoridade

Quando houver divergência:

1. evidência/fonte primária verificada para fatos;
2. armazenamento operacional validado para estado de execução;
3. documentação técnica versionada para arquitetura, política e decisões;
4. memória cognitiva apenas como contexto auxiliar.

## Arquivos criados

- `docs/ARCA_MEMORY_ARCHITECTURE_V0_1.md` — contrato normativo completo;
- `docs/atlas/ARCA_ATLAS_MEMORY_ARCHITECTURE_V0_1.md` — registro lógico no Atlas;
- `docs/ARCA_MEMORY_ARCHITECTURE_ROADMAP_V0_1.md` — evolução futura MA-0..MA-5;
- este checkpoint histórico.

## Arquivos alterados

- `README.md` — link de entrada, seção de arquitetura de memória, linha de componente e novo princípio invariante.

## Commits do bloco antes do checkpoint

- `bf3d4c8390ebb793bb21b0db89f406c8cb9c28e7` — arquitetura de memória V0.1;
- `4a6069ac52067e41a41e0044d951aef546f76847` — README integra arquitetura de memória;
- `0620e6f5cfa4faf4c8341662420b6dbb74d26e33` — registro no Atlas;
- `ec548fa73375811c869b5f2e612bef43924a1d7f` — roadmap específico da arquitetura de memória.

## Impacto no runtime

Nenhum neste bloco.

- não foi criado SQLite/PostgreSQL/vector store;
- não houve migration;
- não mudou `arca ask`/`arca chat`;
- não mudou Core/event store;
- não mudou fila investigativa;
- não mudou custódia;
- não houve chamada externa;
- não houve alteração de autoridade de agentes.

## Segurança

- deny-by-default para promoção automática entre camadas;
- segredo não pertence à memória cognitiva ou documentação pública;
- evidência bruta não migra automaticamente para memória de IA;
- memória semântica não controla idempotência, replay ou mutações críticas;
- se a fonte canônica estiver indisponível, registrar desconhecido/indisponível em vez de inferir pelo contexto lembrado.

## Relação com M5

Esta decisão é transversal e **não altera o caminho crítico investigativo M5**. O estado registrado no checkpoint 064 permanece a referência operacional anterior para M5: M5-N1 esgotou as duas contratações atuais e o próximo passo investigativo continua sendo procurar outra ponte pública oficial ou ampliar a amostra sob os controles existentes.

## Próximos passos do trilho de memória

O trilho `MA-*` fica subordinado à necessidade real:

- MA-0: concluído documentalmente;
- MA-1: classificar persistências existentes quando a frente for ativada;
- MA-2: avaliar persistência local leve somente quando houver caso de uso concreto;
- MA-3: banco multiwriter apenas se necessário;
- MA-4: recuperação semântica futura, sempre apontando para fonte canônica;
- MA-5: memória do Runtime Autônomo Local permanece congelada junto com esse runtime.

Não implementar banco apenas para “ter memória”.

## Modelo reutilizável

A arquitetura foi declarada explicitamente reutilizável em futuros projetos com IA/agentes:

`Cognitive Memory → Project Memory → Operational Memory`, mantendo `Evidence / Primary Sources` em camada separada e superior para verificação factual.

## Verificação recomendada

Revisar diretamente:

1. `README.md`;
2. `docs/ARCA_MEMORY_ARCHITECTURE_V0_1.md`;
3. `docs/atlas/ARCA_ATLAS_MEMORY_ARCHITECTURE_V0_1.md`;
4. `docs/ARCA_MEMORY_ARCHITECTURE_ROADMAP_V0_1.md`;
5. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md` após sua atualização para este checkpoint.

Como este bloco é exclusivamente documental, nenhum teste de runtime é reivindicado como prova desta decisão. A verificação mínima é presença/conteúdo dos documentos e links de entrada.

## Condição de parada

Qualquer futura implementação de memória operacional, vector store, persistência de chat ou runtime local deve parar antes de escrever código se não estiver definido:

- qual camada recebe os dados;
- qual é a fonte canônica;
- quem pode escrever;
- retenção e recuperação;
- stale-data policy;
- relação permitida com evidência/custódia;
- controles contra mutação crítica baseada apenas em memória de IA.
