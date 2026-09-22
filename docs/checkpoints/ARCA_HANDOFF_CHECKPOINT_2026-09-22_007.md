# ARCA — Checkpoint 007: M3 em validação

Data: 2026-09-22. Estado: PR #81 aberta; integração e CI pós-merge pendentes. Base `main`: `52add0e`; branch: `feat/multisource-correlated-offline-m3`. M2 já integrado na PR #79. Edge Steward #78 permanece draft e congelado.

## Resultado implementado na PR #81

O gate offline M3 une envelopes PNCP, pagamento e relações pagamento→empenho à correlação M2. O vínculo usa apenas evidências coletadas no mesmo ciclo; falta de endpoint falha fechado. A fixture sintética cobre AC, AL e AM (AL indisponível), 11 envelopes, 2 lacunas, 8 relações vinculadas, quatro estados de correlação, dois agentes, verificação adversarial e fila `HUMAN_REVIEW`. Pedidos humanos e wake do observador convergem na fila canônica. Rede e publicação continuam bloqueadas. O resultado não comprova despesa real ou irregularidade.

## Falha e correção do teste

CI pré-correção [35691849173](https://github.com/uknwplayer/ARCA/actions/runs/35691849173): 885/886. O teste em `tests/multisource-correlated-offline-m3.test.mjs` alterava `payments[0].documentCode`, mas apenas `commitmentImpacts[0].paymentDocumentCode`; o pagamento afeta dois empenhos. O próprio M2 lançava `ARCA_FINANCIAL_CORRELATION_IMPACT_PAYMENT_NOT_FOUND` antes de o gate M3 verificar os envelopes. Agora o teste atualiza todos os impactos que apontavam para o código original e mantém o pagamento ausente da coleta M3. A produção permanece inalterada.

## Evidência local após correção

- `node --test tests/multisource-correlated-offline-m3.test.mjs`: 8/8 PASS;
- `npm run validate:multisource-correlated`: PASS, digest `ba124bc5394581d36286e12db03dcdb1ff3e057f503b407c20120e1c0eb8fbf6`;
- `npm run validate:financial-correlation`: PASS, digest `27dfca7e04f3068fda3446254378a9ecfb13dd074ce0932eedf2bacba54e36a0`;
- `npm run validate:multisource`: PASS; digests M0 `29678dca8d120012ad5183c209a8c48b836893a81d9b223a54a8efa96e0f2af2` e M1 `d33af20d7382df409032ecac0d94e24f97bd1ab6e04b02d55d05856182281bf9`;
- `npm run check:public`: PASS, zero violações;
- `npm test` local em Node 24.19.0: 885/886; falha isolada em `tests/creator-passkey-console.test.mjs:80`, `UND_ERR_SOCKET`. A CI da PR usa Node 22.18.0; nenhum aceite integral é alegado antes dela.

## Retomada para chat comum

1. Consultar [PR #81](https://github.com/uknwplayer/ARCA/pull/81), seu HEAD e a execução de CI posterior à correção; não confundir com CI 35691849173, que é pré-correção.
2. Confirmar 886/886 Node no Node 22.18, testes Python, validadores M0/M1/M2/M3, fronteira pública e preview; se algum gate falhar, ler o job e corrigir antes de mesclar.
3. Integrar M3 após CI verde, conferir CI pós-merge e criar checkpoint final com commit, PR, runs e hashes efetivos; atualizar CURRENT, roadmap e matriz de status se mudar maturidade.
4. Somente então planejar M4 com autorização e orçamento explícitos para rede. Primeiro PNCP e Portal separados, sem correlação live no primeiro acesso; confirmar custódia privada antes de classificar. Não ativar publicação ou Edge Steward.

Condição de parada: vínculo sem envelope correspondente, fonte indisponível convertida em suspeita, dado sintético apresentado como real, rede ou publicação não autorizada, teste ou CI vermelho.
