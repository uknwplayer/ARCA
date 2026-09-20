# ARCA Core v1 - Relatório da Fundação 0.1.0

**Data:** 2026-09-14  
**Implementação:** `arca-core-v1-foundation` 0.1.0  
**Protocolo:** ARCA Core 1.0.0  
**Schema:** `arca-state-v1`  
**Conformidade avaliada:** ACS-v0.1  
**Estado:** fundação funcional, local e auditável; não é uma versão de produção nem possui selo `ARCA-Compatible`

## 1. Resultado do marco

O marco transforma a receita conceitual do ARCA em um primeiro núcleo executável. O sistema agora cria investigações, mantém a questão como nó, registra objetos e relações, reconstrói o estado pelo histórico de eventos, percorre todos os caminhos reais do grafo, propaga invalidação, reavalia sem fabricar falsidade, aplica o portão O Limite, valida os 47 requisitos ACS e exporta um pacote portátil.

Três regras continuam centrais:

> O Crivo não procura uma conclusão. Procura evidências.

> Investigação é grafo, não narrativa.

> Sem inferência automática.

## 2. Escopo entregue

| Área | Capacidade entregue | Evidência executável |
| --- | --- | --- |
| Core | operações determinísticas sobre investigação, nós e relações | `packages/core/src/operations.ts` |
| Persistência | event log NDJSON append-only, sequência monotônica e cadeia SHA-256 | `packages/core/src/store.ts`, `events.ts` e teste de adulteração |
| Modelo | `INV`, `Q`, `SRC`, `DOC`, `INF`, `PRO`, `ENT`, `EVT`, `HIP`, `CON`, `FRM`, `GAP`, `SEA` e `REL` | schema e constantes v1 |
| Evidência | relação contextual exclusivamente `INF → PRO` | validador de relações e testes negativos |
| TRACE | enumeração de todos os caminhos reais, com detecção de ciclos | `trace.ts` e teste de grafo ramificado |
| Invalidação | propagação para dependentes e reavaliação sem `Contradito` automático | operações e regressão dedicada |
| Fechamento | auditoria de conclusão, Advogado do Diabo, reabertura e O Limite | operação `closeConclusion` e teste dedicado |
| Conformidade | 47 requisitos ACS com `UNSPECIFIED` preservado | `validate.ts` e relatórios por caso |
| Portabilidade | exportação `.arca.json` com estado, log, validação e hash canônico | exportador e teste de integridade |
| Migração | normalização conservadora dos três estados canônicos recuperados | script, relatórios e nove artefatos migrados |
| Interface | CLI local com saídas humana e JSON | `packages/cli` e três testes de CLI |

## 3. Decisões incorporadas

Cinco ADRs acompanham o código:

1. Core local e CLI-first;
2. questão `Q` como nó de primeira classe;
3. evidência como relação `INF → PRO`;
4. event log como fonte operacional de verdade;
5. estados epistêmicos qualitativos, não probabilísticos.

Os ADRs estão implementados, mas sua ratificação de governança continua pendente. A especificação `ARCA_CORE_SPEC_v1.0.0.md` é candidata normativa e não substitui uma aprovação formal do responsável pelo cânone.

## 4. Verificação executada

### 4.1 Suíte automatizada

Resultado em Node.js 24.19.0:

| Grupo | Resultado |
| --- | --- |
| Testes totais | 15 |
| Aprovados | 15 |
| Falhas | 0 |
| Cancelados/ignorados | 0 |
| Verificação estrutural do repositório | PASS |

A suíte cobre criação e reconstrução, TRACE ramificado, ciclos legados, invalidação, reavaliação, restrições de evidência, O Limite, 47 requisitos ACS, adulteração do event log, integridade da exportação, CLI e migração dos três casos.

### 4.2 Demonstração ponta a ponta

A demonstração, marcada integralmente como simulação, produziu:

| Medida | Resultado |
| --- | --- |
| Eventos encadeados | 17 |
| Nós no TRACE | 9 |
| Relações no TRACE | 9 |
| Caminhos reais até a conclusão | 4 |
| Ciclos | 0 |
| TRACE truncado | não |
| ACS-S / ACS-E / ACS-O / ACS-P | PASS / PARTIAL / PASS / PASS |
| ACS-FULL | FAIL esperado |
| Selo elegível | não |

O `ACS-FULL` falhar é o comportamento correto: os requisitos semânticos E-004, E-010 e E-011 não podem ser satisfeitos por uma simulação estrutural.

