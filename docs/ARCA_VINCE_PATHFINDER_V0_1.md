# ARCA — Vince Pathfinder V0.1

Status: **IMPLEMENTAÇÃO PARA TESTE CONTROLADO; SEM AUTORIDADE NOVA**.

## Papel

Vince é uma camada de descoberta e roteamento sobre mecanismos já existentes do ARCA. Ele não substitui o Executor Mesh, não concede confiança e não recebe shell, merge, `main.write` ou `trust.modify`.

Fluxo V0.1:

```text
mission envelope
      |
      v
discover admitted routes
      |
      v
rank by existing Executor Mesh policy
      |
      v
dispatch bounded public job
      |
      +--> QUEUE_ACCEPTED (ACK)
      |
      v
remote execution
      |
      v
accepted receipt
      |
      v
reconciled Vince proof
```

## Envelope mínimo

A missão V0.1 vincula:

- identidade lógica `vince`;
- `mission_id`;
- objetivo;
- SHA-256 do checkpoint corrente;
- profile e capabilities;
- permissões explícitas;
- prova requerida;
- rota de retorno;
- revisão humana obrigatória.

Permissões V0.1 são invariáveis:

- `public_only=true`;
- `secrets_allowed=false`;
- `core_mutation_allowed=false`;
- `trust_modify_allowed=false`;
- `merge_allowed=false`;
- `shell_arbitrary_allowed=false`.

## Descoberta

Vince reutiliza `CostAwareScheduler` e o `ExecutorRegistry`. Uma rota só aparece se já satisfizer:

- admission `LAB_ADMITTED` ou `ADMITTED`;
- trust mínimo `VERIFIED`;
- disponibilidade;
- capabilities;
- privacidade;
- política de secrets;
- orçamento.

Portanto, **discovery != trust != admission != execution authority**.

## ACK versus execução

O V0.1 registra estados separados:

- `QUEUE_ACCEPTED`: a fila aceitou o envelope e existe uma referência de dispatch;
- `PENDING`: isso ainda não prova execução;
- `VERIFIED_RESULT`: só depois de `AcceptedExecutionReceipt` criptograficamente/semanticamente verificado.

Isso preserva a regra:

`wake != claim != execution != authority`.

## Live Probe 001

Issue: #109.

O primeiro ensaio força `github-arca-linux` a indisponível no modelo local do probe para obrigar escolha de uma rota satélite já admitida.

Missão:

- `smoke`;
- Linux;
- somente dados públicos/sintéticos;
- sem segredos na missão;
- nenhum acesso a Portal/PNCP;
- nenhuma mutação do Core.

Sucesso exige:

`discovery -> satellite route -> queue ACK -> remote execution -> accepted receipt -> reconciled proof`.

Falha ou timeout produz estado inconclusivo/rejeitado, nunca elevação de trust.
