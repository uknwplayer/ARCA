# ARCA AIE D2 — Template do primeiro piloto público cego

Status: **protocolo pré-especificável; ainda não executado**.

Este documento define o procedimento para um teste D2 público real sem incorporar ao repositório sanitizado o nome, identificador ou endereço do órgão escolhido. Os parâmetros reais devem ser registrados fora da árvore pública sanitizada e fornecidos somente no momento da execução.

## 1. Objetivo

Testar o AIE em um universo público real sem indicar previamente ao runner onde deveria existir anomalia.

O teste mede comportamento dos detectores atuais, reprodutibilidade, proveniência, resistência ao auditor e capacidade de produzir ausência de achado. Ele **não** mede culpa, fraude, crime ou irregularidade administrativa como fato.

## 2. Universo pré-definido

Antes de qualquer coleta, o operador deve congelar em registro separado:

- órgão/entidade e identificador público;
- fonte institucional usada para validar o identificador;
- fonte de contratações: PNCP público;
- campo temporal: data de publicação no PNCP;
- período fechado de no máximo 31 dias;
- modalidades: todas as modalidades ativas retornadas pela superfície pública PNCP no instante de coleta;
- unidade de inclusão: toda contratação retornada pelo C3 dentro do escopo e que possa ser aprofundada pelo C2 com identificadores suficientes.

O período precisa ser definido antes do run. Eventual publicação tardia não é corrigida silenciosamente: o benchmark representa o estado público observado no instante de coleta, preservado em custódia.

## 3. Regra contra seleção oportunista

O operador não pode escolher manualmente contratos “interessantes” depois da descoberta.

O universo D2 é o resultado integral da descoberta C3 dentro dos limites pré-registrados. O C4 deve tentar aprofundar todos os alvos descobertos. O comando `freeze-blind` recusa por padrão um C4 com alvos pendentes ou falhos.

Se uma falha técnica impedir completar o universo, há somente duas saídas válidas:

1. corrigir a falha e retomar o mesmo checkpoint; ou
2. declarar o corpus incompleto e tratá-lo como execução exploratória, não como D2 público concluído.

`--allow-incomplete` nunca transforma um corpus parcial em D2 concluído.

## 4. Limites de coleta recomendados para o primeiro piloto

- intervalo C3: até 31 dias;
- `maxRecords`: 5000;
- `maxTotalPages`: 100;
- `maxPagesPerModality`: 10;
- C4: até 20 alvos por rodada;
- C4: até 5 falhas por rodada;
- somente `GET` público PNCP;
- sem credenciais, cookies ou `Authorization`;
- sem dados bancários, fiscais ou privados;
- respostas preservadas pelo Acquisition Adapter antes da análise.

Se algum orçamento for atingido, o resultado deve registrar `stoppedBy`. Um corpus truncado por orçamento não pode ser apresentado como universo completo sem novo pré-registro.

## 5. Identidade da execução

Antes da coleta devem ser registrados fora da árvore sanitizada:

- commit exato do ARCA;
- versão do Node.js;
- `ARCA_HOME` dedicado;
- órgão, identificador público, período e limites;
- instante de início/fim da coleta;
- fingerprint C3;
- checkpoint C4;
- hashes das aquisições;
- fingerprint do corpus cego congelado.

## 6. Sequência operacional

### 6.1 Criar investigação vazia

```bash
npm run arca -- investigation create \
  --home .arca-d2-pilot \
  --question "Quais padrões de risco reproduzíveis aparecem no universo PNCP pré-registrado?" \
  --objective "Executar avaliação cega D2 sem presumir irregularidade" \
  --scope "PNCP público; órgão e período definidos no registro privado do piloto" \
  --limits "Somente dados públicos; sem inferência automática de culpa"
```

### 6.2 Descoberta C3

```bash
npm run pncp -- discover \
  --home .arca-d2-pilot \
  --investigation INV-D2-PILOT \
  --cnpj CNPJ_DO_ORGAO \
  --data-inicial AAAAMMDD \
  --data-final AAAAMMDD \
  --max-pages-per-modality 10 \
  --max-total-pages 100 \
  --max-records 5000 \
  --allow-network \
  --confirm-network PNCP_PUBLIC_GET_ONLY \
  --out .arca-d2-pilot/runs/pncp-discovery/d2-pilot.json
```

Nenhum alvo individual é fornecido ao C3.

### 6.3 Aprofundamento C4

Executar rodadas até `pendingTotal = 0` e `failedTotal = 0`:

