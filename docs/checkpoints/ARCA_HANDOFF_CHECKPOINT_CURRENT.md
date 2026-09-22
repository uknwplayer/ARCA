# ARCA — Handoff checkpoint atual

Checkpoint: **2026-09-22 / M4b verificado em CI Node 22.18; merge e GET real pendentes**

Estado: **M4a integrado à `main`; M4b concluído e com CI canônica verde na PR #88; método M5-R documentado; nenhuma execução live**
Âncora canônica M4a: `d36df26a45d736f1fdc605721426b3a8b228d4ba`

Handoff mais recente: [checkpoint 014 — M4b verificado em CI](ARCA_HANDOFF_CHECKPOINT_2026-09-22_014.md). PR #88 @ `8fff8e7f9b8ec46ee5eef7a959006e78d57644ab`; CI canônica Node 22.18 run `35795775111` verde. Nenhum workflow live foi disparado e nenhum GET real foi autorizado ou executado. O próximo gate é revisão final e integração canônica; autorização live continua separada.

Decisão M5-R: [checkpoint 012](ARCA_HANDOFF_CHECKPOINT_2026-09-22_012.md)
Método normativo: [`ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md`](../ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md)

PR M4a: [#84](https://github.com/uknwplayer/ARCA/pull/84)
CI da PR: [35745211122](https://github.com/uknwplayer/ARCA/actions/runs/35745211122)
CI pós-merge: [35745354987](https://github.com/uknwplayer/ARCA/actions/runs/35745354987)
Handoff detalhado: [checkpoint 011](ARCA_HANDOFF_CHECKPOINT_2026-09-22_011.md). O checkpoint 010 registra o estado anterior à integração.

PR M3: [#81](https://github.com/uknwplayer/ARCA/pull/81)
CI da PR: [35695562784](https://github.com/uknwplayer/ARCA/actions/runs/35695562784)
CI pós-merge: [35695672043](https://github.com/uknwplayer/ARCA/actions/runs/35695672043)

PR M2: [#79](https://github.com/uknwplayer/ARCA/pull/79)  
CI da PR: [35690853847](https://github.com/uknwplayer/ARCA/actions/runs/35690853847)  
CI pós-merge: [35690990372](https://github.com/uknwplayer/ARCA/actions/runs/35690990372)

## Retomada imediata

O método de investigação pública V0.1 foi formalizado e o roadmap recebeu o marco dependente `M5-R — Public Investigation & Referral Dossier`. O fluxo aprovado separa natureza econômica dos valores, normaliza estornos e duplicidades, preserva proveniência e contraprovas, registra o fim legal da trilha como `PUBLIC_TRAIL_END` e exige revisão humana antes de qualquer exportação ou encaminhamento. `PUBLIC_TRAIL_END` é lacuna probatória, nunca indício de culpa. Esta entrega é documental: schema, validador, renderer, exportação e protocolo M5-R ainda não existem. M5-R depende do aceite de M5. O gate imediato de M4b é revisão do branch e CI Node 22.18, conforme checkpoint 013. Ler também o checkpoint 012 e o método V0.1.

M4a: `src/investigation/m4-controlled-scope.mjs` valida manifesto de exatamente uma fonte (`PNCP` ou `PORTAL`), confirmação exata, revisão, parâmetros obrigatórios e budgets; o código do documento Portal vira somente hash no manifesto, que mantém `networkAuthorizedForThisManifest:false`. O backend de custódia privada aceita o esquema de prova Portal com restrições de segurança e `proofSchema` exclusivo; o recibo PNCP mantém formato antigo. PR #84 e CI Node 22.18 permaneceram verdes. M4b adiciona transporte, captura e workflow manual no branch indicado no topo, sem prova Portal real nem autorização de GET. Ver checkpoint 013 para resultados locais e limites; ver o [checkpoint 011](ARCA_HANDOFF_CHECKPOINT_2026-09-22_011.md) e desenho M4 para contexto histórico.

Preparação M4: ler `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` e o [checkpoint 009](ARCA_HANDOFF_CHECKPOINT_2026-09-22_009.md). O desenho prioriza a reutilização do PNCP durável já provado e planeja uma consulta pontual independente da API do Portal para avançar a fonte financeira, com token privado, documento explícito, teto de bytes, fake fetch e custódia durável antes de qualquer GET real. Nenhum código de documento, segredo ou novo acesso à rede foi definido/executado neste ciclo. A execução live exige manifesto concreto e autorização explícita posterior. M4a não comprova dado real novo. Edge Steward segue congelado.

M3 foi integrado em `d10d851` após corrigir o teste de correlação não coletada. O CI da PR e o pós-merge passaram integralmente: 886/886 Node no Node 22.18, 27/27 Python, piloto investigativo, validadores multifonte M0/M1, financeiro M2, correlacionado M3 e verificação pública. A fixture M3 produziu 11 envelopes, 2 lacunas, 8 relações vinculadas, 2 agentes, verificação adversarial e `HUMAN_REVIEW`; rede e publicação desligadas. Ler o [checkpoint final M3](ARCA_HANDOFF_CHECKPOINT_2026-09-22_008.md), o histórico pré-merge 007 e `docs/ARCA_MULTISOURCE_CORRELATED_OFFLINE_M3.md`. Próximo marco M4: primeiro acesso live de uma fonte por vez, apenas após pré-registro de escopo, cofre durável, autorização explícita para rede e limites; não iniciar aquisição live por inferência. Edge Steward #78 permanece draft e congelado.

O M2 implementou o núcleo offline de correlação entre contratação PNCP e execução financeira, sem rede e sem publicação. O M3 integrou o correlator M2 ao piloto multifonte com três UFs, orçamento fixo, dois agentes independentes, verificação adversarial e fila de revisão humana.

Ler primeiro:

1. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_012.md`;
2. `docs/ARCA_PUBLIC_INVESTIGATION_REFERRAL_METHOD_V0_1.md`;
3. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_011.md`;
4. `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`;
5. `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md`;
6. `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_008.md` para histórico M3;
7. `docs/ARCA_STATUS_MATRIX_0_4_0_RC1.md`.

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

M4b está implementado na PR #88 e a CI canônica Node 22.18 está verde; aguarda revisão final e integração canônica. Depois, pré-registrar um probe de **uma fonte por vez** com documento, limite de registros, timeout, zero retries e cofre privado. Exigir autorização explícita para aquele GET antes de usar rede. Validar custódia antes de classificar; não correlacionar fontes no primeiro acesso. Manter publicação desligada. Ver checkpoint 013 para o gate atual e checkpoint 011 para as condições de parada.

## Instruções de retomada para um chat com contexto limitado

Consultar a PR #88, o checkpoint 014 e a CI `35795775111`. Se #88 ainda não estiver integrada, esse é o gate imediato. Nenhum GET Portal deve ser executado por inferência.

Executar:

```bash
npm ci
node --test tests/multisource-correlated-offline-m3.test.mjs
node --test tests/financial-correlation-offline.test.mjs
node --test tests/m4-controlled-scope.test.mjs tests/durable-private-custody.test.mjs
npm run validate:multisource-correlated
npm run validate:financial-correlation
npm run validate:multisource
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
```

Nunca ativar rede, classificador, ingresso ou publicação por inferência. Todo avanço live exige gate explícito e escopo limitado.
