# ARCA — Checkpoint 052: PNCP live normalizado e binding M5-J preparado

Data: **2026-09-24**.

Estado: **PORTAL M5-I PRONTO; PNCP HISTÓRICO NORMALIZADO COM 2 REGISTROS E PERSISTIDO NO COFRE PRIVADO; M5-J IMPLEMENTADO PARA FASE B; FORNECEDOR NÃO OBSERVADO; CORRELAÇÃO AINDA NÃO EXECUTADA; ZERO NOVO GET**.

## Integrações que destravaram o PNCP

PR #195:

- normalização de whitespace em `objetoCompra`;
- CI pós-merge `36025560983` verde;
- main `d5a07bda4e746feb6c310c928692ed6e0e7b5780`.

Primeira execução após #195:

https://github.com/uknwplayer/ARCA/actions/runs/36025706768

A normalização passou e provou:

- 2 registros;
- `normalizationSha256=c91e5bce7240fa6ca127aeeb33f7a7763a891bd84c65ee1a29950e66a32b7a2d`;
- `supplierObserved=false`.

A persistência falhou porque o private normalization store ainda validava `portalRequestUsed` para o schema PNCP.

PR #196 corrigiu a validação por fonte:

- Portal exige `portalRequestUsed=false`;
- PNCP exige `pncpRequestUsed=false`;
- mistura de flags falha fechado;
- CI e pós-merge verdes;
- main `0bc2162e42df03625dd54476344fe45966773d8f`.

## Normalização PNCP canônica

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36026221085

Resultado:

- `NORMALIZED_CUSTODIAL_OFFLINE`;
- 2 registros;
- `normalizationSha256=c91e5bce7240fa6ca127aeeb33f7a7763a891bd84c65ee1a29950e66a32b7a2d`;
- `normalizedEnvelopeSha256=95eaf8fa048860dc2e41edcb1de043405d5e7a0a60d4183420b0fb4bf3791f33`;
- `normalizedContentRootSha256=99cba45df309b2383e5ace89e16fd61ce31f811c84cac33ddfcc151e29a49f7b`;
- `proofSha256=450174620c2490c77953ece5a2aa20d0eec3829e6e45c9d46e4382d9773dc862`;
- `supplierObserved=false`;
- `pncpRequestUsed=false`;
- `publicationAttempted=false`;
- `correlationAttempted=false`.

Persistência privada:

- status `STORED_PRIVATE`;
- receipt `00d024c3b7e9dfc657b2dc8705e93d2a6d2ddadde4dd55718b2c4b46833b9447`;
- `plaintextStored=false`.

## M5-J

Novo componente:

`src/investigation/m5-pncp-live-normalized-binding.mjs`

Config:

`config/m5-pncp-live-normalized-binding.json`

Função:

- manter captura PNCP original como âncora;
- manter normalização privada como derivação;
- gerar `custodyInput` e `sourceBinding` para a Fase B;
- preservar a lacuna `supplierObserved=false`;
- impedir inferência de fornecedor;
- manter correlação/publicação desautorizadas.

## Estado dos dois lados

Portal:

`captura → custódia → schema observado → parser → normalização privada → M5-I`

PNCP:

`captura → custódia → estrutura observada → parser → normalização privada → M5-J`

Os dois lados estão tecnicamente prontos para um gate de prontidão da Fase B.

## Limite probatório

A captura PNCP não inclui fornecedor/adjudicatário.

Portanto:

- não existe ponte forte de fornecedor disponível pelo PNCP atual;
- não preencher a lacuna por nome, suposição ou proximidade;
- a ausência não é sinal adverso;
- um próximo gate deve determinar quais pontes documentais realmente existem entre os lados antes de executar correlação.

## Próximo passo

Implementar um gate offline de prontidão de correlação entre M5-I e M5-J.

O gate deve classificar cada ponte potencial como:

- observada e utilizável;
- candidata;
- indisponível por cobertura;
- conflitante.

Nenhuma correlação nem publicação deve ocorrer apenas por integrar M5-J.

Checkpoint anterior: [051](ARCA_HANDOFF_CHECKPOINT_2026-09-23_051.md).
