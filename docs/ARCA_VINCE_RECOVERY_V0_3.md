# ARCA — Vince Recovery V0.3

Status: **CANÔNICO; LIVE PROBE 003 VERIFIED**.

## Objetivo

V0.3 trata perda do processo coordenador **depois que já existe um DispatchRef**.

A regra é:

```text
DispatchRef exists
      |
      v
persist durable checkpoint
      |
 coordinator process disappears
      |
      v
new process loads checkpoint
      |
      +--> original pending/unknown -> wait/inconclusive, no retry
      |
      +--> original success -> verify original result
      |
      +--> original failed/rejected -> fail closed, no silent failover
```

## Checkpoint

`arca.vince-recovery-checkpoint.v0.3` vincula:

- missão completa;
- mission SHA-256;
- snapshot canônico do JobRequest;
- job fingerprint;
- executor selecionado;
- provider family;
- execution domain;
- DispatchRef externo/correlação;
- estado `QUEUE_ACCEPTED`;
- `automatic_retry_allowed=false`;
- hash do próprio checkpoint.

Qualquer drift em missão, job, executor, provider ou DispatchRef invalida o checkpoint.

## Recovery

A recuperação não usa `ExecutorMeshDispatcher.dispatch()`.

Ela recebe apenas:

- checkpoint validado;
- adapter do provider já registrado;
- `status(ref)`;
- `result(ref)` quando o estado original é success.

Estados pendentes/ambíguos produzem:

- `INCONCLUSIVE_UNCERTAIN`;
- `network_dispatch_performed=false`;
- `automatic_retry_performed=false`;
- `failover_authorized=false`.

Falha do original também não autoriza retry automático.

## Live Probe 003

Issue: #115 — concluída. Control-plane workflow: `35810698274`; original Satellite A run: `35810708455`.

O workflow usa dois jobs separados:

1. `dispatch-before-crash`: despacha uma vez em Satellite A, grava e publica somente o checkpoint;
2. `recover-after-crash`: nasce em runner separado, baixa o checkpoint e recupera o resultado pelo DispatchRef original.

A passagem entre os jobs é somente pelo artefato de checkpoint. O segundo job não recebe estado Python do primeiro.

Critério de sucesso:

- exatamente um commit/request de dispatch;
- exatamente um run remoto para esse DispatchRef;
- nenhum dispatch em Satellite B;
- resultado original verificado;
- proof V0.3 com zero redispatch;
- hashes do checkpoint, recibo e proof reproduzíveis.

## Limite

Resultado live: dois runners distintos provaram `one dispatch -> checkpoint -> fresh runner -> original result`, com `network_dispatch_performed=false`, `automatic_retry_performed=false`, `failover_authorized=false` e zero execução em Satellite B. V0.3 prova recovery quando o resultado original pode ser reencontrado por um DispatchRef durável. Não prova ainda recuperação quando o provider perde sua própria evidência ou quando existe efeito externo não idempotente impossível de consultar.
