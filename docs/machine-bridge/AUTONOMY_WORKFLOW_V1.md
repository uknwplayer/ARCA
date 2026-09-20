# Autonomy Workflow V1

## Objective

Autonomy Workflow V1 lets one authorized `requestId` advance through multiple pre-approved Machine Bridge capabilities while preserving durable state and re-entering Human Review whenever a step requires it.

The core path is:

`authorized wake -> workflow step -> Machine Bridge -> result -> Review Gate -> [next step | pause for Human Review | terminal stop]`

The same `requestId` is preserved across every workflow job. Each step gets its own deterministic `jobId`.

## Scope

V1 is intentionally sequential. It does not implement arbitrary DAG scheduling, dynamic code generation, shell execution, open network routing or self-modifying workflows.

A workflow contains 1–50 ordered steps. Each step references a recipe from the same closed Machine Bridge continuation recipe registry used by the one-shot continuation handler.

Default recipes remain limited to:

- worker ping/describe;
- fixed repository test/check;
- PNCP plan-only actions.

Public-network actions are not included by default.

## Durable workflow state

State is persisted under:

`ARCA_HOME/review-continuations/workflows/<requestId>.json`

Each record contains:

- immutable workflow definition hash;
- current cursor;
- state;
- ordered step descriptors;
- deterministic job IDs;
- per-step result hashes/status/gate state;
- last wake sequence;
- bounded error code;
- tamper-evident `recordHash`.

Raw Machine Bridge outputs are not copied into workflow state. Only status/hash references are retained.

## Step identity and recovery

Each step descriptor includes:

- `requestId`;
- `stepId`;
- `recipeId`;
- fixed Machine Bridge action;
- capability requirements;
- validated parameters.

The deterministic job ID is derived from that immutable descriptor. On recovery, the coordinator first asks the transport whether a durable result already exists for that job ID. It does not generate a new job ID after restart.

Before executing a persisted step, the runtime re-resolves the current trusted recipe and requires its action, capability requirements and normalized parameters to match the persisted descriptor. If source policy has changed since workflow registration, the step fails closed as `recipe-drift` instead of silently executing stale policy.

## Human Review behavior

A workflow begins only after its continuation intent is invoked by an authorized durable wake.

When a step completes technically, its result is passed through `ReviewGatedContinuation`.

If no new Human Review barrier is created and current policy remains authorized, the next step may execute immediately in the same runtime invocation.

If a step creates `humanReviewRequired`, the workflow persists that step as completed and changes to `awaiting-human-review`. The currently consumed wake is acknowledged. Later, when Human Review authorizes the same `requestId`, a new wake sequence is generated and the workflow resumes from the next step without replaying the completed one.

A paused workflow only re-enters `running` when the live Review Gate reports `authorizedToContinue=true`.

## Failure semantics

Transient transport/correlation failures do not advance the cursor. The workflow remains `running`, the current step stays `pending`, and the durable wake remains pending so a later recovery cycle may retry the same deterministic job.

A terminal Machine Bridge result whose technical status is not `completed` marks the current step and workflow `failed`. The consumed wake is acknowledged so the runtime does not loop indefinitely over a known terminal result.

A trusted-recipe mismatch is treated as a terminal policy failure rather than as a retryable transport problem.

## Security boundaries

Autonomy Workflow V1 does not:

- accept arbitrary Machine Bridge action names in workflow definitions;
- execute shell commands supplied by workflow state;
- enable public network access by default;
- accept secret-like parameters such as tokens/passwords/private keys;
- bypass Human Review;
- treat one approval as unlimited authority for later reviewable steps;
- bypass Machine Bridge Action Registry/capability checks;
- write directly to `main`;
- dynamically rewrite its own workflow definition at runtime.

Adding a new recipe or widening an existing recipe remains a source-code policy change subject to branch/PR/CI/review.

## Product effect

ARCA can now continue autonomously through several safe capabilities under one durable request instead of requiring one user interaction per step. Human Review becomes an interrupt in the state machine rather than the end of the process.

This is the first durable state-machine layer required for 24/7 operation.

## Next evolution

Future versions can add:

- DAG/dependency scheduling;
- capability-based step selection rather than fixed recipe ordering;
- bounded branch conditions over typed results;
- signed Mesh node selection and remote reasoning capabilities;
- workflow budgets/deadlines/hop limits;
- policy-class-based automatic vs review-gated transitions.

Those features should preserve the same principles: closed executable registries, durable correlation, bounded retries, explicit authority, and fail-closed behavior.
