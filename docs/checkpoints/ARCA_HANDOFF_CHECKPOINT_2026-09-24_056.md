# ARCA — Checkpoint 056: M5-M executado, 2 respostas HTTP 400 custodiadas

Data: **2026-09-24**.

Estado: **AUTORIZAÇÃO M5-M CONSUMIDA; EXATAMENTE 2 GETS PNCP EXECUTADOS; ZERO RETRIES; AMBOS HTTP 400; DUAS RESPOSTAS SELADAS E ARMAZENADAS NO COFRE PRIVADO; ZERO PUBLICAÇÃO; ZERO CORRELAÇÃO; DIAGNÓSTICO OFFLINE IMPLEMENTADO EM BRANCH**.

## Execução live M5-M

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36036733351

Revisão:

`2c9d5928196fbe4ae77cfe79c2ddf9f70303c297`

Candidato autorizado:

`aa995fd2886bc5707ff63dc6e672b3a1a5a1d6770b179122927775aa752c99ec`

Plano:

`6785b0e36a848cef5085050b2cf373731796ab45ffb78fd3b22325b21f51d22f`

Resultado:

- `targetCount=2`;
- `observationCount=2`;
- primeiro alvo: HTTP 400, 251 bytes;
- segundo alvo: HTTP 400, 251 bytes;
- `retries=0`;
- `STORED_PRIVATE`;
- `correlationAttempted=false`;
- `publicationAttempted=false`.

Envelope custodial:

`722c2e858cfd4530b7f1531248836cf2e4a88de28e3f891bdfef5607a68f240a`

Receipt privado:

`ae9bec4cf918c878971999c85056aa7983222593618a6ce80af97b2c13e0ab23`

Resultado sanitizado:

`94bb21a55ba0693e7445295704f9ea242c1dbcc11fa46c340db2e548e7e81ffb`

## Interpretação

Os dois 400 não autorizam retry e não provam erro de documentação, ausência de contrato, parâmetro inválido ou indisponibilidade.

A documentação PNCP v2.6 continua descrevendo o endpoint usado. A causa concreta deve ser inferida apenas a partir dos dois corpos já custodiais, sem novo request.

## Diagnóstico offline

Foi implementado um diagnóstico privado que:

- busca apenas o envelope criptografado já armazenado;
- revalida envelope, candidate, plan, target e response hashes;
- abre os corpos com a passphrase PNCP no runner;
- não imprime o corpo bruto;
- publica somente shape JSON, hashes, flags de palavras-chave e uma classificação enum;
- executa `sourceRequestCount=0`;
- mantém publicação/correlação desligadas.

## Próximo passo

Passar CI, integrar o diagnóstico e executar o workflow offline.

Se o diagnóstico identificar um erro de parâmetro/rota, corrigir o gate sem novo GET automático. Qualquer nova consulta de fonte exigirá novo candidato e nova autorização.

Checkpoint anterior: [055](ARCA_HANDOFF_CHECKPOINT_2026-09-24_055.md).
