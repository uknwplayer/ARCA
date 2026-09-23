# ARCA — Checkpoint 021: Vince Pathfinder Live Proof 001

Data: **2026-09-23**.

Estado: **VINCE V0.1 CANÔNICO; DISCOVERY/ROUTING + ACK + RESULTADO REMOTO VERIFICADO EM ROTA SATÉLITE; EDGE STEWARD CONTINUA CONGELADO**.

Main de entrada: `88dc533b98c9358389702470f780895dcbb8f975`.

PR: #110.

CI da PR após correção: `35807843070` — success.

CI pós-merge: `35807923092` — success.

Live probe control-plane: `35808000764` — success.

Live probe satellite: `35808010876` — success.

Prova detalhada: [ARCA_VINCE_PATHFINDER_LIVE_PROOF_001.md](../ARCA_VINCE_PATHFINDER_LIVE_PROOF_001.md).

## Resultado

Vince executou sua primeira missão real limitada sobre a infraestrutura existente:

1. construiu envelope de missão vinculado ao checkpoint;
2. descobriu duas rotas Linux admitidas após modelar o executor canônico como indisponível;
3. ranqueou as rotas pela política existente do Executor Mesh;
4. selecionou `github-satellite-linux`;
5. recebeu `QUEUE_ACCEPTED` sem confundir ACK com execução;
6. aguardou o executor remoto;
7. recebeu um `AcceptedExecutionReceipt`;
8. reconciliou o resultado como `VERIFIED_RESULT`;
9. produziu prova final hashada;
10. manteve `authority_expanded=false`, `core_mutation_performed=false` e `trust_modified=false`.

Hashes principais:

- mission: `ca604343c5c95d1504486ae701697ace46154c44e794ac195d87f955244ea35d`
- dispatch commit: `e17545caad5452a2422a769a5709666dbe76d641`
- result: `8bf486057f1906a25077f5830abaeb910047761ecd3b7723c47846ab726862f9`
- accepted receipt: `09bb5f27bb88aa867e3661ea1859defaec21443cbf89eb54a6ee96e8f371dc2d`
- final Vince proof: `8c6e997af467980169e24f82c9ce06c78d8f5e76b62e3e16e0ce16661fe74e95`

## Interpretação correta

V1/V2 estão live-proven **somente para discovery baseado no registry canônico e rota de executor satélite já allowlisted/admitida**.

Isso não prova descoberta geral de agentes externos nem V3/V4.

## Próximo passo Vince

O próximo teste recomendado é **V3 controlado**:

- criar missão com checkpoint durável;
- induzir falha transitória antes de aceitação em Satellite A;
- fazer Vince reconciliar evidência;
- somente quando a falha for segura para failover, selecionar Satellite B;
- provar ausência de duplicação;
- produzir uma única prova final reconciliada.

Não executar esse teste automaticamente por este checkpoint.

## Núcleo investigativo

Portal permanece no estado do checkpoint 020: três GETs retornaram 401 e nenhum quarto GET está autorizado. O teste Vince não alterou M4/M5.

Edge Steward continua congelado.
