# ARCA — Checkpoint 058: M5-M corrigido executado, 404/404 custodiados e diagnóstico offline inconclusivo

Data: **2026-09-24**.

Estado: **SEGUNDO CICLO LIVE M5-M CONCLUÍDO; EXATAMENTE 2 GETS COM `pagina=1`; ZERO RETRIES; HTTP 404 + HTTP 404; RESPOSTAS SELADAS E STORED_PRIVATE; DIAGNÓSTICO OFFLINE EXECUTADO SEM NOVO GET; NENHUMA PUBLICAÇÃO; NENHUMA CORRELAÇÃO; AUSÊNCIA DE CONTRATO/EMPENHO NÃO COMPROVADA**.

## Execução live corrigida

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36039677768

Revisão:

`7532add21655faaefa252d7c0449a6665d9e589f`

Candidato consumido:

`3905c087fb9fe6c8d2f4a984d5f79b9a22dba8d6bb81ca7d33b32147032ba606`

Plano:

`a43caaaeda2107603eb0345dbca7cedf720620f86735328fe532f90cc021c097`

Resultado:

- target 1: HTTP 404, 231 bytes;
- target 2: HTTP 404, 231 bytes;
- `maxRequests=2`;
- `retries=0`;
- `STORED_PRIVATE`;
- `publicationAttempted=false`;
- `correlationAttempted=false`.

Custódia:

`envelopeHash=568f3eb14ec3c024e3a8b1d8d3e2487062e96d7361e4d734fa8d566f4e6814eb`

`receiptHash=fcf51b092da17bc741c2e705732cd54fc49823ab4586e8214150c3ec44ef9fd3`

`resultHash=ffb74ca468fee9502f8df8c158c6a86bde9e7cbf0c930d30dd3a7d509dd9e739`

## Diagnóstico offline dos 404

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36040450553

`sourceRequestCount=0`

`sourceNetworkUsed=false`

`diagnosisSha256=edfbd87889c3b38733faa72d226d8fbbc32a145d384a5568979c14a3204bae5c`

As duas respostas têm:

- mesmo shape JSON: `error, message, path, status, timestamp`;
- mesmo hash de mensagem;
- mensagem com semântica relacionada a contrato;
- nenhum marcador detectado de rota/recurso estático;
- nenhum marcador detectado de parâmetro;
- nenhum marcador detectado de autenticação/forbidden;
- mesmo template interno de path `/pncp-api/...`.

O classificador seguro retornou:

`UNCLASSIFIED`

nos dois casos.

## Interpretação obrigatória

Não declarar que:

- não existem contratos/empenhos vinculados;
- o endpoint está incorreto;
- os identificadores estão inválidos;
- o PNCP está indisponível.

O 404 é um fato observado. A causa ainda não foi provada.

A documentação oficial PNCP v2.6 continua descrevendo o serviço 13.10 como recuperação de contratos/empenhos de uma contratação e documenta os campos de fornecedor no retorno. O runtime já provou exigir `pagina`, apesar de o manual 13.10 não listá-lo.

## Próximo passo

Não repetir GET.

Antes de qualquer nova aquisição, escolher uma superfície pública oficial complementar que aumente cobertura sem presumir o significado do 404. A alternativa natural já documentada no PNCP é aprofundar:

`contratação → itens → resultados de item`

porque resultados de item podem trazer fornecedor/adjudicatário por item.

Qualquer novo acesso live deverá ter novo plano, novo preflight, novo candidato e autorização humana explícita.

Checkpoint anterior: [057](ARCA_HANDOFF_CHECKPOINT_2026-09-24_057.md).
