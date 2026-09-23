# ARCA — Checkpoint 023: Vince Crash Recovery Live Proof 003

Data: **2026-09-23**.

Estado: **VINCE V0.3 CANÔNICO; V3.1 LIVE-PROVEN PARA RECOVERY PÓS-CRASH A PARTIR DE DISPATCHREF DURÁVEL; ZERO REDISPATCH; EDGE STEWARD CONGELADO**.

Main de entrada: `844f8035e94836078a4391a7c8ac5c2d3f3bf2fa`.

PR: #116.

CI da PR final: `35810521079` — success.

CI pós-merge: `35810611664` — success.

Live control-plane: `35810698274` — success.

Live original Satellite A: `35810708455` — success.

Prova detalhada: [ARCA_VINCE_RECOVERY_LIVE_PROOF_003.md](../ARCA_VINCE_RECOVERY_LIVE_PROOF_003.md).

## Resultado

O primeiro job despachou `vince-live-003` para Satellite A, persistiu um checkpoint hash-sealed e terminou. Um segundo job em runner diferente reabriu esse checkpoint e recuperou o resultado pelo mesmo DispatchRef.

Não houve novo dispatch durante recovery:

- `network_dispatch_performed=false`;
- `automatic_retry_performed=false`;
- `failover_authorized=false`;
- `duplicate_dispatch_detected=false`.

Existe exatamente um run remoto em Satellite A e nenhum em Satellite B para o DispatchRef.

Hashes principais:

- checkpoint: `b84299a422182a82bb9532697bc8083fb9b5a3ad01b5ac21de62f1be0f369282`
- mission: `fa923e6cfc128962462e737e6e96617a2f170f6a90b84b0d8ee9ef5ab664d22d`
- job fingerprint: `8790b243580d966b18f7c48c755ed92c319c96b7f75e62ba244f50afbc5378e8`
- dispatch: `96fdfcc7d83f4bdf8ef3c7e26dda7ac136674f43`
- result: `8c986e5a4c8ca8c4a77a584128e52e3083eef6623a41bc5462cef3a95be874d9`
- accepted receipt: `77df8c747984bb0e5411e626dbe203d4460629a2b607afb8df98d1892f3332ff`
- recovery proof: `4bce8d380d1ca91ec34ef7e402be8769e59ee4dac88037d7bc469a908a399141`

## Interpretação correta

V3.1 está live-proven para perda do coordenador após um dispatch observável e recuperável. Timeout, ausência de evidência ou status remoto incerto continuam sem autorizar failover.

## Próximo passo Vince

O próximo marco lógico é **V4 — prova entre ambientes independentes**, reutilizando o mesmo envelope/checkpoint/retorno em uma rota que não seja apenas outra fila GitHub homogênea.

Antes disso, um hardening opcional V3.2 pode integrar o checkpoint V0.3 ao modelo assinado de Execution Identity/Reconciled Failover já existente no Machine Bridge.

Não iniciar Edge Steward por inferência.

## Núcleo investigativo

Portal permanece no checkpoint 020: três GETs 401, nenhum quarto GET autorizado. O trigger Portal que recebeu o comentário da issue #115 foi `skipped`; nenhum GET Portal ocorreu neste ciclo.

Edge Steward continua congelado.
