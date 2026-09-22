# ARCA — Checkpoint 010: M4a offline em validação

Data: 2026-09-22. Base `main`: `f5705d6f72672c184d10c983f870a9a0d70efee4` (desenho M4 aprovado após PR #83). Estado: implementação local, PR/CI e integração pendentes. Edge Steward PR #78 segue congelada. **Nenhum GET PNCP/Portal foi executado por M4a.**

## Entrega

- Novo `src/investigation/m4-controlled-scope.mjs`: contrato de manifesto de uma fonte, com confirmação específica, revisão SHA, UF/data/modalidade ou documento Portal explícitos, page 1, retry 0, orçamentos máximos e digest estável. Rejeita campos extras, inclusive token; o documento bruto não aparece no manifesto; `networkAuthorizedForThisManifest:false` fixa a ausência de autorização live.
- `src/machine-bridge/durable-private-custody.mjs`: permite reconhecer somente o esquema futuro `arca.portal-controlled-live-probe.v0.1` além do PNCP já existente; exige flags de segurança para Portal, vínculo de envelope e recibo com `proofSchema`. Para PNCP a forma do recibo permanece inalterada. Este código **não** cria prova Portal nem efetua consulta.
- Plano `docs/superpowers/plans/2026-09-22-m4-preflight-and-custody.md` delimita o subconjunto offline e posterga transporte/GET até contrato oficial e escopo real confirmados.

## Provas locais

- Primeiro teste novo falhou por módulo ausente; depois 4/4 testes de manifesto passaram. Um caso de data impossível falhou corretamente em RED antes do ajuste de calendário.
- Teste Portal no recibo falhou por esquema não aceito; após o ajuste, 6/6 testes de custódia passaram, total focal 10/10.
- Validadores M0/M1/M2/M3: PASS; digests canônicos inalterados (M3 `ba124bc5394581d36286e12db03dcdb1ff3e057f503b407c20120e1c0eb8fbf6`). `npm run check:public`: PASS, zero violações.
- `npm test` local Node 24.19.0: 891/892; única falha `tests/creator-passkey-console.test.mjs:80`, `UND_ERR_SOCKET`, já observada em ciclos anteriores. Não declarar suíte integral verde antes do CI Node 22.18.

## Retomada e parada

1. Verificar PR/CI desta entrega no Node 22.18, testes Python e fronteira pública. Integrar e registrar CI pós-merge em checkpoint final.
2. Para M4b, obter contrato oficial exato do endpoint Portal antes de codificar URL/parâmetros; o Swagger não foi recuperado nesta sessão. Testar fake fetch, GET único, limite de resposta, zero retry, token fora de URL/log e custódia privada pré-validada.
3. Depois de implementar e revisar M4b, preparar manifesto com código de documento real, orçamento e revisão; só então obter autorização específica para uma chamada live. Captura não classifica, não correlaciona nem publica.
4. Encerrar sem novos acessos se contrato, autorização, orçamento, segredo, cofre ou custódia divergirem. Não tratar indisponibilidade como suspeita. PNCP nacional não usa município padrão.
