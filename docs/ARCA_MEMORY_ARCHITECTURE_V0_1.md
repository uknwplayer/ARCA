# ARCA — Arquitetura de Memória V0.1

Estado: **ATIVA COMO PADRÃO ARQUITETURAL TRANSVERSAL**

## Objetivo

Definir como o ARCA separa memória contextual de IA, memória técnica auditável e estado operacional estruturado, evitando que lembranças semânticas sejam tratadas como fatos canônicos, evidências ou estado de execução.

Este padrão também foi desenhado para ser reutilizado em futuros projetos que combinem agentes, documentação versionada e armazenamento operacional.

## Princípio central

O ARCA adota três camadas de memória com responsabilidades distintas:

1. **Memória cognitiva** — contexto semântico e persistente usado por IAs/agentes para lembrar preferências, decisões de trabalho, convenções e contexto de colaboração.
2. **Memória de projeto** — documentação versionada e auditável que registra arquitetura, decisões, checkpoints, roadmap, políticas, contratos e histórico técnico.
3. **Memória operacional** — armazenamento estruturado e consultável por máquina para estado exato de execução, filas, jobs, eventos, entidades, relações, hashes, timestamps, budgets e outros registros operacionais.

A camada de **evidência/custódia** permanece separada das três anteriores e conserva suas próprias regras de integridade, proveniência, privacidade e revisão.

## 1. Memória cognitiva

### Finalidade

Guardar contexto útil para continuidade de colaboração e raciocínio, por exemplo:

- preferências de trabalho;
- decisões de processo;
- convenções recorrentes;
- prioridades de projeto;
- padrões de comunicação;
- conhecimento contextual resumido que não precise de precisão registral.

### Pode fazer

- reduzir repetição de contexto entre sessões;
- orientar respostas e planejamento;
- lembrar preferências e decisões persistentes;
- apontar quais fontes canônicas devem ser consultadas.

### Não pode fazer

- servir como única fonte de verdade para fatos técnicos críticos;
- criar, modificar ou validar evidência;
- substituir logs, banco de dados, checkpoint, commit, recibo, hash ou fonte primária;
- afirmar estado operacional exato sem recuperação da fonte canônica;
- transformar lembrança em conclusão investigativa.

### Regra de segurança

**Uma lembrança de IA nunca, sozinha, cria ou altera fato investigativo, evidência, relação probatória, conclusão ou estado operacional canônico.**

## 2. Memória de projeto

### Fonte canônica

No ARCA, a memória de projeto reside principalmente no GitHub e nos documentos versionados.

Exemplos:

- `README.md`;
- checkpoints de handoff;
- roadmap;
- Atlas Técnico Vivo;
- políticas;
- ADRs/specs/design docs;
- código e testes;
- histórico de commits, PRs e CI.

### Propriedades

- versionada;
- auditável;
- revisável;
- comparável por diff;
- recuperável por SHA;
- adequada para handoff entre humanos e agentes.

### Regra de autoridade

Quando memória cognitiva e memória de projeto divergem, **a memória de projeto prevalece para decisões técnicas registradas**, salvo se houver evidência mais recente e explícita que ainda não tenha sido integrada.

## 3. Memória operacional

### Finalidade

Guardar estado preciso e machine-readable que precisa ser consultado, filtrado, correlacionado, deduplicado ou atualizado de forma determinística.

Exemplos futuros ou atuais conforme o componente:

- fila investigativa;
- jobs e dispatches;
- estado de agentes/workers;
- event store;
- entidades e relações;
- hashes e digests;
- timestamps;
- manifests;
- budgets e contadores;
- índices de deduplicação;
- leases e replay registries;
- telemetria permitida.

### Requisitos

- schema explícito;
- identidade estável dos registros;
- timestamps e versionamento quando necessário;
- idempotência para operações reexecutáveis;
- validação de entrada;
- política clara de retenção;
- backup/recuperação compatíveis com criticidade;
- nenhuma dependência da memória semântica de um modelo para recuperar estado exato.

### Regra de autoridade

Para estado de execução, **o armazenamento operacional validado prevalece sobre memória cognitiva e narrativa de chat**.

## 4. Evidência e custódia — camada separada

Material investigativo, bytes de fonte, recibos, hashes de proveniência, envelopes custodiais e demais evidências seguem o plano de evidência do ARCA.

