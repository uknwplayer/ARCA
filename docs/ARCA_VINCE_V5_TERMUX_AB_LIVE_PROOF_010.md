# ARCA — Vince V5 Termux A/B Live Proof 010

Status: **LIVE-PROVEN / ROUTE SELECTION + LOGICAL FAILOVER / NO DISPATCH**.

Data: **2026-09-23**. Gate pré-registrado na issue #143.

## Resultado

O Probe 010 provou, em execução real no Android/Termux, que o Vince V5 consegue verificar duas identidades independentes, admitir duas leases `READY` assinadas por Ed25519, selecionar a evidência válida mais recente e depois retirar A da elegibilidade a partir de uma lease `WITHDRAWN` assinada, passando a selecionar B.

Nenhuma missão foi despachada. O gate mediu disponibilidade, seleção e failover lógico de rota.

## Workers

Worker A:

- nodeId: `vince-termux-android-1`
- fingerprint: `c6e1853d99e52875bd7bf019237ea470f1dc166a345d0a359408e39e0ec120b1`
- pin: `config/vince-v4.1/trusted-workers/vince-termux-android-1.json`

Worker B:

- nodeId: `vince-termux-android-2`
- fingerprint: `52c4131a111f7aab509556af7efc574afe326898bd8ae75742882028742cacc0`
- pin integrado pela PR #146.

As private keys permaneceram locais no Termux.

## Fase 1 — A e B READY

B publicou primeiro:

- observedAt: `2026-09-23T09:17:15.057Z`
- presence SHA-256: `1e2358be85bb24547c30617bd328edce8a146232acc21fdb7553d85ae8c4182d`
- Git blob: `0045f57d93191635757f0682d22513e2d5012a70`

A publicou depois:

- observedAt: `2026-09-23T09:17:31.521Z`
- presence SHA-256: `c271d7214007ff0b2709f72873e91cc0c1a5f19e4b66a754dccb31fa8efd3acf`
- Git blob: `fd023ada1e074319e04d73b8a8f2adf0a0e377bc`

Seleção observada em `2026-09-23T09:19:36.274Z`:

- A: `AVAILABLE / CRYPTOGRAPHIC_READY_LEASE`
- B: `AVAILABLE / CRYPTOGRAPHIC_READY_LEASE`
- candidateCount: `2`
- eligibleCount: `2`
- selectedEndpointId: `vince-termux-android-1`
- dispatchPerformed: `false`

A venceu por possuir a evidência elegível mais recente.

## Fase 2 — A WITHDRAWN, B READY

A publicou uma retirada assinada:

- observedAt: `2026-09-23T09:21:06.166Z`
- state: `WITHDRAWN`
- presence SHA-256: `1333d57c5f6704bb7ac86cab8a6b2e469cc7e7798a4a4cf145224aa7537f9529`
- Git blob: `fd592275cf2e13ce2aa5642f13d3f67a5d0ac374`

Seleção observada em `2026-09-23T09:22:11.190Z`:

- A: `INCONCLUSIVE / SIGNED_PRESENCE_WITHDRAWN`
- A: `executionReady:false`, `routeEligible:false`
- B: `AVAILABLE / CRYPTOGRAPHIC_READY_LEASE`
- B: `executionReady:true`, `routeEligible:true`
- candidateCount: `2`
- eligibleCount: `1`
- selectedEndpointId: `vince-termux-android-2`
- dispatchPerformed: `false`

Portanto, a rota selecionada mudou de A para B sem missão duplicada porque nenhuma missão foi despachada neste gate.

## Invariantes de segurança observados

Nas duas seleções:

- `trustGranted:false`
- `codeMutation:false`
- `canonicalWrite:false`
- `executionAuthority:false`
- Work não foi usado;
- Replit não foi usado;
- GitHub Actions não foi executor;
- Edge Steward permaneceu congelado;
- nenhuma autoridade foi ampliada.

## O que foi provado

**Vince V5 consegue realizar seleção e failover lógico A→B entre duas identidades Termux Ed25519 pinadas, com presença assinada e freshness, sem depender de Work ou Replit.**

## O que não foi provado

Este resultado não prova:

- failover físico, pois A e B residem no mesmo Android;
- disponibilidade 24/7;
- daemon/serviço;
- despacho automático;
- execução da missão escolhida;
- tolerância à perda do aparelho;
- redundância entre dispositivos.

## Próximo gate funcional

O próximo teste do Vince pode combinar a seleção V5 já provada com a execução V4.1.1 já provada:

`seleção V5 → um único request git-status ao selecionado → resultado Ed25519 → verificação pinada → consumo durável → replay rejeitado`.

Esse gate deve continuar sem retry/failover automático até existir reconciliação explícita entre seleção, request e consumo.

Evidência estruturada: `artifacts/vince-v5-termux-ab-live-proof-010.json`.
