# ARCA — Vince Pathfinder Live Proof 001

Status: **VERIFIED / rota satélite pública limitada**.

Data: **2026-09-23**.

## Controle

- ARCA canonical commit: `88dc533b98c9358389702470f780895dcbb8f975`
- PR de implementação: #110
- issue one-shot: #109 — fechada após a prova
- control-plane run: `35808000764` — success
- satélite: `uknwplayer/arca-execution-satellite`
- satellite run: `35808010876` — success

## Missão

- mission id: `vince-live-001`
- profile: `smoke`
- target: Linux
- public-only: true
- secrets allowed: false
- core mutation allowed: false
- trust modify allowed: false
- merge allowed: false
- arbitrary shell allowed: false
- human review required: true
- mission SHA-256: `ca604343c5c95d1504486ae701697ace46154c44e794ac195d87f955244ea35d`
- checkpoint SHA-256: `37bacd174bc21be91535d9966b466a35fb7f8ebc50445fcaff43b97af6533808`

## Discovery e seleção

O probe modelou `github-arca-linux` como indisponível somente dentro da missão para provar fallback.

Rotas elegíveis observadas:

1. `github-satellite-linux`
   - execution domain: `arca-execution-satellite`
   - trust: `VERIFIED`
   - admission: `LAB_ADMITTED`
   - network hops: 1
   - score: 11300
2. `github-satellite-b-linux`
   - execution domain: `arca-execution-satellite-b`
   - trust: `VERIFIED`
   - admission: `LAB_ADMITTED`
   - network hops: 2
   - score: 22310

Vince selecionou a primeira rota. A descoberta não alterou trust nem admission.

## ACK

- selected executor: `github-satellite-linux`
- dispatch/correlation commit: `e17545caad5452a2422a769a5709666dbe76d641`
- ACK: `QUEUE_ACCEPTED`
- estado imediatamente após ACK: `PENDING`
- ACK proof SHA-256: `b8cb5dea002731ea2dfdb5775a92c3549659b82a95a01fa60c3e8a906d4105e9`

O ACK foi tratado explicitamente como diferente de execução concluída.

## Execução remota

O commit de dispatch acionou no satélite o run `35808010876`.

O satélite validou contrato, resolveu exatamente um request, executou o perfil `smoke`, gerou hash e publicou um único artefato.

- request file: `queue/requests/vince-live-001.json`
- request SHA-256: `bfc0823f703ac05cfa8b4c5645a8bc7567cee97501af7010a1138bb3d2d461ac`
- semantic result SHA-256: `8bf486057f1906a25077f5830abaeb910047761ecd3b7723c47846ab726862f9`
- result file SHA-256: `9d35791f32674f01296b83fa760c8b71347c36b237d193c7bbc4b69977e07247`
- satellite artifact id: `10727979488`
- satellite artifact ZIP SHA-256: `0ac0dfba0a78f19ddb5620c3571d2db7a0f20c3c7691661281e236c1c8a0d2f6`

## Retorno e reconciliação

O control plane recebeu e verificou o resultado pelo Executor Mesh.

- final execution state: `VERIFIED_RESULT`
- accepted receipt SHA-256: `09bb5f27bb88aa867e3661ea1859defaec21443cbf89eb54a6ee96e8f371dc2d`
- final Vince proof SHA-256: `8c6e997af467980169e24f82c9ce06c78d8f5e76b62e3e16e0ce16661fe74e95`
- Vince artifact id: `10728387683`
- Vince artifact ZIP SHA-256: `e5ea71da01f997f07bd22cab66ac853f42f949c0f16e3522547fe8861d552c3b`

Recomputação independente do `mission_sha256`, ACK `proof_sha256` e final `proof_sha256` coincidiu com o artefato.

## Autoridade

A prova final registra:

- `authority_expanded=false`
- `core_mutation_performed=false`
- `trust_modified=false`

Portanto o teste não promoveu confiança, não alterou o Core e não concedeu nova autoridade ao Vince.

## O que foi provado

Nesta rota específica e allowlisted:

```text
registry-backed discovery
        -> capability/policy ranking
        -> route selection
        -> queue ACK
        -> remote execution
        -> accepted receipt
        -> reconciled proof
```

Isso valida o núcleo V0.1 e fornece prova live limitada para as fases V1/V2 do roadmap.

## O que não foi provado

Ainda não declarar:

- descoberta arbitrária de agentes na internet;
- V3 recovery/failover reconciliado pelo Vince;
- recuperação após executor morrer no meio da missão;
- V4 generalizado entre ambientes independentes;
- integração live com ChatGPT Work;
- presença 24/7;
- Edge Steward;
- autoridade de merge, trust ou mutação investigativa.

O Edge Steward continua congelado.
