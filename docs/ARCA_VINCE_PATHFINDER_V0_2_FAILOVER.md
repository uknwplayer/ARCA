# ARCA — Vince Pathfinder V0.2 / Controlled Failover

Status: **IMPLEMENTAÇÃO CANDIDATA; LIVE PROBE 002 PENDENTE**.

## Objetivo

V0.2 adiciona uma prova explícita de failover seguro ao Vince sem alterar a autoridade de executores.

O caminho aceito é estrito:

```text
candidate A
  -> TRANSIENT_FAILURE before dispatch acceptance
  -> no DispatchRef exists for A
  -> candidate B
  -> DISPATCHED
  -> exactly one canonical DispatchRef
  -> remote result
  -> AcceptedExecutionReceipt
  -> Vince failover reconciliation
```

## Condições obrigatórias

Vince só produz `arca.vince-pathfinder-failover-proof.v0.2` quando:

- existem exatamente duas tentativas no ensaio controlado;
- a primeira tem `outcome=TRANSIENT_FAILURE`;
- a primeira não possui `DispatchRef`;
- a segunda tem `outcome=DISPATCHED`;
- a segunda possui o único `DispatchRef`;
- o `DispatchRef` é o mesmo usado no resultado;
- o executor aceito é o segundo executor;
- o resultado passa o verificador canônico;
- nenhum executor é repetido;
- nenhum trust/authority/core mutation é alterado.

Qualquer ambiguidade falha fechada.

## O que não autoriza failover

- falha permanente;
- rejeição de política;
- rejeição de integridade;
- hash/schema/identidade inválidos;
- tentativa que já recebeu `DispatchRef`;
- resultado incerto após aceitação;
- duplicação de dispatch.

## Live Probe 002

Issue: #112.

O ensaio força:

1. `github-arca-linux` indisponível no modelo local da missão;
2. Satellite A como primeiro candidato;
3. falha transitória sintética no adaptador de A antes de escrever na fila;
4. Satellite B como próximo candidato elegível;
5. execução real somente em B;
6. retorno e verificação pelo control plane.

Critério de sucesso final:

- `failover_safe=true`;
- `duplicate_dispatch_detected=false`;
- `accepted_executor_id=github-satellite-b-linux`;
- `authority_expanded=false`;
- `core_mutation_performed=false`;
- `trust_modified=false`.

Esta prova é V3 **limitada a falha pré-aceitação**. Não equivale ainda a recovery após crash no meio de uma execução aceita.