Eles não devem ser copiados automaticamente para memória cognitiva, documentação pública ou banco operacional genérico.

Regras:

- manter proveniência explícita;
- preservar hashes e cadeia de custódia;
- material bruto permanece privado quando aplicável;
- dados derivados devem apontar para sua origem verificável;
- memória cognitiva pode lembrar que uma evidência existe, mas não substitui sua recuperação e verificação.

## 5. Ordem de resolução de conflitos

Quando duas camadas divergem, usar esta ordem:

1. **evidência/fonte primária verificada**, quando a questão é factual ou investigativa;
2. **estado operacional validado**, quando a questão é de execução;
3. **documentação técnica versionada mais recente**, quando a questão é de arquitetura, política ou decisão de projeto;
4. **memória cognitiva**, apenas como contexto auxiliar.

Nenhuma camada inferior deve sobrescrever silenciosamente uma superior.

## 6. Fluxo recomendado de leitura

Um agente que retoma trabalho deve:

1. usar memória cognitiva para localizar contexto e intenções;
2. consultar checkpoint/roadmap/Atlas para confirmar a decisão técnica vigente;
3. consultar o armazenamento operacional para estado exato da execução;
4. recuperar evidência/fonte primária quando uma conclusão depender de fatos;
5. registrar mudanças materiais na camada apropriada antes de encerrar o bloco.

## 7. Fluxo recomendado de escrita

### Decisão de trabalho persistente

- pode entrar em memória cognitiva;
- se afetar arquitetura/processo, também deve ser registrada na memória de projeto.

### Mudança arquitetural

- atualizar documentação versionada;
- atualizar Atlas quando aplicável;
- atualizar roadmap/checkpoint;
- código/schema somente após gate de implementação correspondente.

### Mudança de estado de execução

- escrever no armazenamento operacional apropriado;
- emitir logs/recibos/telemetria conforme contrato;
- não depender de chat para persistência.

### Evidência nova

- seguir cadeia de custódia;
- não promover automaticamente para memória cognitiva;
- derivar apenas representações permitidas e rastreáveis.

## 8. Modelo reutilizável para outros projetos

Para novos projetos com IA/agentes, usar por padrão a mesma separação:

```text
Cognitive Memory
    ↓ contexto, preferências, decisões de trabalho
Project Memory
    ↓ specs, docs, checkpoints, versionamento
Operational Memory
    ↓ estado exato, registros, filas, eventos
Evidence / Primary Sources
    ↓ verdade verificável e proveniência
```

A implementação concreta pode variar — por exemplo Git + Markdown, SQLite/PostgreSQL, event store ou object storage — mas as responsabilidades não devem ser misturadas.

## 9. Critérios de escolha de tecnologia

### Git/Markdown

Usar para decisões, documentação, políticas, designs, handoffs e histórico humano/auditável.

### SQLite

Preferível para runtime local/single-node, baixo consumo e operação móvel/Termux quando o volume e concorrência permitirem.

### PostgreSQL ou equivalente

Preferível quando houver múltiplos writers, concorrência, serviço contínuo, consultas relacionais complexas ou implantação multiusuário.

### Event store

Preferível quando o histórico de transições e replay auditável fizer parte do contrato do domínio.

### Object/content-addressed storage

Preferível para blobs, artefatos, envelopes e custódia que exijam hash, retenção e recuperação de bytes.

A escolha da tecnologia nunca muda a regra de autoridade entre as camadas.

## 10. Segurança e privacidade

- não persistir segredos em memória cognitiva ou documentação pública;
- aplicar least privilege ao armazenamento operacional;
- separar material bruto, dados pessoais e evidência do contexto de conversação;
- usar deny-by-default para qualquer sincronização automática entre camadas;
- evitar que prompts ou memória de IA tenham autoridade direta para mutações críticas;
- toda promoção de informação entre camadas deve ser explícita, validada e auditável quando houver impacto relevante.

## 11. Estado atual

Esta V0.1 é uma **decisão arquitetural e de governança**. Ela não cria novo banco de dados, não migra dados e não altera o Core ou a cadeia de custódia neste bloco.

Implementações futuras de persistência devem declarar explicitamente a qual camada pertencem e obedecer às regras desta arquitetura.
