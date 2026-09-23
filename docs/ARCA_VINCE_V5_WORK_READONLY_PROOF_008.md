# ARCA — Vince V5 Work Read-only Proof 008

Status: **LIVE-PROVEN / SURFACE REACHABLE / EXECUTOR AVAILABILITY INCONCLUSIVE**.

Data: **2026-09-23**.

## Controle

- V5 foundation PR: #137 — merged
- V5 foundation commit: `cc2a5c4893c1cc5182068e494448677fb3a1a18e`
- V5 foundation CI: `35832985503` — success
- V5 foundation post-merge CI: `35833122256` — success
- read-only probe PR: #139 — merged
- read-only probe commit: `1bc71d7cabc336d564c3f04e8b5ea8e1c97d120f`
- read-only probe CI: `35833238838` — success
- read-only probe post-merge CI: `35833345751` — success
- probe issue: #138
- live proof run: `35833356337` — success
- live proof job: `107090893357` — success

## Target

The observation targeted the existing isolated Work trigger surface:

- endpointId: `chatgpt-work`
- repository: `uknwplayer/ARCA`
- PR: #90
- head ref: `test/work-access-check-v2`
- capability queried for route selection: `reasoning`

No new wake stimulus was written.

## Observed heartbeat

Observed at:

`2026-09-23T07:45:14.974Z`

V5 classification:

- state: `INCONCLUSIVE`
- reason: `SURFACE_REACHABLE_EXECUTION_UNPROVEN`
- surfaceReachable: `true`
- wakeAcknowledged: `false`
- routeEligible: `false`

The underlying Work endpoint heartbeat reported that the configured GitHub PR surface was valid and reachable. It also reported:

- `workExecutionObserved:false`
- `executionObserved:false`

V5 deliberately refused to convert surface reachability into executor availability.

## Route selection

The registry contained one candidate for capability `reasoning`.

Result:

- route state: `INCONCLUSIVE`
- candidateCount: `1`
- eligibleCount: `0`
- selectedEndpointId: `null`
- dispatchPerformed: `false`

Therefore the live observation did **not** route work to ChatGPT Work.

## Safety proof

The emitted proof recorded:

- `wakePerformed:false`
- `ackQueried:false`
- `dispatchPerformed:false`
- `repositoryMutation:false`
- `termuxExecuted:false`
- `edgeStewardActivated:false`
- `authorityExpanded:false`

The V5 observation and route record also preserved:

- `trustGranted:false`
- `codeMutation:false`
- `canonicalWrite:false`
- `executionAuthority:false`

## Correct interpretation

This proof establishes:

```text
ExecutionEndpointRegistry candidate
  -> read-only heartbeat
  -> configured GitHub PR surface reachable
  -> no Work execution evidence
  -> Vince V5 INCONCLUSIVE
  -> route not eligible
  -> no dispatch
```

It does **not** establish that ChatGPT Work is unavailable.

It also does **not** establish that ChatGPT Work is currently available.

The absence of a correlated ACK remains missing evidence, not negative execution evidence.

## Next V5 gate

To promote the canonical Work endpoint to temporary `AVAILABLE`, V5 requires a recent correlated ACK produced by a bounded wake whose identity/correlation is known.

That future gate is separate because it would create a wake stimulus and may activate the external Work event task. The current proof intentionally stops before that boundary.
