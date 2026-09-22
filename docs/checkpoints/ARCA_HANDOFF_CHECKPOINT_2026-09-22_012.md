# ARCA — Checkpoint 012: M4b em revisão de contrato

Data: 2026-09-22. Base canônica `main`: `9224471ea4b3d3bbad5ebd2888a5862f6fe66f11` (M4a integrado e checkpoint 011). Este checkpoint documenta pesquisa e proposta de desenho M4b. **Nenhum código de transporte, GET Portal, segredo ou dado live foi adicionado.**

## O que foi apurado

- O Swagger UI oficial lista `GET /api-de-dados/despesas/empenhos-impactados`, identificado como consulta de empenhos impactados por documento/fase. O cadastro oficial exige token entregue ao e-mail da conta Gov.br.
- Após a revisão inicial, o criador aprovou o desenho e enviou captura da operação oficial expandida: query obrigatória `codigoDocumento` (string), `fase` (int32: 2 liquidação, **3 pagamento**) e `pagina` (int32, default 1); respostas documentadas 200, 400, 401 e 500. Os [exemplos oficiais da API](https://portaldatransparencia.gov.br/pagina-interna/603579-api-de-dados-exemplos-de-uso) indicam cabeçalho `chave-api-dados`. O exemplo 200 mostra campos de empenho e valores, mas não autoriza assumir cardinalidade/schema completo nem interpretar uma captura live.
- O [desenho M4b aprovado](../superpowers/specs/2026-09-22-m4b-portal-contract-design.md) registra o contrato visível e os limites; o [plano de implementação M4b](../superpowers/plans/2026-09-22-m4b-portal-controlled-probe.md) foi redigido para revisão, sem código de transporte nem GET.

## Retomada operacional

1. Ler checkpoint 011, desenho M4 original e proposta M4b; verificar `main` atual e CI posterior a `9224471`.
2. Usar a captura oficial recebida para `codigoDocumento`, `fase=3`, `pagina=1` e os exemplos oficiais para `chave-api-dados`; se o JSON completo do Swagger puder ser obtido posteriormente, conferir schema/cardinalidade sem bloquear o transporte bruto seguro.
3. Revisar o plano M4b com TDD para transporte falso, cofre privado e workflow manual. Somente após CI e manifesto real, buscar autorização específica para **um** GET.
4. Preservar PNCP nacional sem município default, Edge Steward #78 congelado, análise/correlação/publicação desligadas no primeiro ciclo Portal. Uma resposta vazia não implica ausência de pagamento ou irregularidade.

Para verificar a base: `git fetch origin main`, `git log -1 origin/main`, `npm run check:public`, `node --test tests/m4-controlled-scope.test.mjs tests/durable-private-custody.test.mjs`. Validadores mais amplos e CI são exigidos quando código M4b existir.
