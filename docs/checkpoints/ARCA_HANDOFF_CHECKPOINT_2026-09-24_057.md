# ARCA — Checkpoint 057: drift PNCP M5-M diagnosticado e pagina=1 incorporado

Data: **2026-09-24**.

Estado: **RUN M5-M 36036733351 PRESERVADO; 2 GETS CONSUMIDOS; 400/400; ZERO RETRIES; DIAGNÓSTICO OFFLINE 36037934342 CONCLUÍDO; RUNTIME EXIGE `pagina`; CORREÇÃO MÍNIMA `pagina=1` IMPLEMENTADA EM BRANCH; NENHUM NOVO GET AUTORIZADO**.

## Execução que revelou o drift

Live:

https://github.com/uknwplayer/ARCA/actions/runs/36036733351

Candidato consumido:

`aa995fd2886bc5707ff63dc6e672b3a1a5a1d6770b179122927775aa752c99ec`

Resultado:

- 2 requests;
- zero retries;
- HTTP 400 + HTTP 400;
- 251 bytes em cada resposta;
- custódia privada antes da análise;
- zero publicação;
- zero correlação.

## Diagnóstico offline

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36037934342

`sourceRequestCount=0`

`sourceNetworkUsed=false`

`diagnosisSha256=a3651eadf7af9a0f8d072a43853b5778f785447b52e91fef4a5f4bcdffa0f9de`

As duas respostas possuem o mesmo shape:

`error, message, path, status, timestamp`

A mensagem possui exatamente o mesmo hash nas duas respostas:

`c1d6bb85779fbebfd285b2e31d103f4c4b97ccf8128403e5a1db6092833f6fc2`

Esse digest corresponde exatamente à mensagem genérica:

`Required request parameter 'pagina' for method parameter type Integer is not present`

Isso identifica a pré-condição runtime ausente sem expor CNPJ, ano ou sequencial dos alvos.

O path interno retornado pelo servidor possui template redigido compatível com:

`/pncp-api/v{N}/orgaos/{N}/contratos/contratacao/{N}/{N}`

O prefixo interno `/pncp-api` não altera o BASE_URL externo oficial `https://pncp.gov.br/api/pncp`.

## Divergência documental

O Manual de Integração PNCP v2.6, seção 13.10, documenta como entradas:

- `cnpj`;
- `anoContratacao`;
- `sequencialContratacao`.

O exemplo oficial não inclui `pagina`.

Portanto o estado é:

`DOCUMENTATION_RUNTIME_DRIFT_OBSERVED`

Não concluir que os identificadores privados estavam inválidos.

## Correção

O plano M5-M passa a vincular a query separadamente:

`query={pagina:1}`

O transporte:

- continua host/path allowlisted;
- exige exatamente `pagina=1`;
- rejeita `pagina=2`, parâmetros adicionais ou query divergente;
- mantém `maxRequests=2`;
- mantém `retries=0`;
- mantém timeout 30 s;
- não adiciona `tamanhoPagina`.

Como a query participa do `targetSha256`, o plano/candidato antigos não podem ser reutilizados.

## Próximo passo

CI → merge → novo preflight privado → novo candidato canônico → nova autorização humana específica.

**Nenhum novo GET PNCP está autorizado neste checkpoint.**

Checkpoint anterior: [056](ARCA_HANDOFF_CHECKPOINT_2026-09-24_056.md).
