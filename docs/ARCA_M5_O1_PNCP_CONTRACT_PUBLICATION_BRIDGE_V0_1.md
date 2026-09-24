# ARCA — M5-O1: ponte PNCP por contratos publicados

Data de decisão: **2026-09-24**.

Estado: **PLANO + GATE OFFLINE EM IMPLEMENTAÇÃO; SEM NOVO GET NESTA ENTREGA**.

## Por que esta rota

O M5-N1 encerrou a trilha de itens para as duas contratações atuais com 9 itens válidos e zero `temResultado=true`. Em vez de trocar a amostra apenas para encontrar uma contratação com resultado, o M5-O1 preserva as duas contratações já custodiais e procura o vínculo contratual em outra superfície pública oficial do PNCP.

A API pública de consultas do PNCP documenta:

`GET /api/consulta/v1/contratos`

com consulta de contratos/empenhos por período de publicação e filtro opcional por CNPJ do órgão. O Manual de Integração vigente também documenta que registros de contrato/empenho possuem o vínculo `numeroControlePNCPCompra` e campos de fornecedor como `niFornecedor` e `nomeRazaoSocialFornecedor`.

Referências oficiais:

- Manual PNCP API Consultas, serviço "Consultar Contratos por Data de Publicação";
- Manual de Integração PNCP v2.6, seções 13.9 e 13.10.

## Regra de seleção

Para cada contratação PNCP normalizada já existente:

1. manter o CNPJ do órgão e a data de publicação;
2. abrir janela determinística de até 180 dias a partir da publicação, limitada pela data `asOf`;
3. consultar somente `pagina=1` nesta fase;
4. agrupar consultas HTTP idênticas para não repetir GET;
5. preservar os números de controle privados e expor publicamente somente hashes.

O primeiro estágio não afirma cobertura completa quando houver mais páginas. Ausência de match na primeira página é apenas `NOT_OBSERVED_IN_CURRENT_PAGE_BUDGET`.

## Ponte forte

Um registro de contrato só pode ser associado a uma contratação atual quando:

`contrato.numeroControlePNCPCompra === contratacao.numeroControlePNCP`

após normalização de formato definida no parser futuro.

Nome, valor, proximidade temporal ou similaridade textual isolados nunca confirmam identidade.

Depois do match exato, `niFornecedor` pode preencher a dimensão de fornecedor que faltou no M5-L. O nome do fornecedor é contexto, não chave suficiente.

## Budgets

- 1 ou 2 GETs no primeiro estágio, conforme deduplicação;
- zero retries;
- timeout 30 s;
- até 1 MiB por resposta;
- apenas página 1 nesta fase.

## Custo e autorização

A superfície é consulta pública GET do PNCP e está classificada como `NO_MONETARY_CHARGE_OBSERVED`.

Pela política transversal vigente, esse GET não exige aprovação humana monetária. Entretanto, esta entrega **não implementa transporte live**: `sourceNetworkAuthorized=false` e `newPncpGetAuthorized=false` permanecem fechados até o transporte, custódia-before-observation e observador offline serem implementados/testados.

## Próximo passo

Implementar M5-O1B:

`plan privado → preflight → GET controlado → seal/persist → observação estrutural offline → parser → exact numeroControlePNCPCompra match → fornecedor privado`

A ordem obrigatória permanece:

`GET → seal → durable persist → observation`.

Somente depois de prova offline do match exato o ARCA poderá recalcular a prontidão para correlação. Publicação e correlação continuam desligadas.
