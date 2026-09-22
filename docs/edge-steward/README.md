# ARCA Edge Steward v0.1

## Status

Arquitetura aprovada. Implementação ainda não iniciada.

Data: 2026-09-22
Host alvo: Android + Termux
Custo adicional obrigatório: zero
Meta: presença operacional ARCA recuperável/ativável 24/7

## Objetivo

O ARCA Edge Steward transforma um celular Android sempre conectado em um nó leve de controle e, quando o aparelho estiver ocioso, em um worker oportunista limitado.

O telefone continua sendo dispositivo pessoal prioritário. O ARCA nunca deve disputar recursos com o usuário.

Princípio central:

> 24/7 significa capacidade de recuperar e continuar a missão, não a suposição de que um processo ficará vivo para sempre.

## Dois modos

### Tela ativa — Steward Mode

- heartbeat;
- observação de tarefas e execuções;
- recuperação e reconciliação;
- dispatch apenas por allowlist;
- consumo de CPU próximo de zero quando ocioso;
- sem processamento oportunista.

### Tela bloqueada/desligada — Opportunistic Compute

Após 120 segundos de estabilização:

- verificar bateria;
- verificar estado térmico;
- verificar memória;
- verificar se a tarefa é local-safe;
- permitir apenas processamento limitado e preemptável.

Validação progressiva:

- Tier 0: até 15%;
- Tier 1: até 25%;
- Tier 2: até 35%;
- Tier 3: até 45%.

45% é teto autorizado, nunca meta.

Desbloquear a tela preempta imediatamente processamento local.

## Resource Governor

Processamento local só pode começar quando todos os gates passam.

Política inicial de bateria:

- iniciar quando carregando; ou
- iniciar com bateria >= 60%;
- não aceitar nova tarefa abaixo de 50% fora da tomada;
- preemptar em <= 40% fora da tomada.

Política térmica:

- NONE/LIGHT: tier validado permitido;
- MODERATE: reduzir um tier;
- SEVERE ou superior: preemptar;
- telemetria indisponível: falhar fechado.

## Trabalhos locais permitidos inicialmente

- hashing;
- verificação de assinatura;
- validação de schema;
- normalização JSON/JSONL;
- deduplicação;
- parsing leve;
- pequenas consultas SQLite;
- manifests;
- verificações determinísticas de integridade.

Não permitidos por padrão:

- LLM local grande;
- OCR pesado;
- processamento pesado de imagem/vídeo;
- crawling agressivo;
- compilação pesada;
- shell arbitrário;
- comandos enviados livremente por agentes remotos.

## Rede

A arquitetura inicial é outbound-only.

O telefone inicia conexões para GitHub/APIs/endpoints aprovados. Não depende de IP público, porta aberta, port forwarding ou bypass de CGNAT.

## Estado e recuperação

SQLite local é somente cache operacional.

Estado canônico permanece no ARCA.

Após morte do processo ou reboot:

1. iniciar;
2. recuperar identidade;
3. ler cache local;
4. consultar estado durável do ARCA;
5. reconciliar;
6. continuar apenas pelas regras existentes.

Timeout ou ausência de observação nunca prova que uma execução remota não aconteceu.

## Fronteira de autoridade

O Steward poderá receber somente capabilities fechadas, como:

- heartbeat.publish;
- task.observe;
- execution.observe;
- workflow.status;
- workflow.dispatch de IDs allowlisted;
- event.append;
- local-task.execute de actions allowlisted.

Explicitamente proibido:

- repository.merge;
- repository.admin;
- main.write;
- trust.modify;
- identity.issue;
- evidence.delete;
- shell.arbitrary;
- secret.read;
- policy.widen.

Linguagem natural não amplia autoridade.

## Segurança

O helper Android:

- não guarda chaves;
- não guarda token GitHub;
- não recebe dados investigativos;
- idealmente não pede permissão INTERNET;
- apenas detecta estado de tela/recursos e sinaliza localmente o Termux.

Tasker pago não é dependência.

## Componentes ARCA reutilizados

O Edge Steward deve se apoiar em:

- Machine Bridge;
- Event Fabric;
- Autonomy Workflow;
- Worker/Capability Registration;
- Execution Identity;
- Remote Evidence Reconciliation;
- Reconciled Failover;
- Creator Sovereignty.

Não criar protocolo paralelo.

## Prova MVP exigida

A primeira prova real deve demonstrar:

1. início no Android/Termux;
2. identificação do Steward;
3. SCREEN_OFF inicia estabilização;
4. política permite Tier 0 quando seguro;
5. SCREEN_ON preempta;
6. observação de uma tarefa ARCA durável;
7. exatamente um dispatch allowlisted;
8. conclusão durável observada;
9. receipt operacional registrado;
10. processo morto/reiniciado;
11. estado reconstruído;
12. execução concluída não duplicada;
13. perda de rede gera backoff;
14. estado ambíguo não gera retry/failover duplicado;
15. action não autorizada falha fechado.

## Invariantes

- custo adicional obrigatório zero;
- prioridade do usuário;
- teto máximo 45%;
- outbound-only por padrão;
- estado canônico fora do telefone;
- sem shell arbitrário;
- sem merge/main/trust authority;
- sem segredos em payloads/logs;
- timeout não significa não execução;
- nenhum merge canônico sem autorização explícita de Guilherme.

Veja também:

- ROADMAP.md
- CHECKPOINT_CURRENT.md
- IMPLEMENTATION_PLAN.md
