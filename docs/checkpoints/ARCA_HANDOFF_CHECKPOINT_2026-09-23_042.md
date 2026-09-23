# ARCA — Checkpoint 042: quarto GET Portal retornou 401 e foi custodial; diagnóstico offline ativo

Data: **2026-09-23**.

Estado: **QUARTO GET EXECUTADO UMA ÚNICA VEZ; HTTP 401; ZERO RETRY; RESPOSTA SELADA E ARMAZENADA EM CUSTÓDIA PRIVADA; CREDENCIAL NÃO DECLARADA INVÁLIDA; PRIMEIRO 2xx AINDA PENDENTE; NENHUM QUINTO GET AUTORIZADO**.

## Run canônico

Workflow:
`.github/workflows/arca-portal-related-documents-live-probe.yml`

Run:
`35886041113`

Revisão:
`268c8e385d8345d5a02ce2fd3350b1ea1088481a`

Antes do request, o preflight interno retornou `PREFLIGHT_READY` e confirmou os vínculos atuais.

## Resultado

- HTTP: `401`;
- estado: `AUTHORIZATION_NOT_ESTABLISHED`;
- `credentialInvalidProven=false`;
- `networkUsed=true`;
- `maxRequests=1`;
- `retries=0`;
- resposta: 169 bytes;
- `CAPTURED_AND_SEALED`;
- custódia durável: `STORED_PRIVATE`;
- plaintext publicado: `false`;
- classificador: não acionado;
- ingresso investigativo: não acionado;
- publicação adversa: não acionada.

## Evidência sanitizada

`scopeHash=fa61869d26948c95b8ad2616d92e6653fe86dd4976368659a56a12b902c782a3`

`preflightSha256=d1ec0dc29e62a1002d44caf2cc0f72649867d064b00872e1d5564452ace11dac`

`credentialFingerprintSha256=37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`

`responseBytesSha256=ed0c13c9e517d50376cc9a977e442912f1d1b1b751abafa6408c80f942a6d84b`

`envelopeHash=bc6f89317161a41e2096884b220c03928394a94a5774d1fc97fd892a87a1d1f0`

`receiptHash=f9929afd33f2e8a7955f894205746969dbc38bb622c7d7eae1e7f93da021b977`

## Diagnóstico offline

Foi revalidado que:

1. a chave usada no Secret coincide por fingerprint com a chave do e-mail oficial mais recente;
2. o e-mail oficial orienta o uso do header `chave-api-dados`;
3. o transporte ARCA envia exatamente esse header;
4. o endpoint `/api-de-dados/despesas/documentos-relacionados` continua publicado no Swagger oficial;
5. método e host usados estão coerentes com o contrato oficial;
6. o 401 não prova sozinho a causa da recusa.

A issue #176 passa a ser a trilha do Gate 042.

## Correção de histórico

Referências antigas da issue #176 a fingerprints `c69d67...` ou `feb75...` não são canônicas para a execução atual. O fingerprint canônico do token usado no run `35886041113` é:

`37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`.

## Próximo passo

Sem rede:

1. preservar a prova do run;
2. encaminhar/usar o dossiê sanitizado de suporte;
3. esclarecer o estado da chave no backend e eventual política de gateway;
4. opcionalmente preparar offline um probe de endpoint básico oficial para teste diferencial;
5. se um novo request for necessário: novo Gate 040 → revisão dos hashes → nova autorização humana específica → exatamente um request.

Nenhum quinto GET é autorizado por este checkpoint.

Documento de suporte:
`docs/ARCA_PORTAL_401_SUPPORT_DOSSIER_2026-09-23.md`

Issue:
#176

## Frentes congeladas

Continuam congeladas:
- Vince Controlled Self-Improvement;
- Edge Steward;
- M10 Produto/Governança/Interface;
- M7-CIV;
- Runtime Autônomo Local;
- ARCA AI Gateway.

Checkpoint anterior: [041](ARCA_HANDOFF_CHECKPOINT_2026-09-23_041.md).
