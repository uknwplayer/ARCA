# ARCA — Vince Live Proof 003 — Crash Recovery sem Redispatch

Status: **VERIFIED / V3.1 DURABLE RECOVERY**.

Data: **2026-09-23**.

## Controle

- ARCA canonical commit: `844f8035e94836078a4391a7c8ac5c2d3f3bf2fa`
- PR de implementação: #116
- issue one-shot: #115 — fechada após a prova
- control-plane workflow: `35810698274` — success
- dispatch job runner: `GitHub Actions 1000002335`
- recovery job runner: `GitHub Actions 1000002337`
- Satellite A run: `35810708455` — success
- Satellite B runs para o mesmo DispatchRef: **0**

## Fase 1 — dispatch-before-crash

A missão `vince-live-003` foi despachada exatamente uma vez para `github-satellite-linux`.

- DispatchRef/correlation: `96fdfcc7d83f4bdf8ef3c7e26dda7ac136674f43`
- dispatch state: `QUEUE_ACCEPTED`
- automatic retry allowed: `false`
- checkpoint record SHA-256: `b84299a422182a82bb9532697bc8083fb9b5a3ad01b5ac21de62f1be0f369282`
- mission SHA-256: `fa923e6cfc128962462e737e6e96617a2f170f6a90b84b0d8ee9ef5ab664d22d`
- job fingerprint: `8790b243580d966b18f7c48c755ed92c319c96b7f75e62ba244f50afbc5378e8`

O job terminou depois de publicar o checkpoint e **não coletou o resultado**.

## Fase 2 — recover-after-crash

Um segundo job iniciou em runner diferente, baixou somente o checkpoint e reconstruiu a observação do DispatchRef original.

O código de recovery não chama `ExecutorMeshDispatcher.dispatch()` nem `adapter.submit()`.

Resultado:

- remote state: `success`
- recovery state: `RECOVERED_VERIFIED_RESULT`
- network dispatch performed during recovery: `false`
- automatic retry performed: `false`
- failover authorized: `false`
- duplicate dispatch detected: `false`
- selected executor permaneceu `github-satellite-linux`

## Execução remota original

Existe exatamente um run no Satellite A para o DispatchRef:

- run: `35810708455`
- request: `vince-live-003`
- request SHA-256: `444d282071fb5abb2bb28ccde71e4ea8418c634f343e8e37fb394e6c2ca47393`
- result SHA-256 semântico: `8c986e5a4c8ca8c4a77a584128e52e3083eef6623a41bc5462cef3a95be874d9`
- execution-result.json SHA-256: `865175857abf8712f8e097a65c6a07f2221b4ed497e029c3619f77945aaba60d`
- satellite artifact id: `10729896743`
- satellite artifact ZIP digest: `sha256:995b9d6658912a25dddd3e8bc0ca7623b91f97fa84d115928287a1ec0b1d09c2`

Não existe run no Satellite B para `96fdfcc7d83f4bdf8ef3c7e26dda7ac136674f43`.

## Reconciliação

- accepted receipt SHA-256: `77df8c747984bb0e5411e626dbe203d4460629a2b607afb8df98d1892f3332ff`
- recovery proof SHA-256: `4bce8d380d1ca91ec34ef7e402be8769e59ee4dac88037d7bc469a908a399141`
- recovery proof file SHA-256: `e9fc30ea5f3ef6509cd632c81f2583b6a38ebd88fbd3039c6be7473728f8f45d`
- recovery artifact id: `10729443026`
- recovery artifact ZIP digest: `sha256:512d97cb89342ea4afb9bc81c8b8a169ce8ba97692b8a0d5ce73d401923c115c`

Recomputação independente confirmou:

1. checkpoint record hash;
2. mission hash;
3. job fingerprint;
4. semantic result hash;
5. accepted receipt hash;
6. recovery proof hash.

## Propriedade provada

```text
dispatch original
   -> durable checkpoint
   -> coordinator process ends
   -> fresh runner
   -> validate checkpoint
   -> query original DispatchRef
   -> recover original result
   -> verify
   -> no redispatch
```

Isso demonstra continuidade operacional reconstruída a partir de estado durável, não continuidade de memória/processo.

## Limites

A prova vale para um provider em que o DispatchRef e a evidência remota continuam observáveis.

Ainda não prova recuperação quando:

- o provider perde a própria evidência;
- existe efeito externo não idempotente sem consulta verificável;
- status remoto permanece indefinidamente incerto;
- há conflito entre duas fontes de evidência;
- é necessário trocar de provider após uma aceitação já possível.

Nesses casos Vince deve continuar fail-closed e não redispatchar por inferência.