## 5. Migração legada e política de distribuição

O migrador importa um estado legado por um único evento `LEGACY_IMPORT`,
calcula SHA-256 dos bytes recebidos e produz estado, relatório e validação sem
promover lacunas a fatos. A edição pública não distribui investigações usadas
durante o desenvolvimento, seus hashes, exportações ou relatórios derivados.

A cobertura automatizada usa três fixtures fictícias e efêmeras para exercitar:

- criação da questão `Q` e da relação raiz;
- transformação `subjects → entities`;
- transformação de objeto `EVD` em nó `INF` e relação probatória explícita;
- normalização de conclusão singular;
- reescrita de aliases `QUE → Q` e `SEARCH → SEA`, inclusive em estruturas
  aninhadas;
- preservação de seções não reconhecidas em extensões;
- recusa de inventar hash ou aquisição ausentes.

### 5.1 Preservação e limites

- os valores epistêmicos legados são mantidos em extensões junto do mapeamento conservador;
- seções desconhecidas são conservadas em `extensions.unmappedSections`;
- aliases são registrados no relatório e reescritos inclusive em gatilhos estruturados;
- documentos sem hash continuam `not_computed`;
- instante ou método de aquisição ausente não é inventado;
- toda relação migrada aponta para nós existentes;
- relações de evidência migradas continuam exclusivamente `INF → PRO`.

## 6. Segurança implementada e fronteiras da alegação

Esta fundação implementa validação de IDs antes de formar caminhos, defesa contra traversal e escapes por symlink no armazenamento, permissões privadas quando suportadas, lock de escrita, `fsync`, exportação atômica e interrupção da reconstrução diante de cadeia adulterada.

Isso não equivale a segurança de produção. Ainda faltam threat model formal, limites completos para entradas hostis, fuzzing amplo, assinatura do event log, gestão de chaves, criptografia de repouso, backup/restauração testados, resposta a incidentes e auditoria externa.

## 7. O que ainda não foi integrado

A fundação não substitui Publisher, Registry, Resolver, Attestation, Federation ou Public TRACE. Esses componentes recuperados continuam separados e devem entrar como adaptadores opcionais após a estabilização do Core.

Também permanecem fora deste marco:

- interface local para uso cotidiano sem JSON;
- ARCA Agent Bundle e contrato de propostas do agente;
- conectores de pesquisa, documentos, OCR e provedores de IA;
- monitor de gatilhos de reabertura;
- auditoria semântica independente;
- segunda implementação leitora do formato;
- publicação pública, revogação e transparência integradas;
- empacotamento instalável e atualização de produção.

## 8. Critério de aceite deste marco

O marco 0.1.0 é aceito como **fundação funcional** porque:

1. executa offline sem dependência externa de runtime;
2. cria e reconstrói investigações pelo event log;
3. mantém as distinções epistemológicas fundamentais;
4. recusa relações probatórias estruturalmente inválidas;
5. preserva todos os ramos do TRACE;
6. invalida e reavalia sem fabricar contradição;
7. migra formatos legados sintéticos sem mudança destrutiva declarada;
8. exporta estado, log, validação e integridade em arquivo portátil;
9. passa 15/15 testes e a demonstração ponta a ponta;
10. recusa o selo integral quando faltam verificações semânticas.

O marco não atende ainda à Definition of Done de produção do ARCA Core v1.

## 9. Reprodução

Na raiz do pacote, com Node.js 22.6 ou superior:

```bash
npm test
npm run check
npm run demo
```

A CLI pode ser executada por `npm run arca -- <comando>`. Dados reais ou casos
de desenvolvimento devem permanecer fora do repositório distribuído.

## 10. Próximo marco recomendado

O próximo marco deve ser **ARCA Workbench local + Agent Bundle 0.2.0**:

1. interface local para formular Q, cadastrar fontes, extrair INF, classificar PRO e visualizar TRACE;
2. contrato de propostas do agente, sempre submetidas às operações do Core;
3. revisão humana das transformações legadas e requisitos semânticos;
4. testes de propriedade e fuzzing dos schemas, event log e grafo;
5. integração opcional do Publisher e verificador criptográfico já recuperados;
6. execução de uma investigação nova, real e auditada do início ao fim.

Essa ordem entrega uso cotidiano sem transferir autoridade ao agente e sem confundir funcionamento local com prontidão pública.
