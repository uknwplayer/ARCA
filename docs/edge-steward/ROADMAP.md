# ARCA Edge Steward — Roadmap

Data: 2026-09-22
Meta: presença ARCA 24/7, recuperável e sem custo adicional em Android/Termux.

## Fase 0 — Arquitetura e isolamento

Concluído:

- papel do Edge Steward definido;
- Steward Mode definido;
- Opportunistic Compute definido;
- 45% definido como teto;
- escada 15 -> 25 -> 35 -> 45 definida;
- outbound-only definido;
- merge/main/trust authority proibida;
- custo adicional zero definido;
- roadmap próprio criado;
- checkpoint próprio criado;
- arquitetura aprovada;
- planos de implementação elaborados;
- documentação persistida em branch dedicada do repositório ARCA.

Pendente:

- aprovação do plano de execução Native;
- início da implementação via TDD.

## Fase 1 — Steward Android observacional

Objetivo: provar execução leve sem autoridade de dispatch.

Entregas:

- runtime Termux;
- identidade persistente;
- SQLite operacional;
- heartbeat;
- helper Android gratuito/open-source;
- detecção lock/unlock;
- estabilização de 120 s;
- bateria/térmica;
- kill/restart;
- backoff;
- medição de consumo ocioso.

Sem dispatch e sem compute local nesta fase.

## Fase 2 — Dispatch remoto fechado

- allowlist de workflows/actions;
- credencial de mínimo privilégio;
- observar tarefa durável;
- dispatch único;
- observar resultado;
- registrar provenance receipt.

Continuam proibidos:

- shell arbitrário;
- workflow arbitrário;
- merge;
- main.write;
- alteração de trust/policy.

## Fase 3 — Recuperação e não duplicação

Injeções de falha:

- matar Steward após dispatch;
- reboot;
- queda de rede;
- resultado atrasado;
- erro transitório de API;
- mesma tarefa observada duas vezes;
- perda do cache local;
- estado remoto ambíguo.

Regra obrigatória:

> Timeout não prova não execução.

## Fase 4 — Worker oportunista Tier 0

Teto inicial: 15%.

Actions iniciais:

- hash;
- schema validation;
- signature verification;
- JSON normalization;
- SQLite pequeno;
- integrity checks.

## Fase 5 — Validação adaptativa

- [ ] 15% validado;
- [ ] 25% validado;
- [ ] 35% validado;
- [ ] 45% validado ou rejeitado para uso sustentado.

45% permanece teto mesmo que o dispositivo aguente mais.

## Fase 6 — Seleção local/remota

Política desejada:

tarefa local-safe + aparelho ocioso -> telefone

executor remoto gratuito disponível -> executor externo

nenhum disponível -> pendente durável

A seleção deve considerar capability, idempotência, recursos, trust e Execution Identity.

## Fase 7 — Soak 24/7

Testar:

- longos períodos bloqueado;
- muitos lock/unlock;
- troca de rede;
- carga/descarga;
- restrições Android;
- morte de processo;
- indisponibilidade de executor;
- múltiplas tarefas.

Sucesso: ARCA continua recuperável/ativável sem host pago permanente.

## Fase 8 — Candidato de produção

- componente/repositório dedicado se necessário;
- instalador;
- helper Android open-source;
- build reproduzível;
- Termux Boot/service;
- schema de configuração;
- threat model;
- revisão de segurança;
- atualização/rollback;
- relatório de saúde;
- proof bundle.

Nenhum merge canônico sem autorização explícita de Guilherme.
