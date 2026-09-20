# ARCA Core Specification v1.0.0

**Status:** candidata normativa para ratificação  
**Implementação de referência:** `arca-core-v1-foundation` 0.2.0  
**Conformidade associada:** ACS-v0.1  
**Idioma normativo:** português brasileiro

## 1. Propósito

O ARCA Core é o núcleo determinístico que preserva a estrutura, a proveniência e a história de uma investigação. Ele não decide sozinho se uma alegação é verdadeira. Ele impede promoções silenciosas entre documento, informação, proposição, hipótese e conclusão; registra o caminho usado por quem avaliou; e permite a qualquer implementação compatível reconstruir e auditar o estado.

São princípios normativos:

> O Crivo não procura uma conclusão. Procura evidências.

> Investigação é grafo, não narrativa.

> Sem inferência automática.

Os termos **DEVE**, **NÃO DEVE**, **DEVERIA**, **NÃO DEVERIA** e **PODE** têm os significados da ACS-v0.1.

## 2. Escopo do Core

O Core DEVE:

1. funcionar integralmente offline;
2. manter uma investigação como grafo tipado;
3. executar mudanças apenas por operações registradas;
4. reconstruir o estado a partir do event log;
5. preservar versões e invalidações;
6. gerar TRACE sem inventar nós ou apagar ramificações;
7. validar estrutura e regras mecanizáveis;
8. distinguir verificação estrutural, criptográfica e semântica;
9. exportar estado e eventos em formato portátil;
10. manter IA, rede, OCR, busca e publicação como adaptadores opcionais.

O Core NÃO DEVE:

- promover informação a fato automaticamente;
- aceitar um documento como prova direta de uma conclusão;
- marcar dependentes como falsos apenas porque um suporte foi invalidado;
- fabricar aquisição, hash, localização, independência ou precisão;
- declarar `ARCA-Compatible` quando requisitos críticos permanecem `PARTIAL`, `FAIL` ou `UNSPECIFIED`.

## 3. Modelo canônico

### 3.1 Raiz e questão

Cada investigação possui uma raiz `INV` e pelo menos uma questão `Q`. A questão é nó de primeira classe. O campo textual legado `investigation.question` pode ser importado, mas DEVE ser convertido em `Q` e ligado à investigação por `has_question`.

### 3.2 Tipos de nó

| Prefixo | Tipo | Papel |
|---|---|---|
| `INV-` | investigação | pergunta, objetivo, escopo, limites e ciclo de vida |
| `Q-` | questão | pergunta verificável ligada à raiz |
| `SRC-` | fonte | origem, autoridade e grupo de independência declarado |
| `DOC-` | documento | registro material obtido de uma fonte |
| `INF-` | informação | conteúdo extraído com localização e transformação |
| `PRO-` | proposição | afirmativa atômica avaliável |
| `ENT-` | entidade | pessoa, organização, lugar ou outro ator |
| `EVT-` | evento de domínio | ocorrência investigada, não evento técnico do log |
| `HIP-` | hipótese | modelo explicativo rival e falseável |
| `CON-` | conclusão | síntese proporcional e reabrível |
| `FRM-` | enquadramento | forma lógica, jurídica ou regulatória separada do fato |
| `GAP-` | lacuna | ausência operacionalmente acompanhada |
| `SEA-` | busca | consulta executada e seus limites |
| `REL-` | relação | aresta explícita entre dois nós existentes |

Eventos técnicos usam `EVLOG-` para não colidir com eventos de domínio `EVT-`.

### 3.3 Estados epistêmicos

O Core reconhece: `Confirmado`, `Provável`, `Possível`, `Não verificado`, `Contradito` e `Desconhecido`. Valores equivalentes importados DEVEM conservar o texto original e registrar o mapeamento. Esses estados não são probabilidades.

### 3.4 Estados de lacuna L0–L6

| Estado | Significado canônico |
|---|---|
| `L0` | não investigada |
| `L1` | investigada e não localizada |
| `L2` | solicitada e não fornecida |
| `L3` | existente, mas estruturalmente inacessível |
| `L4` | retida ou restrita por autoridade/custodiante |
| `L5` | existência não demonstrada |
| `L6` | destruída, perdida ou irrecuperável com base registrada |

