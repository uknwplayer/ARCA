# ARCA — Checkpoint 065: M5-O1 escolhido e gate offline aberto no PR #212

Data: **2026-09-24**.

Estado: **M5-N1 ENCERRADO PARA AS DUAS CONTRATAÇÕES ATUAIS; NOVA ROTA M5-O1 ESCOLHIDA SEM TROCAR A AMOSTRA; PLANO/GATE OFFLINE IMPLEMENTADO NO PR #212; ZERO NOVO GET; REDE, PUBLICAÇÃO E CORRELAÇÃO FAIL-CLOSED**.

## Base confirmada

CI pós-merge do checkpoint 064:

https://github.com/uknwplayer/ARCA/actions/runs/36062330387

Resultado: **success**.

M5-N1 permanece:

- 9 itens válidos;
- 0 com `temResultado=true`;
- `coverageComplete=true`;
- M5-N2 não aplicável aos nove itens.

## Decisão de direção

Entre ampliar a amostra e abrir outra ponte pública, foi escolhida a segunda opção.

Razão metodológica: ampliar a amostra especificamente para encontrar `temResultado=true` criaria risco de selecionar um caso pela conveniência do resultado. M5-O1 preserva as duas contratações já custodiais e procura um vínculo documental independente.

## M5-O1

PR:

https://github.com/uknwplayer/ARCA/pull/212

Superfície planejada:

`GET /api/consulta/v1/contratos`

Filtros do primeiro estágio:

- CNPJ do órgão da contratação já normalizada;
- janela a partir da data de publicação;
- até 180 dias;
- data final limitada por `asOf`;
- `pagina=1`;
- consultas HTTP idênticas deduplicadas.

Budgets:

- 1 ou 2 GETs futuros, conforme deduplicação;
- zero retries;
- 30 s;
- 1 MiB por resposta;
- somente página 1 no primeiro estágio.

## Regra de evidência

Ponte forte somente quando:

`contrato.numeroControlePNCPCompra === contratacao.numeroControlePNCP`

Nome, valor, data e similaridade textual isolados não confirmam identidade.

Depois do match exato, o fornecedor do contrato poderá preencher a dimensão ausente do M5-L. O nome do fornecedor é contexto; o identificador do fornecedor é tratado privadamente.

Ausência de match na página 1 não prova inexistência do contrato.

## Política de custo

O GET público é classificado como `NO_MONETARY_CHARGE_OBSERVED`, portanto não exige autorização humana monetária.

Ainda assim, o PR #212 não abre rede:

- `sourceNetworkAuthorized=false`;
- `newPncpGetAuthorized=false`;
- transporte live não implementado;
- publication/correlation desligadas.

## Próximo passo

1. concluir CI do PR #212;
2. mesclar se verde;
3. implementar M5-O1B:
   - transporte GET-only allowlisted;
   - preflight hash-bound;
   - custody-before-observation;
   - observação estrutural offline;
   - parser de contratos;
   - match exato de `numeroControlePNCPCompra`;
   - saída sanitizada por hashes/contagens;
4. somente depois gerar candidato live.

Nenhum novo GET foi executado neste checkpoint.

Checkpoint anterior: [064](ARCA_HANDOFF_CHECKPOINT_2026-09-24_064.md).
