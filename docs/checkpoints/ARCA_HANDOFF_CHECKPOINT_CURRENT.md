# ARCA — Handoff checkpoint atual

Checkpoint: **2026-09-22 / Gate correlacionado offline M3 em validação**

Estado: **M2 concluído e integrado à `main`; M3 na PR #81, CI de correção pendente**
Âncora canônica após M2: `bb006433f21a622aea4aaf618b728a19e4c327f5`

PR M2: [#79](https://github.com/uknwplayer/ARCA/pull/79)  
CI da PR: [35690853847](https://github.com/uknwplayer/ARCA/actions/runs/35690853847)  
CI pós-merge: [35690990372](https://github.com/uknwplayer/ARCA/actions/runs/35690990372)

## Retomada imediata

M3 em [PR #81](https://github.com/uknwplayer/ARCA/pull/81), branch `feat/multisource-correlated-offline-m3` (base canônica `52add0e`). Antes da correção do teste, [CI 35691849173](https://github.com/uknwplayer/ARCA/actions/runs/35691849173) registrou 885/886 testes Node: o teste `tampered or unrelated correlation cannot enter the M3 evidence graph` criava um pagamento com código alterado, mas atualizava só o primeiro dos dois empenhos impactados; o correlator rejeitava a fixture internamente inválida antes do gate M3. A correção atualiza todos os vínculos do pagamento, preservando a validade interna e testando a recusa do gate quando o pagamento não foi coletado. Testes focais M3: 8/8; validadores M3, M2 e M0/M1: PASS; `check:public`: zero violações. A suíte local Node 24: 885/886, com a falha preexistente `creator-passkey-console.test.mjs` (`UND_ERR_SOCKET`); aguardar CI no Node 22.18 para aceitar a PR. Ler o [checkpoint M3 em validação](ARCA_HANDOFF_CHECKPOINT_2026-09-22_007.md) e `docs/ARCA_MULTISOURCE_CORRELATED_OFFLINE_M3.md`. M4 não inicia antes de M3 integrado e CI pós-merge verde. Edge Steward continua congelado na PR #78.

O M2 implementou o núcleo offline de correlação entre contratação PNCP e execução financeira, sem rede e sem publicação. O próximo marco é **M3 — Gate offline multifonte completo**: integrar o correlator M2 ao piloto multifonte já existente, com três UFs, orçamento fixo, dois agentes independentes, verificação adversarial e fila de revisão humana.

Ler primeiro:

1. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_006.md`;
2. `docs/ARCA_FINANCIAL_CORRELATION_OFFLINE_M2.md`;
3. `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`;
4. `docs/ARCA_STATUS_MATRIX_0_4_0_RC1.md`.

## Resultado entregue no M2

Foi adicionado `src/investigation/financial-correlation-offline.mjs` com:

- identificadores canônicos hash-only para órgão e fornecedor;
- namespaces controlados para CNPJ/SIAFI e fixtures;
- relação pagamento → empenho com cardinalidade um-para-muitos;
- relação empenho ↔ contratação em quatro estados:
  - `CONFIRMED`;
  - `CANDIDATE`;
  - `CONFLICTING`;
  - `NOT_OBSERVED`;
- proveniência por vínculo e contraprova preservada;
- diferença temporal e explicações alternativas;
- relatório determinístico e sanitizado;
- bloqueio explícito de rede e publicação.

Fixture M2:

`examples/multisource-offline-fixtures/financial-correlation-m2-v1.json`

Validador:

`npm run validate:financial-correlation`

Resultado pós-merge:

- 878/878 testes Node;
- 27/27 testes Python da malha executora;
- piloto investigativo controlado: PASS;
- Gate Offline Multifonte V1: PASS;
- Gate de correlação financeira M2: PASS;
- `check:public`: sem violações;
- rede usada: `false`;
- publicação tentada: `false`.

Digest do relatório M2:

`27dfca7e04f3068fda3446254378a9ecfb13dd074ce0932eedf2bacba54e36a0`

Digest da fixture M2:

`3355887e5c538a1fa15b2193da2b1076949d21efbf52e3549055c4459fb4b35e`

A prova sintética contém 3 pagamentos, 4 relações pagamento→empenho, 4 contratações e 2 pontes fortes. Um pagamento afeta dois empenhos. O resultado contém exatamente um caso de cada estado de correlação.

## Invariantes confirmados

1. Nome ou valor isolado nunca confirma identidade.
2. Compatibilidade temporal nunca confirma causalidade ou identidade.
3. `NOT_OBSERVED` não significa desaparecimento, desvio ou irregularidade.
4. `CONFLICTING` preserva contraprova e exige resolução humana.
5. Mesmo `CONFIRMED` confirma somente o vínculo documental representado; não prova regularidade, entrega ou adequação de preço.
6. Identificadores brutos de fixture não aparecem no relatório M2.
7. Rede e publicação permanecem fail-closed.
8. Revisão humana continua obrigatória.

## Base multifonte preservada

M0 e M1 continuam válidos:

- `Public Source Adapter V1`;
- `Evidence Envelope V1`;
- registro das oito famílias oficiais;
- PNCP offline;
- Portal da Transparência offline em fixture;
- dois agentes independentes;
- verificação adversarial;
- fila em `HUMAN_REVIEW`;
- indisponibilidade de fonte não gera suspeita.

Ainda **não há CSV oficial capturado do Portal da Transparência** e nenhuma correlação M2 representa um pagamento ou contratação real.

## Edge Steward congelado

O trabalho paralelo **ARCA Edge Steward v0.1** permanece congelado no [PR #78](https://github.com/uknwplayer/ARCA/pull/78), em draft.

Decisão vigente: não implementar nem mesclar o Edge Steward antes de o núcleo investigativo estar funcional de verdade e online. O PR #78 serve apenas como documentação preservada e não faz parte do caminho crítico M3–M5.

## O que ainda não foi provado

Não existe ainda prova completa:

`PNCP live → execução financeira live → correlação → classificador → fila → investigação multiagente → verificação adversarial → revisão humana`.

Também não existem serviço 24/7, SLOs, telemetria de produção, precisão/recall real, interface comunitária madura, rotação formal de segredos ou armazenamento WORM/Object Lock.

Não alegar:

- pagamento real observado pelo M2;
- dinheiro desaparecido;
- irregularidade;
- cobertura nacional contínua;
- todos os municípios consultados;
- prontidão de produção;
- publicação autônoma.

## Próximo trabalho recomendado — M3

Executar **M3 — Gate offline multifonte completo**:

1. integrar PNCP + pagamento + empenhos impactados + correlator M2;
2. manter três UFs sem município default;
3. fixar orçamento de registros;
4. deduplicar solicitações humanas e observador;
5. executar dois agentes independentes;
6. executar verificação adversarial;
7. produzir métricas de `CONFIRMED/CANDIDATE/CONFLICTING/NOT_OBSERVED`;
8. enviar somente para `HUMAN_REVIEW`;
9. manter rede e publicação desligadas;
10. produzir relatório sanitizado determinístico.

M4 live só começa depois de M0–M3 verdes.

## Instruções de retomada para um chat com contexto limitado

Confirmar que `main` contém `bb006433f21a622aea4aaf618b728a19e4c327f5` ou sucessor e consultar PRs/Actions posteriores ao run `35690990372`.

Executar:

```bash
npm ci
node --test tests/financial-correlation-offline.test.mjs
npm run validate:financial-correlation
npm run validate:multisource
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
```

Nunca ativar rede, classificador, ingresso ou publicação por inferência. Todo avanço live exige gate explícito e escopo limitado.