Tipos de falha como fonte única, cadeia quebrada ou temporalidade insuficiente usam `gapType`; nunca reutilizam L0–L6.

## 4. Relações e evidência

Relações possuem `from`, `to`, `relationType`, `category`, justificativa, validade e temporalidade. Os nós das duas pontas DEVEM existir.

Evidência é um papel exercido por uma relação `INF → PRO`. O efeito DEVE ser um de:

- `supports`;
- `weakens`;
- `contradicts`;
- `inconclusive`;
- `compatible`.

Uma relação probatória DEVE registrar justificativa. Contradições DEVEM ser localizadas e indicar materialidade. Arestas `DOC → CON` com categoria epistêmica são proibidas.

O vocabulário inicial também inclui `has_question`, `generates`, `acquired_from`, `extracted_from`, `mentions`, `tests`, `depends_on`, `answered_by`, `derived_from` e `frames`. Novos termos exigem namespace ou ADR.

## 5. Operações

As operações públicas são:

| Operação | Efeito |
|---|---|
| `CREATE` | cria investigação ou nó sem reutilizar ID |
| `GET` | lê projeção reconstruída |
| `UPDATE` | aplica patch e preserva o valor anterior no log |
| `ARCHIVE` | retira do uso ativo sem apagar |
| `RELATE` | cria aresta após validar tipo e pontas |
| `TRACE` | retorna todos os caminhos reais no sentido pedido |
| `INVALIDATE` | invalida um nó/relação e localiza dependentes |
| `REEVALUATE` | reconsidera suporte remanescente sem falsidade automática |
| `VALIDATE` | avalia schema, invariantes e ACS com escopo declarado |
| `EXPORT` | produz `.arca.json` canônico com event log |
| `IMPORT` | converte legado por migrador versionado |
| `CLOSE` | fecha conclusão somente após os portões do Crivo |
| `REOPEN` | reabre por gatilho objetivo ou decisão justificada |

Uma IA PODE propor operações. Somente o Core as valida e aplica.

## 6. Event log

O event log é a fonte operacional de verdade. Cada linha NDJSON é um evento com:

- `eventId` único `EVLOG-*`;
- `protocolVersion`;
- `investigationId`;
- `sequence` monotônica iniciada em 1;
- `operation`;
- `timestamp` ISO-8601;
- `actor` com tipo e identificador;
- `payload`;
- `previousEventHash`;
- `eventHash` calculado sobre a forma canônica do evento sem `eventHash`.

O algoritmo inicial é SHA-256. Encadeamento de hash detecta alteração acidental ou adversarial, mas não substitui assinatura, timestamp confiável ou transparência pública. O armazenamento DEVE rejeitar reconstrução quando sequência, hash anterior ou hash atual não coincidem.

O primeiro evento pode ser `INVESTIGATION_CREATE` ou `LEGACY_IMPORT`. Uma projeção ou snapshot é cache; nunca substitui o log.

Um cliente PODE fornecer `expectedEventHead` em uma operação mutável. Quando fornecido, o armazenamento DEVE compará-lo com o head atual depois de adquirir o lock e antes de anexar o evento. Divergência é conflito de concorrência e NÃO DEVE produzir escrita. Interfaces com múltiplas leituras e escritas, inclusive o Workbench e revisores de propostas, DEVEM usar esse controle.

## 7. TRACE

`TRACE(target, ancestors)` percorre as relações ativas no sentido inverso e retorna todos os caminhos acíclicos reais que terminam no alvo. `TRACE(source, descendants)` percorre no sentido direto. A implementação:

- NÃO DEVE selecionar apenas um predecessor;
- NÃO DEVE inserir `Q`, `INF` ou qualquer outro nó ausente;
- DEVE indicar ciclos detectados;
- DEVE preservar caminhos alternativos e cardinalidade;
- DEVE permitir que o consumidor veja nós e relações de cada caminho.

## 8. Invalidação e reavaliação

