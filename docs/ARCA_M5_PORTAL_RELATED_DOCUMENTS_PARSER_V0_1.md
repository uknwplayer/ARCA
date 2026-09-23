# ARCA — M5-F Parser Offline de Documentos Relacionados V0.1

Estado: **IMPLEMENTADO EM BRANCH / FIXTURE SINTÉTICA / SEM REDE / NORMALIZAÇÃO LIVE BLOQUEADA**.

## Objetivo

Transformar a estrutura real observada no Gate 046 em um parser/normalizador determinístico e fail-closed, sem reconsultar o Portal e sem abrir os bytes live custodiais nesta etapa.

Âncora estrutural:

`observedSchemaSha256=79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`

Endpoint de origem:

`/api-de-dados/despesas/documentos-relacionados`

## Schema aceito V1

O parser exige exatamente os 11 campos observados:

- `data`;
- `documento`;
- `documentoResumido`;
- `elementoDespesa`;
- `especie`;
- `fase`;
- `favorecido`;
- `orgaoSuperior`;
- `orgaoVinculado`;
- `unidadeGestora`;
- `valor`.

Todos devem ser strings. Campo ausente ou adicional é `SCHEMA_DRIFT`.

## Normalização sintética

A V0.1 prova somente:

- datas em `DD/MM/AAAA` ou `AAAA-MM-DD`;
- valores BRL com vírgula decimal, separador de milhares opcional e sinal negativo permitido;
- fases reconhecidas: Empenho, Liquidação e Pagamento, inclusive códigos 1/2/3;
- referências SHA-256 para documento, favorecido e unidades/órgãos;
- nenhuma inferência de identidade a partir de texto livre;
- hash do registro bruto sintético;
- hash determinístico da normalização.

O parser preserva os textos sintéticos no resultado privado de teste, mas marca:

- `containsSourceValues=true`;
- `publicationAuthorized=false`;
- `identityInferencesMade=false`;
- `humanReviewRequired=true`.

## Fail-closed

A V0.1 recusa:

- hash de schema diferente do Gate 046;
- campo extra/ausente;
- tipo diferente de string;
- data fora dos formatos aceitos;
- valor monetário ambíguo;
- fase não reconhecida;
- mais de 25 registros;
- qualquer `executionMode` diferente de `SYNTHETIC_FIXTURE`.

Em especial:

`CUSTODIAL_LIVE` → **ARCA_M5_PORTAL_PARSER_LIVE_NORMALIZATION_NOT_AUTHORIZED**

## O que esta fase NÃO autoriza

- reabrir o envelope live;
- normalizar o registro real;
- alimentar a Fase B com valores reais;
- correlacionar com PNCP;
- classificar sinais;
- publicar dados;
- executar novo GET.

## Validação

`npm run validate:m5-portal-parser`

O CI principal executa este validador antes das fases de prontidão/binding do Portal.

## Próximo gate

Depois de CI/merge, criar um gate de admissão que vincule:

1. parser V1;
2. hash estrutural do Gate 046;
3. envelope/receipt do run `35917902630`;
4. decisão humana explícita;
5. execução offline sobre os bytes já custodiais;
6. saída normalizada privada com hash;
7. nenhuma rede e nenhuma publicação.

Somente depois disso a Fase B poderá receber uma fonte Portal live com `normalizationState=NORMALIZED`.
