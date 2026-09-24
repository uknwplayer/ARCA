# ARCA — M5-N1 Descoberta PNCP de Itens V0.1

Estado: **POLÍTICA GET POR CUSTO APLICADA / `tamanhoPagina=10` / PREFLIGHT PRIVADO / LIVE CONTROLADO SEM GATE HUMANO POR REQUEST**.

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
- `tamanhoPagina=10`.

O manual documenta `pagina`, `tamanhoPagina` e o campo de retorno `temResultado`.

## Orçamento

A base PNCP normalizada atual contém exatamente 2 contratações.

O M5-N1 fixa:

- `maxRequests=2`;
- `retries=0`;
- uma chamada por contratação;
- `timeoutMs=30000`;
- `maxBytesPerResponse=524288`;
- `maxItemsPerResponse=10`.

## Cobertura completa vs. truncamento

Se uma resposta retornar exatamente 10 itens, o ARCA marca:

`pagePossiblyTruncated=true`

e:

`nextStageReady=false`.

Isso impede tratar a primeira página como lista completa sem evidência.

Se a página tiver menos de 10 itens, o M5-N1 pode calcular privadamente quais itens têm `temResultado=true`.

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

Política de execução:

- PNCP consulta pública classificada como `NO_MONETARY_CHARGE_OBSERVED`;
- `humanAuthorizationRequired=false`;
- `autoExecutionAllowed=true`;
- o live continua hash-bound ao `candidateSha256`;
- custo desconhecido bloqueia execução até classificação;
- GET com custo monetário continua exigindo autorização humana.

Não existe mais confirmação humana por request para este GET público sem custo monetário observado.

## Segurança

- host fixo `pncp.gov.br`;
- path allowlisted;
- query exata `pagina=1&tamanhoPagina=10`;
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
4. obter novo `planSha256`, `candidateSha256` e dois target hashes para `tamanhoPagina=10`;
5. validar `NO_MONETARY_CHARGE_OBSERVED` + budgets + bindings;
6. executar automaticamente o live M5-N1, sem pedir autorização humana por request.

O candidato anterior com `tamanhoPagina=50` é obsoleto.
