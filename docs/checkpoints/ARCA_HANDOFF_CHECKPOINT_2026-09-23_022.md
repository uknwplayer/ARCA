# ARCA — Checkpoint 022: Vince Controlled Failover Live Proof 002

Data: **2026-09-23**.

Estado: **VINCE V0.2 CANÔNICO; V3 LIMITADO LIVE-PROVEN PARA FALHA TRANSITÓRIA PRÉ-ACEITAÇÃO; SEM DUPLICAÇÃO; EDGE STEWARD CONGELADO**.

Main de entrada: `071e2948a5a04887ea6ef94d8b9756992a88aa11`.

PR: #113.

CI da PR: `35809060279` — success.

CI pós-merge: `35809139449` — success.

Live probe control-plane: `35809204841` — success.

Live probe Satellite B: `35809214584` — success.

Prova detalhada: [ARCA_VINCE_PATHFINDER_LIVE_PROOF_002.md](../ARCA_VINCE_PATHFINDER_LIVE_PROOF_002.md).

## Resultado

Vince realizou failover controlado A → B com as seguintes propriedades:

1. `github-satellite-linux` foi o primeiro candidato;
2. a tentativa A terminou em `TRANSIENT_FAILURE` antes de qualquer DispatchRef;
3. nenhum run foi criado em A para a missão;
4. `github-satellite-b-linux` recebeu o único DispatchRef;
5. B executou `vince-live-002` exatamente uma vez;
6. o resultado passou a verificação canônica;
7. o `AcceptedExecutionReceipt` foi vinculado a B;
8. Vince emitiu `failover_safe=true`;
9. `duplicate_dispatch_detected=false`;
10. nenhuma autoridade, trust ou estado canônico foi promovido.

Hashes principais:

- mission: `6ab18f634db74924f4f7fa100db0148ebd348b8934ff41349124b29bdee9dc04`
- dispatch B: `b02d88fc81c79883db85462183aec6163c564094`
- result: `62a6eb4a52cb717fde01a613823691583003d19ed6e91db06eb66c2b359c6e0f`
- accepted receipt: `fe45f9f173a172e10597f777f059f6f1c4f3675d886ff76f8da5eac91dbca91a`
- failover proof: `4572b38db1e3f22dd9e32330a063fc24f1b5e4c611e8679f4b424fa0fc2743c1`

## Interpretação correta

V3 está live-proven **apenas para falha transitória pré-aceitação**. Isso não autoriza retry/failover quando existe DispatchRef, aceitação ou incerteza de execução.

## Próximo passo Vince

Próximo gate recomendado: **V3.1 — recovery pós-crash/estado incerto sem reexecução**.

Objetivo:

- persistir checkpoint durável antes e depois de ACK;
- simular perda do processo coordenador;
- reconstruir estado a partir do checkpoint;
- consultar o executor já aceito;
- se houver execução possível/incerta, nunca despachar duplicata;
- aceitar resultado tardio se correlacionado;
- somente autorizar failover quando existir prova durável de não aceitação/não execução.

Não executar esse teste automaticamente por este checkpoint.

## Núcleo investigativo

Portal permanece no estado do checkpoint 020: três GETs retornaram 401 e nenhum quarto GET está autorizado.

Edge Steward continua congelado.
