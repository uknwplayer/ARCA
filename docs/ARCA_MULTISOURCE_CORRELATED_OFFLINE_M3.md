# ARCA — M3: Gate offline multifonte correlacionado

Estado: **IMPLEMENTAÇÃO EM VALIDAÇÃO**.

Objetivo: executar, no mesmo piloto offline, aquisição sintética PNCP + execução financeira + relações pagamento→empenho + correlação financeira M2, mantendo separação entre evidência, correlação, análise independente, verificação adversarial e revisão humana.

Nenhuma rede ou publicação é habilitada por este marco.

## Escopo

O piloto M3 usa exatamente três UFs sintéticas:

- AC;
- AL;
- AM.

Duas famílias executáveis participam do mesmo ciclo:

- `br.pncp.public-api`;
- `br.portal-transparencia.download-despesas`.

A mesma UF pode possuir um shard por fonte. O orçamento atual permite no máximo seis shards, mantendo no máximo três UFs distintas.

AL representa indisponibilidade sintética em ambas as fontes. Isso produz lacunas explícitas e não suspeita.

## Evidência do Portal

O adaptador de despesas continua aceitando as linhas sintéticas de pagamento do M1 e, no M3, pode receber também `impactRecords` sintéticos.

Esses registros representam somente a semântica documentada de que um documento de pagamento pode pagar um ou mais empenhos.

O ARCA não declara que o objeto sintético reproduz o layout integral de `Despesas_Pagamento_EmpenhosImpactados.csv`. O envelope marca explicitamente:

- `synthetic-impact-relation-not-observed-in-official-dataset`;
- `csv-layout-not-asserted`;
- `uf-attribution-unverified`;
- `commitment-to-procurement-link-not-proven`.

Referências públicas de contexto:

- https://portaldatransparencia.gov.br/dicionario-de-dados/pagamentos
- https://portaldatransparencia.gov.br/download-de-dados/despesas
- https://api.portaldatransparencia.gov.br/swagger-ui/index.html

O acesso real continua reservado ao M4 ou gate posterior explicitamente autorizado.

## Ligação obrigatória correlação ↔ evidência

O M3 não aceita simplesmente um relatório M2 válido.

Antes de usar a correlação, o gate deriva referências hash-only a partir dos envelopes efetivamente recebidos e exige:

1. cada `PAYMENT_IMPACTS_COMMITMENT` tenha um envelope de pagamento e um envelope da relação de empenho correspondente;
2. cada relação financeira com PNCP tenha o envelope do empenho impactado e o envelope PNCP correspondente;
3. quando um empenho possui pagamento observado, o pagamento também integre a ligação;
4. `NOT_OBSERVED` esteja ligado ao envelope PNCP cuja ausência de relação está sendo registrada;
5. todas as relações tenham um `relationId` único e proveniência.

Se qualquer endpoint não existir nas evidências daquele ciclo, o M3 falha fechado com `ARCA_MULTISOURCE_CORRELATION_EVIDENCE_BINDING_MISSING`.

O relatório público do gate usa somente hashes de envelopes e relações nesse vínculo.

## Relações e estados

O relatório M2 integrado preserva:

- `CONFIRMED`;
- `CANDIDATE`;
- `CONFLICTING`;
- `NOT_OBSERVED`.

A fixture M3 contém um caso de cada estado.

O verificador adversarial adiciona desafios explícitos quando há:

- correlação apenas offline;
- relação conflitante não resolvida;
- relação não observada;
- fonte indisponível.

Esses desafios não são convertidos automaticamente em achado adverso.

## Agentes independentes

Dois papéis continuam obrigatórios:

- `PROVENANCE_ANALYST`;
- `COMPARABILITY_ANALYST`.

Ambos recebem o mesmo digest imutável.

Quando a correlação M2 está presente e duas fontes participam, o analista de comparabilidade pode declarar apenas:

`CROSS_SOURCE_CORRELATION_AVAILABLE`

Isso significa que existem relações estruturadas para revisão. Não significa irregularidade nem conclusão factual sobre dados reais.

## Deduplicação humano ↔ observador

O M3 reutiliza a `Durable Investigation Queue`.

Uma solicitação humana e um wake do observador sobre o mesmo escopo canônico convergem para a mesma `investigationId`.

O gate agora avança a fila a partir do estado durável atual. Reexecutar a mesma investigação já em `HUMAN_REVIEW` não reproduz transições anteriores nem cria uma investigação paralela.

## Resultado esperado da fixture

Evidência:

- 4 envelopes PNCP;
- 3 envelopes de pagamento;
- 4 envelopes de relações pagamento→empenho;
- total deduplicado: 11 envelopes;
- 2 lacunas de fonte em AL.

Correlação:

- 4 relações pagamento→empenho;
- 4 relações financeiras com PNCP/escopo;
- 8 relações ancoradas em envelopes;
- 1 `CONFIRMED`;
- 1 `CANDIDATE`;
- 1 `CONFLICTING`;
- 1 `NOT_OBSERVED`.

Fluxo:

- dois agentes;
- verificação adversarial;
- `HUMAN_REVIEW`;
- rede desligada;
- publicação desligada.

## Compatibilidade regressiva

M3 não deve alterar os resultados históricos de M0 e M1.

Os testes fixam os digests conhecidos:

- M0: `29678dca8d120012ad5183c209a8c48b836893a81d9b223a54a8efa96e0f2af2`;
- M1: `d33af20d7382df409032ecac0d94e24f97bd1ab6e04b02d55d05856182281bf9`.

Qualquer mudança nesses digests exige análise explícita, não atualização automática da expectativa.

## Segurança

Invariantes:

- rede `false`;
- publicação `false`;
- revisão humana obrigatória;
- `adverseFinding=false`;
- anomalia não é irregularidade;
- indisponibilidade não é suspeita;
- `NOT_OBSERVED` não é desaparecimento;
- contraprova é preservada;
- correlação sem evidência do próprio ciclo falha fechado;
- dados sintéticos não são apresentados como registros reais.

## Reprodução

```bash
node --test tests/multisource-correlated-offline-m3.test.mjs
npm run validate:multisource-correlated
npm run validate:financial-correlation
npm run validate:multisource
npm test
npm run check:public
```

## Gate seguinte

Depois de M3 integrado e com CI pós-merge verde, o próximo marco é **M4 — Live controlado de uma fonte por vez**.

M4 exige autorização explícita para rede. O avanço para M4 não deve ocorrer por inferência a partir deste documento.
