# ARCA — Atlas / Arquitetura de Memória V0.1

Estado: **ATIVO / REFERÊNCIA TRANSVERSAL DO ATLAS**

Documento normativo relacionado: [`../ARCA_MEMORY_ARCHITECTURE_V0_1.md`](../ARCA_MEMORY_ARCHITECTURE_V0_1.md)

## Componente lógico: arca-memory-architecture

- **tipo:** governança / arquitetura transversal;
- **finalidade:** separar contexto cognitivo, documentação auditável, estado operacional e evidência/custódia;
- **estado:** V0.1 ativa, documental; nenhum banco novo criado neste bloco;
- **localização normativa:** `docs/ARCA_MEMORY_ARCHITECTURE_V0_1.md`;
- **dependências:** Atlas Técnico Vivo, política de checkpoint, Core/event store, custódia e futuros runtimes/agentes;
- **chamado por:** operadores, agentes, Chat Gateway, Runtime Autônomo Local futuro e qualquer componente que persista estado/contexto;
- **entradas:** contexto de trabalho, decisões, documentação técnica, estado operacional, referências de evidência;
- **saídas:** classificação da informação por camada e indicação da fonte canônica correta;
- **capabilities:** roteamento conceitual de persistência, resolução de autoridade e prevenção de mistura entre memória semântica e fato canônico;
- **limites:** não persiste segredo, não cria evidência, não concede autoridade de escrita, não substitui banco/event store/custódia;
- **health check:** toda nova persistência deve declarar explicitamente sua camada e fonte canônica;
- **modos de falha:** memória cognitiva tratada como verdade, duplicação de estado, divergência silenciosa entre camadas, promoção indevida de material bruto para contexto de IA;
- **recuperação:** voltar à fonte canônica superior, reconciliar divergência, registrar correção na camada apropriada e atualizar checkpoint;
- **fallback:** fail-closed para fatos críticos — se a fonte canônica não puder ser recuperada, registrar como desconhecido/indisponível em vez de inferir pela memória da IA;
- **risco de reexecução:** depende da camada operacional concreta; memória cognitiva nunca deve controlar idempotência;
- **runbook:** `docs/ARCA_MEMORY_ARCHITECTURE_V0_1.md` e `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`;
- **segurança:** deny-by-default entre camadas, least privilege, separação de custódia, validação explícita antes de qualquer mutação crítica.

## Hierarquia de autoridade

1. evidência/fonte primária verificada para fatos investigativos;
2. armazenamento operacional validado para estado de execução;
3. documentação técnica versionada para arquitetura/políticas/decisões;
4. memória cognitiva apenas como contexto auxiliar.

## Regra de integração futura

Qualquer novo componente que introduza memória, cache, banco, contexto persistente, embeddings, vector store, histórico de chat ou armazenamento de agente deve declarar no design:

- a qual camada pertence;
- qual é sua fonte de verdade;
- o que pode e não pode ser promovido para outra camada;
- política de retenção;
- estratégia de recuperação;
- risco de stale data;
- controles contra escrita crítica baseada apenas em memória de IA.