```bash
npm run pncp -- deepen \
  --home .arca-d2-pilot \
  --investigation INV-D2-PILOT \
  --discovery .arca-d2-pilot/runs/pncp-discovery/d2-pilot.json \
  --max-targets 20 \
  --max-failures 5 \
  --allow-network \
  --confirm-network PNCP_PUBLIC_GET_ONLY \
  --out .arca-d2-pilot/runs/pncp-deepening/d2-pilot-summary.json
```

Falhas previamente registradas só podem ser retomadas com `--retry-failed` explícito.

### 6.4 Congelar o corpus cego

```bash
npm run pncp -- freeze-blind \
  --home .arca-d2-pilot \
  --checkpoint CHECKPOINT_C4 \
  --summary .arca-d2-pilot/runs/pncp-deepening/d2-pilot-summary.json \
  --corpus-id D2-PNCP-PILOT-V1 \
  --out .arca-d2-pilot/d2/corpus.json \
  --manifest-out .arca-d2-pilot/d2/corpus-manifest.json
```

O bridge copia somente entradas analíticas necessárias (`procurementRecords` e `items`) e metadados verificáveis de custódia. Perfis, achados e conclusões produzidos durante C2 não entram no corpus cego.

## 7. Gabarito humano separado

O answer key não deve ser preparado pelo runner nem incorporado ao corpus.

Revisores humanos classificam **somente as condições dos detectores implementados**, jamais “corrupção”, “fraude” ou “culpa”. Os detectores avaliáveis no estado atual são:

- `RISK-PRICE-OUTLIER-001`;
- `RISK-LOW-COMPETITION-001`;
- `RISK-CONCENTRATION-001`;
- `RISK-ADDITIVE-BURDEN-001`;
- `RISK-COMPARABLE-UNIT-PRICE-001`.

Samples sem condição esperada permanecem como negativos. Divergência entre revisores deve ser registrada; o ideal é consenso documentado ou adjudicação antes do commitment.

## 8. Pré-compromisso do gabarito

Depois que corpus e manifesto estiverem congelados, mas **antes do run cego**:

```bash
npm run blind -- commit-key \
  --answer-key answer-key.json \
  --nonce-file nonce.txt \
  --out answer-key-commitment.json
```

Publicável antes do run: `corpusFingerprint`, manifesto, commitment e versão/commit do código. Answer key e nonce permanecem separados até o score.

## 9. Run cego e reprodutibilidade

```bash
npm run blind -- run --corpus .arca-d2-pilot/d2/corpus.json --out .arca-d2-pilot/d2/run-a.json
npm run blind -- run --corpus .arca-d2-pilot/d2/corpus.json --out .arca-d2-pilot/d2/run-b.json
npm run blind -- compare \
  --left .arca-d2-pilot/d2/run-a.json \
  --right .arca-d2-pilot/d2/run-b.json \
  --out .arca-d2-pilot/d2/reproducibility.json
```

Duas execuções são exigidas no primeiro piloto para testar reprodutibilidade determinística.

## 10. Abertura e score

```bash
npm run blind -- score \
  --run .arca-d2-pilot/d2/run-a.json \
  --commitment answer-key-commitment.json \
  --answer-key answer-key.json \
  --nonce-file nonce.txt \
  --out .arca-d2-pilot/d2/score.json
```

A abertura só é válida se answer key + nonce reproduzirem exatamente o commitment anterior ao run.

## 11. Métricas obrigatórias

O relatório D2 publica, no mínimo:

- alvos descobertos, concluídos, falhos e pendentes;
- samples congelados;
- TP, FP e FN por detector;
- precision, recall e F1;
- acerto em samples negativos;
- cobertura de proveniência;
- taxa de sobrevivência ao auditor;
- reprodutibilidade entre runs;
- FP/FN para revisão qualitativa;
- limitações do universo e da rotulagem humana.

Um resultado ruim é um resultado válido. Ajustar detectores depois de ver o score exige nova versão/protocolo; o resultado ajustado não pode ser reapresentado como o mesmo teste cego.

## 12. Critério para declarar D2 executado

O projeto só pode declarar “D2 público executado” quando existirem:

1. corpus PNCP real preservado e congelado;
2. C4 completo, ou invalidação explícita do teste;
3. manifesto e fingerprint do corpus;
4. gabarito humano separado;
5. commitment anterior ao run;
6. dois runs cegos fixados;
7. abertura válida do commitment;
8. score e relatório de limitações;
9. revisão humana dos FP/FN;
10. nenhuma afirmação automática de ilícito.

Até isso ocorrer, o estado correto permanece **D2-prep**.
