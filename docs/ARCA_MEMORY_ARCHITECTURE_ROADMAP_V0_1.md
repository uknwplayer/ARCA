# ARCA — Roadmap da Arquitetura de Memória V0.1

Estado: **ATIVO COMO TRILHO TRANSVERSAL / IMPLEMENTAÇÃO OPERACIONAL AINDA FUTURA**

Documento normativo: [`ARCA_MEMORY_ARCHITECTURE_V0_1.md`](ARCA_MEMORY_ARCHITECTURE_V0_1.md)

Este trilho não substitui o roadmap investigativo principal. Ele define como futuras capacidades de persistência devem evoluir sem misturar memória semântica, estado operacional e evidência.

## MA-0 — Contrato arquitetural

Estado: **CONCLUÍDO DOCUMENTALMENTE**

- definir memória cognitiva;
- definir memória de projeto;
- definir memória operacional;
- manter evidência/custódia separada;
- definir ordem de autoridade e resolução de conflitos;
- registrar regras de segurança e promoção entre camadas.

Aceite: `docs/ARCA_MEMORY_ARCHITECTURE_V0_1.md` existe, é referenciado pelo README e pelo Atlas.

## MA-1 — Classificação de persistências existentes

Estado: **PENDENTE / NÃO BLOQUEIA M5**

Quando esta frente for ativada, mapear sem alterar comportamento:

- Core + event store;
- fila investigativa;
- challenge/replay registries;
- histórico de `arca chat` atualmente apenas em memória de processo;
- checkpoints e roadmap;
- custódia privada;
- futuros caches/embeddings/vector stores, caso existam.

Cada item deverá declarar camada, autoridade, retenção, recuperação e impacto de stale data.

## MA-2 — Persistência local mínima para conversa/agentes

Estado: **FUTURO / DEPENDE DE NECESSIDADE REAL**

Preferência inicial para runtime single-node/Termux: SQLite ou equivalente leve, desde que haja:

- schema explícito;
- migrations versionadas;
- idempotência;
- limites de tamanho/retenção;
- separação de secrets;
- export/backup;
- testes de corrupção e recuperação;
- nenhum uso como custódia investigativa.

Não implementar apenas para “ter memória”. Deve haver caso de uso operacional concreto.

## MA-3 — Serviço operacional multiwriter

Estado: **FUTURO / CONDICIONAL**

Somente se o ARCA evoluir para múltiplos writers/serviço contínuo, avaliar PostgreSQL ou equivalente. O gate deve provar que SQLite/single-node deixou de atender a concorrência, disponibilidade ou consultas necessárias.

## MA-4 — Recuperação semântica

Estado: **FUTURO / CONDICIONAL**

Embeddings/vector store podem ser usados para busca contextual, mas:

- nunca são fonte probatória;
- resultados devem apontar para documento/registro canônico;
- index pode ser reconstruível;
- stale embeddings não podem autorizar mutações;
- material bruto investigativo não entra automaticamente no índice.

## MA-5 — Runtime autônomo local

Estado: **CONGELADO COM O RUNTIME AUTÔNOMO LOCAL**

Quando o Runtime Autônomo Local for ativado, sua memória deve obedecer à V0.1 e declarar separadamente:

- working memory;
- memória cognitiva persistente;
- memória operacional;
- tool/action log;
- fonte canônica técnica;
- ligação permitida com custódia.

## Regras de avanço

- nenhuma etapa deste trilho ganha prioridade sobre o núcleo investigativo sem decisão humana explícita;
- mudança operacional requer testes e checkpoint próprio;
- segredo e evidência bruta não migram para memória cognitiva;
- toda implementação deve ser reversível ou possuir recuperação definida;
- a escolha de tecnologia vem depois da definição de autoridade e dados, nunca antes.
