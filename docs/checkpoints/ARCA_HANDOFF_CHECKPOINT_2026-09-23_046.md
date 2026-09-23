# ARCA — Checkpoint 046: primeiro HTTP 200 financeiro em documentos relacionados

Data: **2026-09-23**.

Estado: **PRIMEIRO 2xx FINANCEIRO DO PORTAL COMPROVADO; GATE 046 VÁLIDO; EXATAMENTE UM GET AUTORIZADO A `/api-de-dados/despesas/documentos-relacionados`; HTTP 200; 1 REGISTRO; 440 BYTES; RETRIES=0; RESPOSTA SELADA E CUSTODIADA; SCHEMA OBSERVADO; AUTORIZAÇÃO CONSUMIDA**.

## Gate 046 preflight

Run:

https://github.com/uknwplayer/ARCA/actions/runs/35916999807

Revisão:

`44b2dd9b5bc25c216d9b599fb552ea0fbb063c5f`

Resultado:

- `READY_FOR_EXPLICIT_AUTHORIZATION`;
- `scopeHash=38637de67d7f7eb5a5fc57fa327069c20857bd7ae7ed62b8072312a2fad37eb1`;
- `documentCodeSha256=dbd99670efc9b5e4cc03c859dceb2dac203bb564d8f393b8f1e167dc829e208e`;
- `credentialFingerprintSha256=37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`;
- `preflightSha256=1e07709d9fbdbcc079fb2e6f244784714ddf075b09bf5502b151afacb639f99f`;
- cofre pronto e privado;
- `portalNetworkUsed=false`;
- `portalRequestCapabilityPresent=false`;
- retry automático não autorizado.

## Probe live controlado

Autorização humana: exatamente um GET em `/api-de-dados/despesas/documentos-relacionados`, usando os vínculos atuais do Gate 046, sem retries.

Run:

https://github.com/uknwplayer/ARCA/actions/runs/35917902630

Mesma revisão do preflight:

`44b2dd9b5bc25c216d9b599fb552ea0fbb063c5f`

Resultado sanitizado:

- exatamente 1 request;
- HTTP **200**;
- `probeStatus=SUCCEEDED`;
- `credentialState=ACCEPTED_ON_OBSERVED_REQUEST`;
- `activeVerified=true`;
- `validationStatus=VALIDATED`;
- `recordCount=1`;
- 440 bytes capturados;
- `retries=0`;
- resposta criptografada antes da interpretação;
- `STORED_PRIVATE`;
- nenhum classificador;
- nenhum ingresso investigativo;
- nenhuma publicação.

Hashes principais:

- `responseBytesSha256=9f2d6cde37f88966204e84121da6b935f4082c7fdfa5f785f3fa649065720e66`;
- `envelopeHash=d398da542596a7ad387f0d1c5bbe2b9e201e00e1f812507a7e2c97b16d421db5`;
- `receiptHash=1ed2cadf58f1a3213271387400e3015089c24c690b7e1c948eb63d056c564cbc`;
- `validationProofHash=8b64ac285c8612a2987ca856e2e62dfb1b9a9e9671dfb6b1b74b35b0c90b4b05`;
- artifact digest `sha256:267f51c12f5beba5c89e0ff41be3af448b14d6145e45e1f59078a849a724e77b`.

## Schema estrutural observado

O observador M5-C derivou somente estrutura/tipos, sem publicar valores:

- root: array;
- 1 registro;
- 1 objeto;
- campos observados: `data`, `documento`, `documentoResumido`, `elementoDespesa`, `especie`, `fase`, `favorecido`, `orgaoSuperior`, `orgaoVinculado`, `unidadeGestora`, `valor`;
- todos os campos observados têm tipo string;
- `observedSchemaSha256=79f6c837641baf1d6b09c545fe3df836c068ce8a29ff641b6723c477bcd666f6`;
- `valuesIncluded=false`;
- `rawBytesIncluded=false`;
- `normalizationPerformed=false`;
- `parserAdmitted=false`;
- `observerNetworkUsed=false`.

## Conclusão técnica

O bloqueio para obter um primeiro 2xx financeiro do Portal foi removido.

O ARCA agora tem prova live custodial de que:

1. a chave funciona;
2. o endpoint `documentos-relacionados` respondeu 200 nesta execução;
3. o schema real mínimo foi observado de forma estrutural;
4. nenhuma normalização ou correlação foi feita antes de revisar o parser.

Isso não prova regularidade, vínculo com contratação, entrega física, adequação de preço ou qualquer conclusão adversa.

## Limite de autorização

A autorização do run `35917902630` foi consumida.

**Nenhum novo GET ao Portal está autorizado.** Não rerodar o workflow.

## Próximo passo seguro

Sem rede:

1. congelar uma fixture derivada do schema observado, sem valores reais;
2. implementar parser/normalizador para o schema observado;
3. testar contra drift, campos ausentes, valores monetários e datas;
4. admitir o parser somente após CI e revisão humana;
5. só então preparar a entrada custodial na Fase B/M5, sem novo request.

Checkpoint anterior: [045](ARCA_HANDOFF_CHECKPOINT_2026-09-23_045.md).
