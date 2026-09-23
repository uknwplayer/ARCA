# ARCA — Checkpoint 045: autenticação Portal comprovada por situacao-imovel 2xx

Data: **2026-09-23**.

Estado: **CHAVE PORTAL ACEITA EM REQUEST REAL; GATE 040-SI VÁLIDO; UM ÚNICO GET AUTORIZADO A `/api-de-dados/situacao-imovel` RETORNOU HTTP 200; RETRIES=0; RESPOSTA SELADA E CUSTODIADA; AUTORIZAÇÃO CONSUMIDA; `documentos-relacionados` CONTINUA SEPARADO E SEM NOVA AUTORIZAÇÃO**.

## Diagnóstico da CGU

A equipe técnica da CGU respondeu ao chamado e informou que a chave estava inativada no backend. O status foi alterado pela equipe e a chave passou a estar pronta para uso.

A CGU também informou:

- não há exigência adicional de autenticação para `/api-de-dados/despesas/documentos-relacionados`;
- não há restrição específica por GitHub Actions, nuvem, User-Agent ou origem;
- ultrapassar limites pode bloquear a chave por 8 horas;
- `/api-de-dados/despesas/documentos-relacionados` apresenta intermitência conhecida;
- `/api-de-dados/situacao-imovel` é usado pela equipe como endpoint simples para validar a chave.

A CGU não conseguiu correlacionar os HTTP 401 históricos com registro interno específico. Portanto, a inativação anterior é uma explicação fortemente suportada para a falha geral de autenticação, mas este checkpoint não afirma que ela foi a causa exclusiva de cada 401 histórico.

## Gate 040-SI

Run:

https://github.com/uknwplayer/ARCA/actions/runs/35910828041

Revisão:

`9ccf812bad58b1674a48973fb15869a11cb53467`

Resultado:

- `READY_FOR_EXPLICIT_AUTHORIZATION`;
- target `PORTAL_SITUACAO_IMOVEL`;
- `scopeHash=1c4a7104a8233388a569fb85f65ca6d22ec49361e0279c1267490a21b7486b1e`;
- `targetBindingSha256=8def13c302718985ed5feea9b4179953caa1b9ac992f6be8d75b97f36c1e9b32`;
- `credentialFingerprintSha256=37c90b46b7e1a4fcf699aee3f94979829cb044d13979cfbf05a229cd869a8092`;
- `preflightSha256=873b69ca46e0e061b2ee90203904f8a48c47e512a0fadae656078c3efd955587`;
- cofre pronto e privado;
- `portalNetworkUsed=false`;
- `portalRequestCapabilityPresent=false`;
- retry automático não autorizado.

## Probe live controlado

Autorização humana: exatamente um GET em `/api-de-dados/situacao-imovel`, após Gate 040 válido, usando a chave ativada pela CGU, sem retries.

Run:

https://github.com/uknwplayer/ARCA/actions/runs/35910916588

Mesmo SHA do Gate:

`9ccf812bad58b1674a48973fb15869a11cb53467`

Resultado sanitizado:

- exatamente 1 request;
- endpoint `/api-de-dados/situacao-imovel`;
- HTTP **200**;
- `probeStatus=SUCCEEDED`;
- `credentialState=ACCEPTED_ON_OBSERVED_REQUEST`;
- `activeVerified=true`;
- `validationStatus=VALIDATED`;
- 5 valores string validados;
- 66 bytes capturados;
- `retries=0`;
- resposta criptografada antes da validação semântica;
- `STORED_PRIVATE`;
- nenhum classificador;
- nenhum ingresso investigativo;
- nenhuma publicação.

Hashes principais:

- `responseBytesSha256=5f77b47d5430a181e60dc5b0b507e3b0d6c235e5840ee486a7e60be6b9bb3d89`;
- `envelopeHash=ef6bcd5e0c75ba8fa9638780bbf8fbbe5a3402ce3b0a68ab251e3338daf662b8`;
- `receiptHash=5168cb72997d3f8aa504b0aff5939b1215235ebab50ca72c6ec462e2c2f59854`;
- `validationProofHash=2e5dd73b6f6dea9a27234e022af645dca9fc057c66b25fe4f990ce9cf8447fb4`.

Artefato sanitizado/criptografado do workflow:

- artifact id `10772664224`;
- digest `sha256:47955677cd63a52320ce3645159582006e15dd6ffd778cf29270f55bc00882b4`.

O plaintext da resposta não é necessário para o diagnóstico e permanece fora da documentação pública.

## Conclusão técnica

Está provado que a chave atual é aceita pela API do Portal em uma requisição real.

Isso resolve o bloqueio **geral de autenticação**. Não prova que `/despesas/documentos-relacionados` esteja saudável neste momento, pois a própria CGU relatou intermitência nesse endpoint.

O primeiro 2xx de autenticação do Portal foi alcançado, mas o primeiro 2xx de dados financeiros/documentos relacionados necessário ao caminho M5 ainda não foi obtido.

## Limite de autorização

A autorização usada no run `35910916588` foi consumida.

**Nenhum novo GET ao Portal está autorizado.** Não rerodar o run, não repetir `situacao-imovel` e não testar `documentos-relacionados` por inferência.

Qualquer próximo request exige novo escopo, Gate vigente e nova autorização humana explícita.

## Próximo passo seguro

Sem rede:

1. consolidar Gate 045;
2. manter o endpoint de documentos como problema de disponibilidade separado da autenticação;
3. continuar expansão pública offline (Siconfi S3) ou preparar, sem executar, o próximo gate M5;
4. somente voltar a `documentos-relacionados` após nova autorização específica.

Checkpoint anterior: [044](ARCA_HANDOFF_CHECKPOINT_2026-09-23_044.md).
