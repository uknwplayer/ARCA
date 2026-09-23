# ARCA — Vince Pathfinder Live Proof 002 — Controlled Failover A → B

Status: **VERIFIED / V3 LIMITADO A FALHA TRANSITÓRIA PRÉ-ACEITAÇÃO**.

Data: **2026-09-23**.

## Controle

- ARCA canonical commit: `071e2948a5a04887ea6ef94d8b9756992a88aa11`
- PR de implementação: #113
- issue one-shot: #112 — fechada após a prova
- control-plane run: `35809204841` — success
- Satellite A: `uknwplayer/arca-execution-satellite`
- Satellite B: `uknwplayer/arca-execution-satellite-b`
- Satellite B run: `35809214584` — success

## Missão

- mission id: `vince-live-002`
- profile: `smoke`
- target: Linux
- public-only: true
- secrets allowed: false
- core mutation allowed: false
- trust modify allowed: false
- merge allowed: false
- arbitrary shell allowed: false
- human review required: true
- mission SHA-256: `6ab18f634db74924f4f7fa100db0148ebd348b8934ff41349124b29bdee9dc04`
- checkpoint SHA-256: `94521acf13097909289e654a2f34bb52af8148fb2226d44ab66422436cbc8a11`

## Discovery

Com o executor canônico Linux modelado como indisponível, Vince observou duas rotas elegíveis:

1. `github-satellite-linux` — score 11300, 1 hop, VERIFIED/LAB_ADMITTED;
2. `github-satellite-b-linux` — score 22310, 2 hops, VERIFIED/LAB_ADMITTED.

A primeira rota era preferida pela política canônica.

## Falha controlada em A

A tentativa em Satellite A foi interceptada antes de qualquer escrita em fila:

- executor: `github-satellite-linux`;
- outcome: `TRANSIENT_FAILURE`;
- DispatchRef: ausente;
- motivo: falha transitória controlada pré-aceitação.

Nenhum run no Satellite A foi encontrado para o SHA de dispatch final.

## Failover para B

Somente após a falha segura em A, o Dispatcher avançou para B:

- executor: `github-satellite-b-linux`;
- outcome: `DISPATCHED`;
- único DispatchRef: `b02d88fc81c79883db85462183aec6163c564094`;
- ACK proof SHA-256: `88c0dfb0b23ce10b4bfc1d5706f8f4f929abc0387d7375541e9dbd2c35834b5c`.

Existe exatamente um run para esse SHA, no Satellite B: `35809214584`.

## Execução remota

Satellite B executou exatamente o request `queue/requests/vince-live-002.json`.

- request SHA-256: `eeee8a964df6940f826878b0a2add62e72d707090a8a7d6bcf10c2488834b124`
- result SHA-256 semântico: `62a6eb4a52cb717fde01a613823691583003d19ed6e91db06eb66c2b359c6e0f`
- execution-result.json SHA-256: `41a9bce760085597a14728103149e1aa76c779474bf0351415c9b6761a1718f1`
- artifact id: `10728764269`
- artifact ZIP SHA-256: `a8dec451bac425633f408de5f223e35c749391b254101be11714c27cd4af3071`
- checks: `python-runtime`, `filesystem-write`
- exit code: 0

## Reconciliação Vince

O control plane recebeu o resultado e produziu:

- execution state: `VERIFIED_RESULT`
- `failover_safe=true`
- `duplicate_dispatch_detected=false`
- accepted executor: `github-satellite-b-linux`
- accepted receipt SHA-256: `fe45f9f173a172e10597f777f059f6f1c4f3675d886ff76f8da5eac91dbca91a`
- final failover proof SHA-256: `4572b38db1e3f22dd9e32330a063fc24f1b5e4c611e8679f4b424fa0fc2743c1`
- Vince artifact id: `10729161332`
- Vince artifact ZIP SHA-256: `73e302f0633f9dcf93d528173ed98a8593ce43508e1a64bff6c7492594bf4cd6`

Recomputação independente confirmou mission hash, ACK proof, result hash, accepted receipt e failover proof.

## Autoridade

A prova final registra:

- `authority_expanded=false`
- `core_mutation_performed=false`
- `trust_modified=false`

## O que foi provado

Nesta condição controlada:

```text
A selected
 -> transient failure before acceptance
 -> no DispatchRef for A
 -> B selected
 -> one DispatchRef
 -> one remote execution
 -> one accepted receipt
 -> reconciled VERIFIED_RESULT
```

Isso prova um **V3 limitado**: failover seguro antes de aceitação, sem duplicação.

## O que não foi provado

Ainda não declarar recovery/failover automático quando:

- um executor já aceitou a missão;
- existe DispatchRef mas o estado remoto é incerto;
- o executor cai durante execução;
- há resultado parcial;
- existe ambiguidade entre timeout e execução real;
- é preciso reconstruir a missão de checkpoint após crash.

Esses casos exigem uma próxima etapa específica de reconciliação pós-aceitação e devem continuar fail-closed.
