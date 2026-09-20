# ARCA AIE D1 — Blind Evaluation Specification v0.4.0

## 1. Objetivo

O D1 cria um protocolo determinístico para avaliar o AIE sem entregar ao motor a resposta esperada. O objetivo não é provar que um alerta corresponde a ilícito; é medir se os detectores atuais conseguem encontrar padrões previamente definidos em um corpus de benchmark, evitar alertas em amostras negativas e produzir resultados reproduzíveis e rastreáveis.

D1 é infraestrutura de benchmark. O primeiro gate usa fixtures sintéticas controladas. A execução sobre corpus público real fica para D2.

## 2. Separação obrigatória

O protocolo separa três artefatos:

```text
arca-aie-blind-procurement-corpus-v1
                |
                v
       ANALISE SEM GABARITO
                |
                v
arca-aie-blind-procurement-run-v1
                |
                +---------------------+
                                      |
arca-aie-blind-procurement-answer-key-v1
                                      |
                                      v
                  arca-aie-blind-procurement-score-v1
```

O answer key nunca é argumento de `buildBlindProcurementRun`. O corpus é rejeitado se contiver campos reservados de rótulo, resposta esperada, `groundTruth` ou answer key.

## 3. Corpus cego

Formato: `arca-aie-blind-procurement-corpus-v1`.

Cada sample possui:

- `sampleId` único;
- `records`: registros brutos de contratação, possivelmente vazio;
- `items`: itens brutos de contratação, possivelmente vazio;
- `metadata` opcional, desde que não contenha rótulos proibidos.

Pelo menos uma das coleções `records` ou `items` deve possuir dados analisáveis.

O corpus não possui:

- detector esperado;
- classificação positiva/negativa;
- narrativa de resultado esperado;
- ground truth;
- answer key embutido.

## 4. Execução cega

`buildBlindProcurementRun(corpus, options)` executa:

1. validação de separação cega;
2. normalização de registros e itens com `sourceRef` determinístico por corpus/sample;
3. `buildProcurementProfile`;
4. `buildItemComparabilityProfile`;
5. auditoria adversarial de cada achado;
6. seleção de achados materiais que sobreviveram ao auditor e permanecem em `review` ou `investigate`;
7. medição de cobertura de proveniência;
8. cálculo de `runId` determinístico.

A execução não conhece o answer key.

## 5. Answer key

Formato: `arca-aie-blind-procurement-answer-key-v1`.

O gabarito é carregado somente depois que o run foi produzido. Cada sample possui `expectedDetectorIds`.

O scorer exige:

- `corpusId` idêntico ao run;
- exatamente um registro de expectativa para cada sample executado;
- ausência de samples extras ou omitidos.

Opcionalmente, `allowAdditionalDetectors: true` pode ser usado quando um benchmark admite detectores adicionais sem tratá-los como falso positivo. O padrão é estrito.

## 6. Unidade de comparação

D1 compara o conjunto de identificadores de detectores materiais por sample.

Exemplos:

- `RISK-PRICE-OUTLIER-001`;
- `RISK-LOW-COMPETITION-001`;
- `RISK-CONCENTRATION-001`;
- `RISK-ADDITIVE-BURDEN-001`;
- `RISK-COMPARABLE-UNIT-PRICE-001`.

A unidade de benchmark é deliberadamente metodológica. O gabarito diz qual detector deve reagir à fixture, não que existe crime, fraude ou irregularidade.

## 7. Métricas

`scoreBlindProcurementRun` registra:

- `truePositive`;
- `falsePositive`;
- `falseNegative`;
- `precision`;
- `recall`;
- `f1`;
- `expectedEmptySamples`;
- `correctEmptySamples`;
- `noFindingAccuracy`;
- `provenanceCoverage`;
- `auditorSurvivalRate`;
- `blindTruePositiveCount`.

### 7.1 Verdadeiro positivo cego

Um verdadeiro positivo é considerado cego quando o detector aparece no run e somente depois é confrontado com o answer key. O motor não teve acesso ao detector esperado durante a análise.

### 7.2 Negativos

Samples cujo `expectedDetectorIds` é vazio medem a capacidade de concluir que os detectores atuais não encontraram achado material suficiente. Produzir zero alerta nesses samples é um resultado positivo do benchmark.

### 7.3 Proveniência

A cobertura de proveniência mede a proporção de registros e itens normalizados que possuem `sourceRefs` não vazios. D1 não interpreta cobertura de proveniência como prova de veracidade da fonte.

### 7.4 Auditor adversarial

Achados brutos são auditados antes de compor `materialDetectorIds`. A taxa de sobrevivência informa quanto do conjunto inicial continua material após as regras adversariais determinísticas atuais.

## 8. Reprodutibilidade

`compareBlindProcurementRuns(left, right)` compara duas execuções do mesmo corpus. Um run é reproduzível quando:

- os resultados por sample são semanticamente idênticos;
- nenhum sample mudou;
- o `runId` determinístico é o mesmo.

Qualquer alteração de detector, perfil, auditoria ou assinatura deve aparecer como diferença.

## 9. Gate sintético D1

O gate inicial contém oito testes específicos:

1. corpus contaminado com rótulo é recusado;
2. a mesma entrada gera run reproduzível;
3. fixture de risco encontra os quatro detectores de contratação esperados sem receber rótulos;
4. fixture normal produz ausência de achado material;
5. fixture de comparabilidade detecta preço unitário anômalo no grupo correto;
6. score perfeito controlado mede TP/FP/FN, precision, recall, F1, proveniência e negativos;
7. score defeituoso torna falsos positivos e falsos negativos explícitos;
8. answer key incompatível ou parcial é recusado.

Esses testes elevam a suíte de desenvolvimento de 109 para 117 testes.

## 10. Limites

D1 ainda não demonstra desempenho externo porque utiliza fixtures conhecidas durante o desenvolvimento do sistema. O mecanismo de separação impede vazamento do answer key durante a execução, mas o desenho das fixtures continua conhecido pelos desenvolvedores.

Portanto, D1 **não** deve ser apresentado como teste cego público conclusivo.

## 11. Próximo estágio — D2

D2 deverá usar um corpus público delimitado preparado antes da execução. O protocolo recomendado é:

1. congelar fonte, período, universo e versão do código;
2. preservar os materiais pela cadeia de custódia;
3. produzir o corpus sem rótulos acessíveis ao runner;
4. registrar e selar o answer key separadamente antes da execução;
5. executar o AIE uma ou mais vezes sem acesso ao gabarito;
6. abrir o answer key somente após os runs;
7. publicar score, falsos positivos, falsos negativos, cobertura de proveniência, reprodutibilidade e limitações;
8. submeter resultados a revisão humana e, idealmente, independente.

Nenhum achado D2 deve ser publicado como acusação automática. O benchmark mede o sistema, não julga pessoas ou entidades.
