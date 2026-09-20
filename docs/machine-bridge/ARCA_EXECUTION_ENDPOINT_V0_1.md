# ARCA Execution Endpoint V0.1

**Status:** foundation implementation  
**Scope:** execution-endpoint discovery and bounded wake correlation  
**GitHub Actions:** not required

## Why this exists

ARCA already separates job semantics from transport. `Execution Endpoint V0.1` adds a layer above transport so local workers, ChatGPT Work and future agents can be described through the same capability-first surface without treating any one provider as the ARCA runtime.

An endpoint is not an authority grant. Registration, discovery or wake-up never grants trust, code-mutation authority, canonical-write authority or permission to bypass Machine Bridge action/capability policy.

```text
ARCA / Event Fabric
        |
        v
ExecutionEndpointRegistry
        |
        +-- local worker / filesystem
        +-- ChatGPT Work / native GitHub PR event trigger
        +-- future Mesh / HTTP / WASI adapters
```

## Contract

The registry exposes the logical operations:

- `discover`
- `capabilities`
- `wake`
- `claim`
- `heartbeat`
- `result`
- `ack`
- `handoff`

Adapters must explicitly declare which operations they implement. An undeclared operation fails closed. There is deliberately no generic `execute-arbitrary-code` operation.

`wakeExecutionEndpointForJob()` binds a validated Machine Bridge V3 job to a wake envelope using only:

- `requestId`;
- an opaque `taskRef` (`machine-bridge:<jobId>`);
- SHA-256 of the complete job;
- optional Event Fabric `eventId`;
- action name as a bounded reason.

The task payload/params are not copied into the wake stimulus.

## ChatGPT Work adapter

The first adapter formalizes the GitHub event-trigger surface that has been proven experimentally for ChatGPT Work.

It does **not** assume that ARCA can POST to an arbitrary ChatGPT HTTP endpoint. Instead it uses the supported event surface:

```text
Machine Bridge job already exists
        |
        v
ARCA writes correlation-only PROBE.md
on an isolated non-main PR branch
        |
        v
GitHub PR commit-update event
        |
        v
native ChatGPT Work event-triggered task wakes
        |
        v
WORK-WAKEUP-ACK comment can be observed
```

The adapter refuses `main` and `master`, requires an open PR whose head matches the configured repository/ref, and restricts the stimulus path to `experiments/work-wakeup/**` in V0.1.

No `repository_dispatch` is sent and GitHub Actions is not involved.

## Proven vs not yet proven

V0.1 treats the Work endpoint as:

- `wake`: supported;
- `heartbeat`: supported as validation of the configured GitHub trigger surface;
- `ack`: supported by observing a correlated `WORK-WAKEUP-ACK` PR comment;
- `claim`: not yet implemented for Work;
- `result`: supported as observation of one correlated `ARCA-WORK-RESULT-V1` terminal comment;
- `handoff`: not yet implemented for Work.

A result observation may be classified as `boundedCompletionEvidence:true` when the terminal status is `completed`, the Work result reports `signatureVerified:true`, and the safety assertions show no main mutation, merge or shell execution. It explicitly remains `trustedCompletion:false` because a GitHub comment does not cryptographically prove a distinct Work identity. Contradictory terminal comments fail closed.

The isolated dispatch experiment has now produced a signed safe completion with lifecycle `queued -> claimed -> running -> completed`. This proves the event-triggered Work surface can return a bounded terminal result without GitHub Actions. It does not yet promote the experimental Work-side signed-job verifier into canonical ARCA code, and it does not make Work a code-authority principal.

## Local / Termux usage

The CLI can be invoked by a local ARCA runtime without GitHub Actions:

```bash
export ARCA_GITHUB_TOKEN='...'
export ARCA_GITHUB_REPOSITORY='owner/repository'
export ARCA_WORK_WAKE_REF='isolated-work-wake-branch'
export ARCA_WORK_WAKE_PR='123'

npm run work:endpoint -- heartbeat
npm run work:endpoint -- wake --job ./job.json
npm run work:endpoint -- ack --wake-id <wake-id> --commit-sha <commit-sha>
npm run work:endpoint -- result --job-id <job-id> --request-id <request-id>
```

`ARCA_GITHUB_TOKEN` is host configuration and must never be committed. The endpoint descriptor rejects credential-like transport metadata fields so secrets cannot accidentally become discoverable endpoint state.

## Safety invariants

`wake != claim != execution != authority`.

A successful wake does not authorize source changes. The existing Creator Sovereignty Gate remains the authority boundary for code mutation. A timeout or missing ACK is also not proof of non-execution and must not be converted into automatic replay permission.