`INVALIDATE` registra motivo, ator e instante, preserva o conteúdo anterior e marca descendentes para reavaliação. A propagação não muda automaticamente o estado epistêmico para `Contradito`.

`REEVALUATE` examina relações válidas restantes. Na ausência de suporte, uma proposição, hipótese ou conclusão pode ser rebaixada para `Não verificado` ou `Desconhecido`. Contradição só pode resultar de relação contraditória material, localizada e revisada. Havendo suporte remanescente, o Core marca revisão semântica pendente quando não puder decidir legitimamente.

## 9. Fechamento, O Limite e reabertura

Uma conclusão só pode ser fechada quando registra:

- bases favoráveis;
- bases contrárias relevantes;
- lacunas materiais;
- limitações;
- escopo;
- ao menos uma condição objetiva de reabertura, salvo justificativa explícita;
- tentativa de Advogado do Diabo nas hipóteses relevantes;
- declaração de que não existe lacuna conhecida cuja resolução provavelmente alteraria materialmente o resultado, ou justificativa de fechamento apesar dela.

Fechamento não significa verdade absoluta. `REOPEN` preserva o fechamento anterior e inicia nova sequência de avaliação.

## 10. Exportação `.arca.json`

A exportação contém:

1. versão do protocolo e do schema;
2. projeção atual;
3. event log completo e verificável;
4. relatório de validação;
5. metadados do migrador, quando aplicável;
6. hash canônico do conteúdo exportado.

Dados privados permanecem privados por padrão. Projeção pública é outro contrato e deve usar o Publisher.

## 11. Conformidade

O validador DEVE emitir exatamente um estado por requisito ACS. Verificações automatizadas não podem declarar requisitos semânticos atendidos apenas porque campos existem. Quando o método não consegue avaliar atomicidade, proporcionalidade, causalidade, independência real ou legitimidade material, o estado correto é `UNSPECIFIED` ou `PARTIAL`, acompanhado do motivo.

`ARCA-Compatible` só pode ser declarado pelo portão integral da ACS. A implementação de referência 0.2.0 é um marco funcional e parcialmente conforme, não um produto de produção.

## 12. Segurança mínima

- validar IDs antes de derivar caminhos;
- impedir traversal e escapes por symlink;
- usar lock de escrita e append com `fsync`;
- criar arquivos privados com permissões restritas quando o sistema operacional suportar;
- limitar tamanho e profundidade na entrada em versões expostas a dados não confiáveis;
- nunca armazenar segredo em exportação pública;
- não alegar assinatura ou aquisição que não ocorreu;
- operar apenas com acesso legítimo e sem intrusão.

## 13. Migração

Estados anteriores não são reescritos silenciosamente. Cada migrador possui ID e versão, calcula o hash do original, emite avisos e registra uma operação `LEGACY_IMPORT`. O original deve permanecer preservado fora ou dentro do pacote de evidência. Chaves desconhecidas são conservadas em extensões ou no estado migrado.

## 14. Compatibilidade e governança

- mudanças incompatíveis elevam `MAJOR`;
- campos e operações compatíveis elevam `MINOR`;
- correções editoriais ou de validação compatíveis elevam `PATCH`;
- toda mudança normativa exige `ADR-ARCA-NNNN`, caso de teste e entrada no changelog;
- o formato de dados é independente da linguagem;
- componentes públicos não podem redefinir silenciosamente o Core.

## 15. Critério para promover a implementação a 1.0.0

A implementação de referência poderá chegar a 1.0.0 quando:

1. os ADRs provisórios forem ratificados;
2. os três casos reais permanecerem migráveis sem perda estrutural e a equivalência semântica dessas transformações for auditada independentemente;
3. todos os invariantes mecanizáveis tiverem testes de propriedade e adversariais;
4. as avaliações semânticas críticas tiverem procedimento de auditoria;
5. o formato de exportação tiver ao menos uma segunda implementação leitora;
6. segurança, privacidade, backup e recuperação tiverem testes documentados;
7. Publisher e verificador criptográfico forem integrados como adaptadores opcionais;
8. nenhuma declaração pública exceder o escopo efetivamente verificado.
