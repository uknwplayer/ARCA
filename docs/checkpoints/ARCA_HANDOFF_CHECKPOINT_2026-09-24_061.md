# ARCA — Checkpoint 061: autorização de GET passa a depender de custo monetário

Data: **2026-09-24**.

Estado: **POLÍTICA DE GET REDEFINIDA PELO OPERADOR; GET PÚBLICO SEM CUSTO MONETÁRIO NÃO EXIGE MAIS APROVAÇÃO HUMANA; GET PAGO CONTINUA EXIGINDO APROVAÇÃO; CUSTO DESCONHECIDO BLOQUEIA ATÉ CLASSIFICAÇÃO; M5-N1 REDUZIDO PARA `tamanhoPagina=10`; CANDIDATO 060 OBSOLETO; ZERO NOVO GET NESTE CHECKPOINT**.

## Decisão do operador

Regra anterior de pedir autorização humana para cada GET é substituída.

Nova política:

- GET sem custo monetário observado → execução controlada automática;
- GET com custo monetário → autorização humana obrigatória;
- custo desconhecido → classificar cobrança antes de executar, sem pedir autorização prematura.

A mudança vale para execuções futuras. Checkpoints históricos preservam as autorizações que eram exigidas no momento em que foram executados.

## Controles preservados

A remoção do gate humano por GET gratuito **não** remove:

- allowlist de host/path;
- limites de requests;
- zero retry quando definido;
- timeout/teto de bytes;
- custódia;
- hash binding;
- proteção de secrets;
- publicação bloqueada;
- correlação bloqueada;
- gates de escrita/mutação.

## PNCP

Consultas públicas do PNCP são classificadas como:

`NO_MONETARY_CHARGE_OBSERVED`

Base documental: Manual PNCP v2.6 informa que o Portal de consultas é público.

Logo:

`humanAuthorizationRequired=false`

`autoExecutionAllowed=true`

para GETs públicos que já passaram pelo contrato técnico da fonte.

## M5-N1

A hipótese de volume é tratada reduzindo:

`tamanhoPagina=50`

para:

`tamanhoPagina=10`

Sem mudar:

- 2 contratações;
- 2 GETs máximos;
- zero retries;
- `pagina=1`;
- sem resultados de item;
- sem publicação;
- sem correlação.

A regra de truncamento passa a considerar página cheia com 10 itens.

O candidato do checkpoint 060:

`13816eb8bd0582c0046018fffd652ddc425a2258cc0802453767dcf4f0bdd844`

fica **OBSOLETO** porque query, plan hash e target hashes mudaram.

## Próximo passo

CI → merge → novo preflight privado M5-N1.

Se o novo candidato confirmar:

- costClass sem cobrança monetária observada;
- `autoExecutionAllowed=true`;
- budgets válidos;
- revisão/hash bindings válidos;

o ARCA poderá disparar o live M5-N1 automaticamente, sem novo pedido de autorização humana.

Checkpoint anterior: [060](ARCA_HANDOFF_CHECKPOINT_2026-09-24_060.md).
