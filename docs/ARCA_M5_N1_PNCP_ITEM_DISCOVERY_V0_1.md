# ARCA — M5-N1 Descoberta PNCP de Itens V0.1

Estado: **IMPLEMENTADO EM BRANCH / PREFLIGHT PRIVADO / LIVE DORMENTE / ZERO NOVO GET**.

## Objetivo

Abrir uma rota documental complementar depois do limite probatório do M5-M.

Fluxo:

`contratação normalizada → itens da contratação → somente depois resultados dos itens`

O M5-N1 não consulta resultados. Ele descobre apenas:

- `numeroItem`;
- `temResultado`.

## Superfície oficial

Manual PNCP v2.6 — seção 11.13.

Endpoint:

`GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens`

Base:

`https://pncp.gov.br/api/pncp`

Query fixada:

- `pagina=1`;
- `tamanhoPagina=50`.

O manual documenta `pagina`, `tamanhoPagina` e o campo de retorno `temResultado`.

## Orçamento

A base PNCP normalizada atual contém exatamente 2 contratações.

O M5-N1 fixa:

- `maxRequests=2`;
- `retries=0`;
- uma chamada por contratação;
- `timeoutMs=30000`;
- `maxBytesPerResponse=524288`;
- `maxItemsPerResponse=50`.

## Cobertura completa vs. truncamento

Se uma resposta retornar exatamente 50 itens, o ARCA marca:

`pagePossiblyTruncated=true`

e:

`nextStageReady=false`.

Isso impede tratar a primeira página como lista completa sem evidência.

Se a página tiver menos de 50 itens, o M5-N1 pode calcular privadamente quais itens têm `temResultado=true`.

A prova sanitizada publica apenas:

- `itemCount`;
- `itemsWithResultCount`;
- `pagePossiblyTruncated`;
- `resultItemSetSha256`;
- `nextStageReady`.

Os números dos itens permanecem na custódia privada.

## M5-N2

Somente depois de uma captura M5-N1 completa será permitido gerar alvos para:

`GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados`

O Manual PNCP v2.6 seção 11.17 documenta que o retorno inclui, entre outros:

- `niFornecedor`;
- `nomeRazaoSocialFornecedor`;
- valores homologados;
- `numeroControlePNCPCompra`.

O M5-N2 será um gate separado. Quantidade de requests e batching dependerão do número real de itens com `temResultado=true`.

## Privacidade

O preflight abre somente a normalização PNCP privada já custodial.

CNPJ, ano e sequencial nunca saem no candidato público. O candidato publica apenas hashes dos dois alvos.

## Live dormente

Workflow:

`.github/workflows/arca-m5-n1-pncp-item-discovery-live.yml`

Branch exigido:

`m5-n1-pncp-item-discovery-live-c<CANDIDATE_SHA256>`

Confirmação exigida:

`PNCP_ITEM_DISCOVERY_GET_ONLY`

Sem candidato final e autorização humana explícita, nenhum GET é executado.

## Segurança

- host fixo `pncp.gov.br`;
- path allowlisted;
- query exata `pagina=1&tamanhoPagina=50`;
- zero redirects;
- zero retries;
- custódia antes de uso;
- sem publicação;
- sem correlação;
- sem inferência de fornecedor;
- nenhum achado adverso automático.

## Próximo passo

1. CI;
2. merge;
3. preflight privado na revisão final;
4. obter `planSha256`, `candidateSha256` e dois target hashes;
5. pedir autorização humana para exatamente os 2 GETs de itens;
6. somente depois executar o live M5-N1.

Nenhum novo GET é necessário para concluir esta etapa.
