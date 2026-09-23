# ARCA — Checkpoint 030: Vince V4.1.1 Durable Control-Plane Replay Proof

Data: **2026-09-23**.

Estado: **VINCE V4.1.1 LIVE-PROVEN; CHALLENGE ACEITO É DURÁVEL E REPLAY EM NOVO PROCESSO FALHA FECHADO; TERMUX NÃO FOI REEXECUTADO; EDGE STEWARD CONTINUA CONGELADO**.

## Entradas canônicas

- PR #134 — V4.1.1 durable challenge consumption
- commit #134: `384895a7174d1643b987eb124c60592e9a986499`
- CI pós-merge #134: `35831965058` — success
- PR #135 — gatilho read-only da prova de replay
- commit #135: `ed892ba47057f39608028a7032636c0a756802f5`
- CI pós-merge #135: `35832162156` — success
- replay proof run: `35832175245` — success
- replay proof job: `107087091665` — success
- durable registry bootstrap: `27cd38173566f5c45ccbd3673e196b6b5bcf6457`
- proof document: [ARCA_VINCE_V4_1_1_DURABLE_REPLAY_PROOF_007.md](../ARCA_VINCE_V4_1_1_DURABLE_REPLAY_PROOF_007.md)

## Resultado

O gap descrito no checkpoint 029 foi fechado.

Antes, o verificador live V4.1 usava `new Set()` e portanto lembrava challenges consumidos somente durante um processo. O V4.1.1 introduziu um registry durável no branch `vince-v41-termux-channel` e um fluxo de consumo com precondição pelo SHA atual do blob, seguido de read-after-write.

A prova read-only reutilizou deliberadamente a request/result já aceita da missão `vince-v41-termux-live-006` em um processo novo.

Resultado observado:

- `VINCE_V41_CHALLENGE_REPLAY`
- `DURABLE_REPLAY_REJECTED`
- `workerReexecuted:false`
- `registryDurable:true`

O job passou porque a rejeição era a condição de sucesso esperada.

## O que ficou provado

1. a aceitação do challenge sobrevive ao encerramento do processo verificador;
2. um verifier novo consulta o estado durável antes de aceitar a mesma prova;
3. replay da prova 006 falha fechado;
4. o worker Termux não é reexecutado para demonstrar replay;
5. a chave privada Ed25519 continua somente no Android;
6. a escrita do registry usa o blob SHA anterior como precondição de concorrência;
7. o status final de aceitação V4.1.1 depende de persistência e leitura de volta do registry.

## O que não mudou

- nenhum shell arbitrário;
- nenhum daemon;
- nenhum retry/failover automático;
- nenhuma autoridade de merge/main/trust/core concedida ao worker;
- nenhum acesso Portal/PNCP;
- Edge Steward permanece congelado.

## Decisão de sequência

**V4.1.1 está concluído.**

O próximo gate funcional do Vince passa a ser:

**V5 — endpoint availability/routing**.

Objetivo imediato: representar disponibilidade observada, freshness e ACK de endpoints antes do roteamento, sem transformar anúncio de capability em prova de disponibilidade.

ChatGPT Work continua endpoint candidato até existir trigger de evento e ACK canônico recente comprovados.

## Retomada

Ler, nesta ordem:

1. este checkpoint;
2. `docs/ARCA_VINCE_V4_1_1_DURABLE_REPLAY_PROOF_007.md`;
3. `docs/ARCA_VINCE_V4_1_1_DURABLE_CHALLENGE_CONSUMPTION.md`;
4. checkpoint 029 para a prova Termux Ed25519 original;
5. seção Vince do roadmap detalhado.

Próximo trabalho não deve reativar o Edge Steward por inferência.
