# ARCA — M5 PNCP Live Parser V0.1

Estado: **IMPLEMENTADO EM BRANCH / FIXTURE SINTÉTICA / LIVE AINDA BLOQUEADO**.

## Origem observada

Custódia PNCP histórica:

- run: `35547609136`;
- revisão: `b20e377f8b9b4f7831e3b4b3877913a5c35ac09e`;
- envelope: `c707689e04d7bd091a59555d883a2d2a4d716b442b485d8b3b55efa1c65c6202`;
- receipt: `ad1fd3f1c3e09637f48f8e387f47f518392246cb30338704e914bac99028e19b`;
- scope: `1d0354ffdf1bf0971aab175eb170e9bcb05491a708daba015e8b967cdf59b084`.

Observador estrutural:

- run: `35932200063`;
- `observedStructureSha256=4a00de8f61190819cc6e172f45438dcb22dc1c952430fc7a1c79f2cc0dcfabb9`;
- 3 arquivos / 6289 bytes;
- valores não publicados;
- bytes crus não publicados;
- observerNetworkUsed=false.

## Página PNCP observada

Uma das três entradas custodiais é uma página JSON com:

- `data`: array de 2 contratações;
- `empty`;
- `numeroPagina`;
- `paginasRestantes`;
- `totalPaginas`;
- `totalRegistros`.

Os registros possuem 35 campos, incluindo:

- `numeroControlePNCP`;
- `anoCompra`;
- `sequencialCompra`;
- `orgaoEntidade`;
- `unidadeOrgao`;
- `modalidadeId/modalidadeNome`;
- `processo`;
- `objetoCompra`;
- `dataPublicacaoPncp`;
- `situacaoCompra*`;
- `valorTotalEstimado`.

## Limite semântico importante

A página de descoberta observada **não contém fornecedor/adjudicatário**.

O parser emite:

- `supplierIdentifier=null`;
- `supplierObserved=false`.

Nenhum nome, valor ou proximidade temporal pode ser usado para inventar essa relação.

## Parser V1

Arquivo:

`src/investigation/m5-pncp-live-parser.mjs`

O parser:

- exige os 35 campos exatos;
- valida estruturas internas de órgão, unidade e amparo legal;
- valida o vínculo entre `numeroControlePNCP`, CNPJ, ano e sequencial;
- normaliza CNPJ, UF, IBGE, modalidade, data e valor estimado;
- converte valor estimado para centavos com rejeição de precisão ambígua;
- preserva descrição do objeto;
- não infere fornecedor;
- não autoriza correlação ou publicação.

Contrato:

`M5_PNCP_LIVE_PARSER_CONTRACT_SHA256`

## Estado de rede

Nenhum novo GET PNCP foi executado para construir este parser.

O único modo atual é `SYNTHETIC_FIXTURE`; `CUSTODIAL_LIVE` permanece bloqueado até gate posterior.
