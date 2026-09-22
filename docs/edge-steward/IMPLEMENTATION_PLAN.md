# ARCA Edge Steward — Plano de Implementação

## Método

Recomendado: execução Native, um plano por vez, com revisão após cada plano.

Motivo: contratos de autoridade, runtime móvel e recuperação precisam permanecer semanticamente alinhados.

A implementação deve seguir TDD: teste falha primeiro, implementação mínima, teste passa, suíte completa, revisão.

## Plano A — Contratos no ARCA Core

Objetivo: representar o Steward sem conceder execução genérica.

Criar contratos para:

- descriptor arca-edge-steward-v1;
- capabilities fechadas;
- teto computeCeilingPercent <= 45;
- networkMode outbound-only;
- receipt operacional limitado;
- validação fail-closed.

Capabilities permitidas inicialmente:

- heartbeat.publish;
- task.observe;
- execution.observe;
- workflow.status;
- event.append;
- local-task.execute.

Testes negativos obrigatórios:

- shell.arbitrary;
- repository.merge;
- main.write;
- trust.modify;
- campo secreto inesperado;
- adulteração de hash;
- timeout transformado indevidamente em retry.

Verificação:

- testes específicos;
- suíte completa;
- repository check;
- scan de segredos;
- somente draft PR;
- nenhum merge automático.

## Plano B — Runtime Móvel

Stack:

- Python 3.11+;
- SQLite;
- unittest;
- Kotlin/Android SDK;
- Termux.

Componentes:

- models;
- Resource Governor;
- SQLite cache;
- runtime state machine;
- local action registry;
- outbound client;
- CLI;
- helper Android;
- scripts Termux Boot/service.

### Resource Governor

Testar:

- tela ligada nega compute;
- lock >120 s + recursos seguros permite Tier 0;
- thermal desconhecido falha fechado;
- tier >45 é rejeitado;
- 45 só depois de validação explícita.

### Cache SQLite

Testar:

- restart;
- evento duplicado;
- ausência de secrets;
- estado local não autoritativo;
- corrupção não fabrica conclusão.

### State machine

Estados:

- USER_ACTIVE;
- IDLE_STABILIZING;
- OPPORTUNISTIC_COMPUTE;
- PREEMPTING.

Fluxo principal:

SCREEN_OFF -> estabilização -> compute

SCREEN_ON -> preempção -> USER_ACTIVE

### Actions locais iniciais

- crypto.sha256;
- json.validate;
- json.normalize;
- sqlite.integrity-check.

shell.exec deve ser rejeitado.

### Cliente outbound

Interface conceitual:

- observe_tasks;
- observe_execution;
- dispatch_allowlisted;
- append_receipt.

Regras:

- dispatch desconhecido rejeitado antes de HTTP;
- token não serializado;
- 429/500/network error -> exponential backoff;
- timeout remoto -> observação, não retry automático.

### Helper Android

Eventos:

- screen.on;
- screen.off;
- battery.snapshot;
- thermal.snapshot.

Sem INTERNET, sem token, sem chave ARCA e sem payload que vire shell livre.

## Plano C — Prova Integrada

Usar action sem side effect, preferencialmente worker.ping.

Artefato alvo:

arca-edge-steward-live-proof-v1

A prova deve conter:

- hash do descriptor;
- timeline tela/recursos;
- request/job/execution refs;
- dispatch receipt;
- resultado remoto;
- restart;
- reconciliação;
- dispatch count;
- negative action test;
- backoff observation;
- assertions finais.

### Teste lock/unlock

- Tier 0 = 15%;
- lock;
- >120 s;
- iniciar job chunkable;
- unlock;
- preemptar;
- checkpointar/parar;
- nenhuma atividade local depois do deadline.

### Teste dispatch

- observar uma tarefa;
- resolver allowlist;
- despachar uma vez;
- executar action sem side effect;
- observar conclusão;
- vincular receipt.

Negative test:

- shell.exec ou repository.merge;
- zero dispatch.

### Kill/restart

- despachar;
- matar Steward antes de observar conclusão;
- executor termina;
- reiniciar;
- reconstruir cache;
- consultar estado durável;
- reconciliar;
- confirmar dispatchCount == 1.

Se ambíguo: uncertain/reconcile, nunca retry automático.

### Perda de rede

- injetar/causar falha;
- observar backoff crescente;
- CPU quase ociosa entre tentativas;
- restaurar rede;
- retomar sem duplicação.

### Soak

Primeiro soak completo deve permanecer em 15%.

Registrar:

- restarts;
- lock/unlock;
- rede;
- bateria/térmica;
- compute local;
- dispatch count;
- duplicações;
- actions rejeitadas;
- lentidão percebida.

## Critério de conclusão v0.1

Somente após verificações frescas e proof bundle válido poderá ser afirmado:

> Um ARCA Edge Steward real em Android/Termux coordenou de forma outbound e limitada uma tarefa ARCA allowlisted e sem side effect, respeitou preempção por atividade do usuário, recuperou-se após interrupção do processo, reconciliou conclusão durável e não duplicou a execução no cenário testado.

Não extrapolar isso para confiabilidade universal 24/7, uso sustentado de 45% sem validação, execução remota arbitrária ou autoridade automática de merge.
