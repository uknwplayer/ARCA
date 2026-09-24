# ARCA — Checkpoint 064: observação offline M5-N1 validou 9 itens e zero resultados

Data: **2026-09-24**.

Estado: **CAPTURA M5-N1 200/200 PRESERVADA; OBSERVAÇÃO OFFLINE CONCLUÍDA COM ZERO SOURCE REQUESTS; 9 ITENS VÁLIDOS NO TOTAL; 0 ITENS COM `temResultado=true`; COBERTURA COMPLETA NAS DUAS CONTRATAÇÕES; M5-N2 BLOQUEADO POR AUSÊNCIA DE ITENS COM RESULTADO; NENHUM NOVO GET NECESSÁRIO**.

## Fonte custodial

Live de origem:

https://github.com/uknwplayer/ARCA/actions/runs/36051395397

Envelope:

`41110be726a598a2e620a55dc65d8fb4366fc04381182c264c641f322ebc3d4b`

Candidato:

`e13bb2cc94b85d599434f2287b4718f18b26136a6b6b2a97380e033e3568ecae`

Plano:

`ce700d1311b6471d9308386a39df700205190cba3413d723b91507688dede2eb`

## Observação offline

Run:

https://github.com/uknwplayer/ARCA/actions/runs/36052511200

Resultado:

- `sourceRequestCount=0`;
- `sourceNetworkUsed=false`;
- `totalItems=9`;
- `totalItemsWithResult=0`;
- `coverageComplete=true`;
- `m5n2PreparationAllowed=false`;
- `observationSha256=e4f1985833490a5676ab7183664bcf5653f295d8235598b6ad28e10ea6ff5a88`.

Contratação/alvo 1:

- `responseShape=BARE_ARRAY`;
- `itemCount=4`;
- `itemsWithResultCount=0`;
- `pagePossiblyTruncated=false`;
- `nextStageReady=false`.

Contratação/alvo 2:

- `responseShape=BARE_ARRAY`;
- `itemCount=5`;
- `itemsWithResultCount=0`;
- `pagePossiblyTruncated=false`;
- `nextStageReady=false`.

O hash do conjunto de itens com resultado é o hash canônico do array vazio nos dois alvos:

`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`

## Interpretação obrigatória

O fato observado é:

`NO_ITEM_RESULT_OBSERVED_IN_COMPLETE_FIRST_PAGE_COVERAGE`

Como ambas as páginas possuem menos de 10 itens, a regra de truncamento não foi acionada. A cobertura de itens dessas duas contratações é completa dentro do endpoint observado.

Não concluir a partir disso:

- que a contratação foi irregular;
- que não existe fornecedor por qualquer outra fonte;
- que não houve contratação, empenho ou pagamento;
- que o PNCP está incompleto em geral.

A conclusão restrita é somente: **nos nove itens retornados por essas duas contratações, nenhum item veio marcado com `temResultado=true`**.

## M5-N2

O M5-N2 consultaria resultados apenas de itens com `temResultado=true`.

Como a contagem é zero:

`M5_N2_NOT_APPLICABLE_FOR_CURRENT_TWO_PROCUREMENTS`

Nenhum GET de resultados deve ser produzido para esses nove itens.

## Próximo passo

O caminho investigativo deve procurar outra ponte pública oficial ou ampliar a amostra/contratações de forma controlada, em vez de consultar endpoints de resultado para itens que explicitamente não possuem resultado.

A política GET por custo continua vigente: GET público sem cobrança monetária observada pode avançar automaticamente sob gate técnico/budget; GET pago exige autorização humana; custo desconhecido bloqueia até classificação.

Checkpoint anterior: [063](ARCA_HANDOFF_CHECKPOINT_2026-09-24_063.md).
