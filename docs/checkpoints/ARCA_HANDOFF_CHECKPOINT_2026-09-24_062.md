# ARCA — Checkpoint 062: M5-N1 auto-live revelou drift de schema e ordem de custódia foi corrigida

Data: **2026-09-24**.

Estado: **POLÍTICA GET POR CUSTO INTEGRADA; PRIMEIRO LIVE AUTOMÁTICO M5-N1 EXECUTOU 2 GETS COM `tamanhoPagina=10`, ZERO RETRIES; OBSERVADOR FALHOU COM `ARCA_M5_N1_RESPONSE_SHAPE_INVALID`; RESPOSTAS NÃO FORAM PERSISTIDAS POR FALHA DE ORDEM NO EXECUTOR; CORREÇÃO CUSTODY-BEFORE-OBSERVATION IMPLEMENTADA EM BRANCH; NENHUM RETRY AUTOMÁTICO DO MESMO CANDIDATO**.

## Política integrada

PR #208 integrou:

- GET sem custo monetário observado → execução automática;
- GET monetariamente cobrado → autorização humana;
- custo desconhecido → bloqueio até classificação;
- PNCP consulta pública → `NO_MONETARY_CHARGE_OBSERVED`;
- M5-N1 reduzido para `pagina=1&tamanhoPagina=10`.

Commit base:

`bf176726b2c2f557f9e07a39450451da5a39647a`

## Preflight page10

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36050289566

Resultado:

- `status=READY_FOR_CONTROLLED_EXECUTION`;
- `planSha256=ce700d1311b6471d9308386a39df700205190cba3413d723b91507688dede2eb`;
- `candidateSha256=8fbe4dc91e2ac31a3130627a9fb1d3a60cbb4eb41c60f46af61a278a23517c7b`;
- `humanAuthorizationRequired=false`;
- `autoExecutionAllowed=true`;
- `tamanhoPagina=10`;
- dois alvos;
- zero retries.

## Primeiro live automático

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36050412298

O transporte concluiu os 2 GETs antes da fase estrutural. O job falhou depois com:

`ARCA_M5_N1_RESPONSE_SHAPE_INVALID`

Como o observador só lança esse erro para resposta HTTP 200, pelo menos a primeira resposta observada chegou com 2xx/JSON, mas o formato top-level não correspondeu ao contrato atual `{itens:[...]}`.

Não inferir o shape real a partir dessa falha.

## Falha arquitetural descoberta

O executor seguia:

`GETs → seal local → structural observation → durable persist`

Logo, o erro estrutural ocorreu **antes do persist durável**. O `finally` removeu o staging local.

Resultado: os dois GETs ocorreram, mas os corpos desse run não ficaram recuperáveis no cofre privado.

Isso viola a intenção arquitetural de “custódia antes de interpretação”.

## Correção

A ordem passa a ser:

`GETs → seal → durable persist → structural observation`

A captura durável usa primeiro o schema genérico PNCP já suportado:

`arca.pncp-controlled-live-probe.v0.1`

Somente depois o M5-N1 tenta observar os itens.

Se o schema divergir novamente:

- o job não perde a captura;
- retorna `SCHEMA_UNEXPECTED`;
- publica apenas diagnóstico estrutural sanitizado;
- não expõe valores;
- não libera M5-N2.

## Próximo passo

CI → merge → novo preflight na revisão corrigida.

Como PNCP segue classificado sem custo monetário observado, um novo live pode executar automaticamente sob novo candidato hash-bound.

Não reutilizar o candidato `8fbe4dc9...17c7b`.

Checkpoint anterior: [061](ARCA_HANDOFF_CHECKPOINT_2026-09-24_061.md).
