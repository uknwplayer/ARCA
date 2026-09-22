# ARCA — Checkpoint 008: M3 integrado

Data: 2026-09-22. Estado: **M3 concluído e integrado à `main`**. PR [#81](https://github.com/uknwplayer/ARCA/pull/81); commit canônico `d10d8516ec05c8e1c8378159ed6459da966a61fb`. CI da PR [35695562784](https://github.com/uknwplayer/ARCA/actions/runs/35695562784) e CI pós-merge [35695672043](https://github.com/uknwplayer/ARCA/actions/runs/35695672043) concluídos com sucesso. O checkpoint histórico 007 descreve a correção do teste antes do merge.

## Prova entregue

O gate offline unifica PNCP, pagamentos sintéticos, empenhos impactados sintéticos e correlação M2. Cada relação deve estar vinculada aos envelopes coletados no mesmo ciclo; correlação sem suporte falha fechado. A fixture de AC/AL/AM produz 11 envelopes, 2 lacunas explícitas de fonte, 4 relações pagamento→empenho, 4 relações com PNCP e 8 vínculos de evidência. Há exatamente um `CONFIRMED`, um `CANDIDATE`, um `CONFLICTING` e um `NOT_OBSERVED`; esses estados não são achados de irregularidade. Dois agentes independentes passam pela verificação adversarial e encerram em `HUMAN_REVIEW`. Pedidos humanos e wake do observador são deduplicados na mesma investigação. Rede desligada; publicação desligada.

Digests estáveis: relatório M3 `ba124bc5394581d36286e12db03dcdb1ff3e057f503b407c20120e1c0eb8fbf6`; relatório de correlação `05de1ffef8b72a7c5e7b68edd908541bd8966d84db3fcedfecbb9e6d414b18c1`; vínculo de evidências `56fa8652da66ba5ee3d597847d4242e5b2a6ef42ff76bfe08090c4153f892dd5`. Digests de regressão M0 `29678dca8d120012ad5183c209a8c48b836893a81d9b223a54a8efa96e0f2af2` e M1 `d33af20d7382df409032ecac0d94e24f97bd1ab6e04b02d55d05856182281bf9` permaneceram estáveis.

## Validação remota

Node 22.18: 886/886 testes. Python executor mesh: 27/27. Piloto investigativo e validadores M0/M1/M2/M3: PASS. Fronteira pública: PASS; preview da PR aprovado. O CI pós-merge omite preview por configuração, mas executa os demais gates. A suíte local em Node 24 terminou 885/886 por `creator-passkey-console.test.mjs:80`, `UND_ERR_SOCKET`, enquanto o runtime CI exigido passou 886/886.

## Limites e próximos passos

Não houve captura de CSV oficial do Portal, consulta financeira live, prova de ligação real PNCP↔empenho, correlação real, operação nacional contínua, acusação ou publicação. O Edge Steward permanece congelado na PR #78 em draft.

M4 é o próximo marco **condicionado**: preparar autorização explícita e limitada para rede; pré-registrar uma fonte, uma UF, janela, página, teto de registros, timeout e retries; confirmar cofre privado durável; executar PNCP e Portal separadamente e validar custódia antes de classificar. Primeira leitura live não correlaciona fontes. Não habilitar publicação. Se escopo, custódia, segredo ou limite falhar, encerrar sem novos acessos.

## Retomada com contexto limitado

1. Confirmar `main` em `d10d851` ou sucessor e ler `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`, `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`, `docs/ARCA_MULTISOURCE_CORRELATED_OFFLINE_M3.md` e a matriz RC1.
2. Reproduzir offline: `node --test tests/multisource-correlated-offline-m3.test.mjs`, `npm run validate:multisource-correlated`, `npm run validate:financial-correlation`, `npm run validate:multisource`, `npm run check:public`.
3. Para M4, primeiro especificar o probe com orçamento e condições de parada; adquirir autorização explícita para rede antes de qualquer comando live. Registrar todos os resultados, inclusive não selecionados e lacunas, e fechar com checkpoint novo.
