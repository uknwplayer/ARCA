# ARCA — Handoff checkpoint 2026-09-21 / 005: M1 integrado

Estado: **M1 concluído e integrado à `main`; CI pós-merge verde**.

Repositório canônico: `uknwplayer/ARCA`. Commit M1: [`68f2a0e86f60400b0a208c0b2c06599a1601f177`](https://github.com/uknwplayer/ARCA/commit/68f2a0e86f60400b0a208c0b2c06599a1601f177). PR [#76](https://github.com/uknwplayer/ARCA/pull/76). CI da PR [35649925658](https://github.com/uknwplayer/ARCA/actions/runs/35649925658) e CI pós-merge [35650058116](https://github.com/uknwplayer/ARCA/actions/runs/35650058116): **success**.

Checkpoint 004 preserva os resultados locais e o estado antes do merge. Este arquivo fecha a etapa e fornece o ponto de retomada após o CI remoto.

## O que está implementado

- fonte `br.portal-transparencia.download-despesas` ativa somente para `OFFLINE_FIXTURE`, junto ao PNCP offline; demais fontes declaradas;
- fixture sintética AC/AL/AM de linhas com colunas documentadas do arquivo federal de pagamento;
- normalização de órgão, favorecido, documento, período e centavos; bloqueio de campos extras, datas e valores inválidos e URL fora do catálogo oficial;
- envelopes V1 com hashes e lacunas; material da linha original/normalizada ausente do relatório;
- dois agentes distintos, verificação adversarial, fila em `HUMAN_REVIEW`;
- rede e publicação desligadas, ausência de UF convertida em lacuna, sem alegação adversa.

O catálogo público e o dicionário do Portal fundamentam o formato, mas nenhuma linha oficial foi capturada. A URL do envelope é do catálogo e **não identifica um pagamento real**. A UF do piloto é apenas uma partição sintética; o Portal federal não valida gasto daquela UF. Um pagamento pode se relacionar a vários empenhos, cujo vínculo não foi implementado em M1.

## Evidência de verificação

- 14/14 testes focais locais;
- Node 22.18 no CI da PR e pós-merge: suíte integral, piloto investigativo, adaptadores e fronteira pública verdes;
- Python 27/27 local; `npm run validate:multisource` e `npm run check:public` verdes;
- digest do relatório Portal `d33af20d7382df409032ecac0d94e24f97bd1ab6e04b02d55d05856182281bf9`;
- no Node 24 local: 866/867; falha de socket do teste Passkey antigo (`UND_ERR_SOCKET`). Não alterar M1 por esse comportamento de runtime sem investigação própria.

## Próximo trabalho: M2

Consultar `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md` para os marcos M2–M9. Começar pelo dicionário público do arquivo `Despesas_Pagamento_EmpenhosImpactados` e por fixtures sintéticas de relação um-para-muitos. Definir chaves fortes e referências por campo para cada vínculo com PNCP. Testar `CONFIRMED`, `CANDIDATE`, `CONFLICTING` e `NOT_OBSERVED`, com casos ambíguos, conflitantes e ausentes. Nenhuma equivalência por nome/valor isolado, nem interpretação de ausência como desaparecimento. M3 será o piloto conjunto offline de três UFs; consultas live são um gate posterior.

## Passos para um chat com contexto limitado

1. Abrir `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`, este checkpoint, `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`, `docs/ARCA_PORTAL_EXPENSES_OFFLINE_M1.md`, Documento Mestre v1.4.0 e matriz de estado.
2. Verificar `main` e PRs posteriores à #76, além de Actions posteriores à execução 35650058116; não presumir que a âncora continua HEAD.
3. Usar Node 22.18 e executar:

```bash
npm ci
node --test tests/multisource-offline-gate.test.mjs tests/portal-expenses-offline-adapter.test.mjs
npm run validate:multisource
npm test
PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v
PYTHONPATH=. python scripts/validate-investigative-roadmap.py
npm run check:public
```

4. Continuar M2 sem usar rede ou credencial, com dados sintéticos e revisão humana. Registrar decisões, testes, SHA, PR e CI no checkpoint 006 e atualizar CURRENT/roadmap após a entrega.

## Limites e condições de parada

Não alegar pagamento real, relação PNCP comprovada, gasto territorial, cobertura nacional contínua, irregularidade ou prontidão de produção. Parar diante de URL fora da origem oficial, hash divergente, campo pessoal inesperado, relação cruzada sem prova, falta transformada em suspeita, bypass de revisão ou tentativa de publicar.
