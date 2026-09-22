# ARCA — Handoff checkpoint atual

Checkpoint: **2026-09-22 / M4a preflight e custódia offline; M3 integrado**

Estado: **M3 integrado à `main`; preparação M4a implementada localmente; PR/CI pendentes; sem execução live**
Âncora canônica após M3: `d10d8516ec05c8e1c8378159ed6459da966a61fb`

PR M3: [#81](https://github.com/uknwplayer/ARCA/pull/81)
CI da PR: [35695562784](https://github.com/uknwplayer/ARCA/actions/runs/35695562784)
CI pós-merge: [35695672043](https://github.com/uknwplayer/ARCA/actions/runs/35695672043)

PR M2: [#79](https://github.com/uknwplayer/ARCA/pull/79)  
CI da PR: [35690853847](https://github.com/uknwplayer/ARCA/actions/runs/35690853847)  
CI pós-merge: [35690990372](https://github.com/uknwplayer/ARCA/actions/runs/35690990372)

## Retomada imediata

M4a após aprovação do desenho: `src/investigation/m4-controlled-scope.mjs` valida manifesto de exatamente uma fonte (`PNCP` ou `PORTAL`), confirmação exata, revisão, parâmetros obrigatórios e budgets; o código do documento Portal vira somente hash no manifesto, que mantém `networkAuthorizedForThisManifest:false`. O backend de custódia privada agora aceita o esquema de prova Portal **somente como contrato**, com as mesmas restrições de segurança e `proofSchema` exclusivo no recibo Portal; o recibo PNCP mantém formato antigo. Há 10/10 testes focais e validadores M0–M3/verificação pública verdes localmente. A suíte local Node 24: 891/892 por falha conhecida Passkey `UND_ERR_SOCKET`; CI Node 22.18 pendente. Não há transporte Portal, workflow live, prova Portal real ou autorização de GET. Ler [checkpoint 010](ARCA_HANDOFF_CHECKPOINT_2026-09-22_010.md), desenho M4 e plano `docs/superpowers/plans/2026-09-22-m4-preflight-and-custody.md`. Não marcar M4 concluído; próximo gate é confirmar contrato oficial da API, implementar captura limitada e testar sem rede real.

Preparação M4: ler `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` e o [checkpoint 009](ARCA_HANDOFF_CHECKPOINT_2026-09-22_009.md). O desenho prioriza a reutilização do PNCP durável já provado e planeja uma consulta pontual independente da API do Portal para avançar a fonte financeira, com token privado, documento explícito, teto de bytes, fake fetch e custódia durável antes de qualquer GET real. Nenhum código de documento, segredo ou novo acesso à rede foi definido/executado neste ciclo. O desenho requer revisão antes da implementação; a execução live exige manifesto concreto e autorização explícita posterior. M3 permanece canônico no commit `d10d851`; M4 não comprova qualquer dado real novo. Edge Steward segue congelado.

M3 foi integrado em `d10d851` após corrigir o teste de correlação não coletada. O CI da PR e o pós-merge passaram integralmente: 886/886 Node no Node 22.18, 27/27 Python, piloto investigativo, validadores multifonte M0/M1, financeiro M2, correlacionado M3 e verificação pública. A fixture M3 produziu 11 envelopes, 2 lacunas, 8 relações vinculadas, 2 agentes, verificação adversarial e `HUMAN_REVIEW`; rede e publicação desligadas. Ler o [checkpoint final M3](ARCA_HANDOFF_CHECKPOINT_2026-09-22_008.md), o histórico pré-merge 007 e `docs/ARCA_MULTISOURCE_CORRELATED_OFFLINE_M3.md`. Próximo marco M4: primeiro acesso live de uma fonte por vez, apenas após pré-registro de escopo, cofre durável, autorização explícita para rede e limites; não iniciar aquisição live por inferência. Edge Steward #78 permanece draft e congelado.

O M2 implementou o núcleo offline de correlação entre contratação PNCP e execução financeira, sem rede e sem publicação. O M3 integrou o correlator M2 ao piloto multifonte com três UFs, orçamento fixo, dois agentes independentes, verificação adversarial e fila de revisão humana.

Ler primeiro:

1. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_008.md`;
2. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_006.md`;
3. `docs/ARCA_FINANCIAL_CORRELATION_OFFLINE_M2.md`;
4. `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`;
5. `docs/ARCA_STATUS_MATRIX_0_4_0_RC1.md`.

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

## Próximo trabalho recomendado — M4 condicionado

Planejar um probe live mínimo de **uma fonte por vez** com UF, janela, página, limite de registros, timeout, retries e cofre privado durável pré-registrados. Exigir autorização explícita antes de usar rede. Validar custódia antes de classificar; não correlacionar fontes no primeiro acesso. Manter publicação desligada. Ver o checkpoint 008 para condições de parada.

## Instruções de retomada para um chat com contexto limitado

Confirmar que `main` contém `d10d8516ec05c8e1c8378159ed6459da966a61fb` ou sucessor e consultar PRs/Actions posteriores ao run `35695672043`.

Executar:

```bash
npm ci
node --test tests/multisource-correlated-offline-m3.test.mjs
node --test tests/financial-correlation-offline.test.mjs
npm run validate:multisource-correlated
npm run validate:financial-correlation
npm run validate:multisource
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
```

Nunca ativar rede, classificador, ingresso ou publicação por inferência. Todo avanço live exige gate explícito e escopo limitado.
