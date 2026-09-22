# ARCA — Checkpoint 012: M4b em revisão de contrato

Data: 2026-09-22. Base canônica `main`: `9224471ea4b3d3bbad5ebd2888a5862f6fe66f11` (M4a integrado e checkpoint 011). Este checkpoint documenta pesquisa e proposta de desenho M4b. **Nenhum código de transporte, GET Portal, segredo ou dado live foi adicionado.**

## O que foi apurado

- O Swagger UI oficial lista `GET /api-de-dados/despesas/empenhos-impactados`, identificado como consulta de empenhos impactados por documento/fase. O cadastro oficial exige token entregue ao e-mail da conta Gov.br.
- Não foi possível obter o detalhe da operação OpenAPI para confirmar nomes/tipos de parâmetros, representação da fase de pagamento, paginação e schema de resposta. `curl` ao OpenAPI expirou; a busca apresentou o índice oficial mas não o JSON da operação. Um catálogo de terceiros fornece exemplo de URL, porém metadados inconsistentes impedem adotá-lo como fonte canônica.
- O [desenho M4b para revisão](../superpowers/specs/2026-09-22-m4b-portal-contract-design.md) registra as opções, controles e a decisão de falhar fechado até validar a operação oficial. Este arquivo é proposta; ainda não existe plano de implementação M4b aprovado.

## Retomada operacional

1. Ler checkpoint 011, desenho M4 original e proposta M4b; verificar `main` atual e CI posterior a `9224471`.
2. Recuperar no Swagger oficial `/v3/api-docs` o objeto da operação `/api-de-dados/despesas/empenhos-impactados` sem fazer GET a dados. Registrar método, parâmetros, required/type, enum de fase, cabeçalho de autenticação, paginação e schema; guardar URL/data/digest do contrato.
3. Se o Swagger continuar inacessível, solicitar somente uma cópia da seção documental oficial, sem token, código documental privado ou dados pessoais. Não inventar valores de fase/headers ou testar endpoint real como substituto de contrato.
4. Apresentar o desenho para revisão; após aprovação, escrever plano M4b com TDD para transporte falso, cofre privado e workflow manual. Somente após CI e manifesto real, buscar autorização específica para **um** GET.
5. Preservar PNCP nacional sem município default, Edge Steward #78 congelado, análise/correlação/publicação desligadas no primeiro ciclo Portal. Uma resposta vazia não implica ausência de pagamento ou irregularidade.

Para verificar a base: `git fetch origin main`, `git log -1 origin/main`, `npm run check:public`, `node --test tests/m4-controlled-scope.test.mjs tests/durable-private-custody.test.mjs`. Validadores mais amplos e CI são exigidos quando código M4b existir.
