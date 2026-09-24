# ARCA — Checkpoint 063: captura M5-N1 200/200 custodial e runtime array observado

Data: **2026-09-24**.

Estado: **POLÍTICA GET POR CUSTO VIGENTE; M5-N1 CUSTODY-BEFORE-OBSERVATION INTEGRADO; NOVO LIVE AUTOMÁTICO CONCLUÍDO COM 2 GETS, ZERO RETRIES, HTTP 200 + HTTP 200; RESPOSTAS STORED_PRIVATE; RUNTIME DEVOLVE BARE ARRAY COM 4 E 5 ELEMENTOS; PARSER OFFLINE ADAPTADO EM BRANCH; ZERO NOVO GET NECESSÁRIO PARA INTERPRETAÇÃO**.

## Base corrigida

PR #209:

https://github.com/uknwplayer/ARCA/pull/209

Merge:

`9f1dc3111abfc55e2aba5b2055e4a7774e2a644b`

A ordem operacional passou a ser:

`GETs → seal → durable persist → structural observation`

## Preflight final

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36051311684

Resultado:

- `status=READY_FOR_CONTROLLED_EXECUTION`;
- `planSha256=ce700d1311b6471d9308386a39df700205190cba3413d723b91507688dede2eb`;
- `candidateSha256=e13bb2cc94b85d599434f2287b4718f18b26136a6b6b2a97380e033e3568ecae`;
- `costClass=NO_MONETARY_CHARGE_OBSERVED`;
- `humanAuthorizationRequired=false`;
- `autoExecutionAllowed=true`;
- 2 targets;
- `pagina=1`;
- `tamanhoPagina=10`;
- zero retries.

## Live M5-N1 durável

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36051395397

Resultado:

- 2 GETs exatos;
- zero retries;
- HTTP 200 + HTTP 200;
- `STORED_PRIVATE`;
- nenhuma publicação;
- nenhuma correlação;
- nenhuma inferência de fornecedor.

`resultHash=45068b93ffe84866938cbc290a41a56f3897cff5f14356805c958579ccfbb68a`

`captureResultHash=c7a44bd0397e439115c10ba43bc56ad8b6802d60db665bb82f18d1007fd720b7`

Custódia:

- `envelopeHash=41110be726a598a2e620a55dc65d8fb4366fc04381182c264c641f322ebc3d4b`;
- `contentRootHash=16be89896688c4af7f1a2cb3a679461237f049a2a14481f57a12a247b16dbb59`;
- `payloadHash=7abf751c3012e2ca6b732b003aab69cbd9bfc62fca388652c1298d9b69a8ce7e`;
- `receiptHash=1b0c5278dd23e904b74455f3a9ac592d81bd4ba5e875c8e6b52fb148790c84a9`;
- 3 arquivos;
- 17.915 bytes.

## Drift manual ↔ runtime

O observador estrutural não publicou os valores.

Alvo 1:

- HTTP 200;
- JSON UTF-8 válido;
- `jsonKind=ARRAY`;
- `arrayLength=4`;
- `shapeSha256=307bb8c1c17f536705a357b921a2290ebda9a3f5d7a98ec587bec06f5d0f898b`.

Alvo 2:

- HTTP 200;
- JSON UTF-8 válido;
- `jsonKind=ARRAY`;
- `arrayLength=5`;
- `shapeSha256=1929698e75b45b1536c0ed9bc73e0c32a0b1b1ff150305df2b8149a11899bbf8`.

O Manual PNCP descreve uma propriedade `itens`, porém o runtime observado devolveu diretamente o array.

Estado:

`DOCUMENTATION_RUNTIME_SHAPE_DRIFT_OBSERVED`

Não inferir ainda que todos os 4/5 elementos são itens válidos até o parser estrutural validar `numeroItem` e `temResultado`.

## Adaptação offline

O parser M5-N1 passa a aceitar dois shapes explícitos:

- `OBJECT_ITENS` — shape documentado;
- `BARE_ARRAY` — shape live observado.

A observação offline da custódia:

- revalida envelope/candidate/plan/target/response/shape hashes;
- abre apenas os bytes já custodiais;
- valida `numeroItem` e `temResultado`;
- calcula itemCount e itemsWithResultCount;
- preserva números de itens privados;
- publica apenas hashes/contagens;
- executa `sourceRequestCount=0`;
- bloqueia M5-N2 se alguma página tiver 10 itens.

## Próximo passo

CI → merge → executar o workflow de observação offline na custódia do run `36051395397`.

Nenhum novo GET ao PNCP é necessário para esse passo.

Se a observação validar os arrays e houver itens com `temResultado=true`, construir M5-N2 a partir dos números de itens privados já custodiais.

Checkpoint anterior: [062](ARCA_HANDOFF_CHECKPOINT_2026-09-24_062.md).
