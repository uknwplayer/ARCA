# ARCA — Checkpoint 059: M5-N1 descoberta de itens PNCP preparada

Data: **2026-09-24**.

Estado: **M5-M PRESERVADO EM 404/404 UNCLASSIFIED; NOVA ROTA DOCUMENTAL PNCP SELECIONADA; M5-N1 IMPLEMENTADO EM BRANCH; 2 GETS MÁXIMOS; ZERO RETRIES; `pagina=1&tamanhoPagina=50`; PREFLIGHT PRIVADO E LIVE HASH-BOUND PREPARADOS; NENHUM NOVO GET EXECUTADO**.

## Base

Checkpoint anterior: [058](ARCA_HANDOFF_CHECKPOINT_2026-09-24_058.md).

M5-M permanece encerrado sem conclusão semântica sobre os 404.

## Decisão técnica

Não repetir `contratos/contratacao`.

O próximo aprofundamento usa a própria contratação:

`contratação → itens → resultados de item`.

Manual PNCP v2.6:

- 11.13 — Consultar Itens de uma Contratação;
- 11.17 — Consultar Resultados de Item de uma Contratação.

## M5-N1

Endpoint:

`GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens`

Query:

`pagina=1&tamanhoPagina=50`

Budget:

- 2 contratações;
- no máximo 2 requests;
- zero retries;
- 30 s;
- 512 KiB por resposta;
- até 50 itens por resposta.

## Observação estrutural

O M5-N1 observa somente:

- quantidade de itens;
- quantidade com `temResultado=true`;
- se a primeira página ficou cheia;
- hash do conjunto de itens com resultado.

Se `itemCount=50`, a cobertura é marcada potencialmente truncada e o M5-N2 fica bloqueado até paginação adicional.

## M5-N2 futuro

O endpoint de resultados será derivado somente de itens reais com `temResultado=true`.

O resultado pode trazer fornecedor/arrematante e referência direta da contratação, mas isso ainda não foi observado live.

## Estado de autorização

**Nenhum GET M5-N1 está autorizado por este checkpoint.**

O live existe apenas como capability dormente.

## Próximo passo

CI → merge → preflight privado final → candidato canônico → autorização humana específica.

Checkpoint anterior: [058](ARCA_HANDOFF_CHECKPOINT_2026-09-24_058.md).
