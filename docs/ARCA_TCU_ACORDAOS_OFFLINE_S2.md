# ARCA — TCU Acórdãos Offline S2

Estado: **IMPLEMENTADO EM BRANCH / OFFLINE FIXTURE / ZERO REDE**.

## Objetivo

Adicionar uma quarta fonte pública executável ao núcleo investigativo do ARCA sem depender do Portal da Transparência: os Acórdãos do Tribunal de Contas da União (TCU).

Fonte oficial documentada:

`https://dados-abertos.apps.tcu.gov.br/api/acordao/recupera-acordaos`

Documentação oficial:

`https://sites.tcu.gov.br/dados-abertos/webservices-tcu/`

## Snapshot de registro

A ativação ocorre somente em:

`config/public-source-registry-s2.json`

Os snapshots anteriores permanecem imutáveis:

- V1: PNCP + Portal offline;
- S1: adiciona Transferegov offline;
- S2: adiciona TCU Acórdãos offline.

Isso preserva reprodutibilidade e hashes históricos.

## Contrato da fonte

`br.tcu.open-data` no S2:

- `accessMethod=official_public_api`;
- origem canônica `dados-abertos.apps.tcu.gov.br`;
- formato JSON;
- `adapterStatus=ACTIVE`;
- único modo: `OFFLINE_FIXTURE`;
- nenhuma capability `PUBLIC_GET`.

## Campos modelados

A fixture segue os campos documentados pelo TCU:

- chave;
- tipo;
- ano do acórdão;
- título;
- número;
- colegiado;
- data da sessão;
- relator;
- situação;
- sumário;
- links para documento, PDF e consulta do acórdão.

A fixture é integralmente sintética.

## Jurisdição nacional

Acórdãos do TCU são tratados como `BR/NATIONAL`, não como uma UF artificial. O contrato de Evidence Envelope foi ampliado de forma compatível para aceitar:

- `BR/UF/XX`;
- `BR/NATIONAL`.

Registros antigos continuam usando a representação anterior e seus hashes históricos não são reescritos.

## Segurança e semântica

1. Um acórdão deve ser lido em seu contexto.
2. Um acórdão isolado não prova irregularidade atual de pessoa, contrato ou órgão.
3. Recursos, revisões ou decisões posteriores podem alterar o contexto.
4. Nenhuma classificação adversa é automática.
5. Nenhuma inferência eleitoral é produzida.
6. Nenhuma consulta live ocorre nesta etapa.
7. Toda evidência continua exigindo revisão humana.

## Gate

Validador:

`npm run validate:tcu-s2`

Prova esperada:

- status `PASS`;
- jurisdição `BR/NATIONAL`;
- 2 registros sintéticos;
- Evidence Envelopes hash-only;
- `networkUsed=false`;
- `publicationAttempted=false`;
- `humanReviewRequired=true`;
- `adverseFinding=false`.

## Próximo passo

Após integração do S2, a próxima fonte prevista é Siconfi/Tesouro Nacional. Qualquer acesso live do TCU exigirá desenho separado de transporte, paginação, budgets, custódia e autorização humana.
