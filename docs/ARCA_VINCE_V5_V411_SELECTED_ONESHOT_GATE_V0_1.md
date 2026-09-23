# ARCA — Vince V5 → V4.1.1 Selected One-Shot Gate V0.1

Status: **CANDIDATO / PROBE 011 PRÉ-REGISTRADO / LIVE PENDENTE**.

Issue: #150.

## Objetivo

Integrar duas provas já existentes sem depender de Work ou Replit:

```text
presença V5
   ↓
route selection
   ↓
EXATAMENTE 1 elegível
   ↓
dispatch vinculado a nodeId + fingerprint + request hash
   ↓
Termux selecionado executa git-status uma vez
   ↓
resultado Ed25519 V4.1
   ↓
verificação pinada V4.1.1
   ↓
CAS no registry durável
   ↓
replay rejeitado sem reexecutar worker
```

## Mudança de segurança

O request V4.1 original não identifica o worker escolhido. Portanto o Probe 011 não entrega o request diretamente ao worker.

Antes da execução é criado um envelope:

`arca-vince-v5-v4.1.1-selected-dispatch-v1`

Ele vincula:

- `jobId`;
- `selectedEndpointId`;
- fingerprint Ed25519 selecionada;
- SHA-256 canônico do request;
- SHA-256 da route proof;
- caminhos das presenças usadas;
- expiração;
- política de zero retry e zero failover automático.

O worker lê o dispatch, o request e a route proof, carrega sua identidade local e recusa a execução se qualquer vínculo divergir.

## Fail-closed por ambiguidade

Este primeiro gate executável exige:

`eligibleCount === 1`

Mesmo que o algoritmo V5 consiga escolher a evidência mais recente entre vários elegíveis, o Probe 011 não executa quando existe mais de uma opção válida. O objetivo agora é provar correlação execução↔seleção, não política de concorrência.

## Request

O inner request continua V4.1 sem ampliação de capability:

- action: `git-status`;
- challenge aleatório de 32 bytes;
- request create-only no canal;
- expiração de 5 a 60 minutos;
- sem shell arbitrário.

## Execução

Comando operacional:

`scripts/arca-vince-v5-v411-selected.mjs once-selected`

Ele:

1. lê dispatch e request;
2. lê a route proof referenciada;
3. exige que o pin informado corresponda ao selecionado;
4. exige que a identidade privada local corresponda ao selecionado;
5. revalida o request SHA imediatamente antes do one-shot;
6. executa o worker V4.1 já existente;
7. grava um único resultado assinado.

O ledger local do worker continua bloqueando a reutilização do challenge antes de `git-status`.

## Verificação e consumo durável sem Actions operacional

`verify-consume` roda no Termux e:

1. materializa dispatch, route, request, result e registry pelo GitHub;
2. verifica o vínculo V5;
3. verifica a attestation Ed25519 V4.1;
4. verifica pin do worker;
5. acrescenta o challenge ao registry V4.1.1;
6. faz update com compare-and-swap usando o blob SHA atual;
7. lê o registry novamente;
8. exige correspondência mission/request/result/proof/worker;
9. grava acceptance proof create-only.

GitHub Actions pode executar CI do código, mas não é necessário como executor nem como verificador operacional do Probe 011.

## Replay

`replay-check` consulta o registry durável. PASS exige:

- challenge já consumido;
- missionId correspondente;
- `DURABLE_REPLAY_REJECTED`;
- `workerReexecuted:false`.

Ele não chama o worker.

## Limites

O Probe 011 não concede:

- retry automático;
- failover automático depois do dispatch;
- shell genérico;
- main.write;
- trust.modify;
- Portal/PNCP;
- Edge Steward;
- serviço 24/7;
- redundância física.

A e B continuam no mesmo Android.

## Sequência live planejada

1. atualizar Termux para o commit integrado;
2. manter A `WITHDRAWN`;
3. B publica uma nova lease `READY`;
4. `prepare` confirma exatamente 1 elegível e cria route/request/dispatch;
5. somente B executa `once-selected`;
6. `verify-consume` valida e consome challenge;
7. `replay-check` prova rejeição durável sem worker;
8. registrar hashes e checkpoint.

Se qualquer fase divergir, parar; não criar segundo request e não escolher outro worker automaticamente.
