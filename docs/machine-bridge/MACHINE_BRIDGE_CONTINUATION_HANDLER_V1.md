# Machine Bridge Continuation Handler V1

## Objective

This component is the first concrete bridge from an already-authorized Review Continuation wake to a real Machine Bridge execution.

The path is:

`Human Review -> authorized wake -> Continuation Dispatcher -> closed Machine Bridge recipe -> deterministic V3 job -> durable result -> Review Gate`

It does not turn the continuation pointer into an executable command. The executable behavior must already exist in two closed registries:

1. the Continuation Dispatcher handler registry;
2. the Machine Bridge continuation recipe registry, which maps a fixed recipe ID to a fixed Machine Bridge action/capability set.

## Default closed recipes

V1 ships with deliberately narrow recipes:

- `mb.worker.ping` -> `worker.ping`;
- `mb.worker.describe` -> `worker.describe`;
- `mb.repository.test` -> `repository.test`;
- `mb.repository.check` -> `repository.check`;
- `mb.pncp.plan` -> `pncp.plan`;
- `mb.pncp.discovery-plan` -> `pncp.discovery-plan`.

No public-network execution recipe is enabled by default. Repository recipes accept no arbitrary command parameters; they invoke the fixed commands already implemented by the Machine Bridge Action Registry. PNCP plan recipes reject attempts to enable network access.

Unknown recipes fail closed.

## Durable plan

`MachineBridgeContinuationPlanStore` persists one immutable execution descriptor per `requestId` under:

`ARCA_HOME/review-continuations/machine-bridge-plans/<requestId>.json`

A plan contains:

- `requestId`;
- closed `recipeId`;
- fixed action and capability requirements;
- bounded JSON parameters after recipe validation;
- deterministic `jobId`;
- descriptor hash;
- execution status/result hash/gate state;
- tamper-evident `recordHash`.

Raw credentials and secret-like parameter keys are rejected. Private keys are never part of the plan.

The deterministic job ID is derived from the immutable descriptor. This lets a recovering process ask the transport for an existing durable result before attempting to submit again.

## Registration

The coordinator registers the dispatcher intent using the fixed handler:

`machine-bridge.resume-once`

and binds it to:

- `contextRef = mbplan.<requestId>`;
- `contextHash = plan.descriptorHash`.

The handler refuses a divergent reference/hash.

## Recoverable execution

The coordinator uses a recoverable Machine Bridge client interface:

- `transport.getResult(jobId)`;
- `submit(job)`;
- `waitForResult(job)`.

Execution order:

1. check whether a durable result already exists for the deterministic job ID;
2. if not, submit the fixed V3 job;
3. if the job was already submitted, wait for that same job instead of generating another ID;
4. require exact `jobId` and `requestId` correlation;
5. pass a completed result back through `ReviewGatedContinuation`;
6. persist only result hash/status and the resulting gate state in the plan.

A resumed action may therefore create another Human Review barrier. The system does not assume that one approval grants unlimited downstream authority.

## Retry semantics

Transient transport failures keep the plan in `planned` state with a bounded error code. The durable continuation wake remains pending and a later Review Autonomy Runtime recovery cycle may retry.

A terminal Machine Bridge result whose technical status is not `completed` is recorded as `failed` and the continuation stays deferred for explicit handling rather than being converted into approval.

V1 does not claim exactly-once execution across arbitrary transports. Recovery relies on deterministic job IDs, durable result lookup, the Machine Bridge transport's duplicate protections and the Continuation Dispatcher's idempotency key.

## Security boundary

This component does not:

- execute arbitrary shell commands;
- accept a Machine Bridge action name directly from review/pointer state;
- enable public network actions by default;
- accept raw secrets/credentials in continuation params;
- bypass Human Review;
- bypass Machine Bridge Action Registry or capability checks;
- write directly to `main`;
- expose Creator Console remotely;
- treat a successful technical result as blanket authorization for later steps.

A recipe is trusted application policy. Adding a new recipe is a source-code change and therefore remains branch/PR/CI/review-gated.

## Product effect

ARCA now has a bounded way to continue from a human-approved request into a real Machine Bridge capability without requiring the original chat/browser to remain alive and without serializing arbitrary executable commands.

The next architectural step is a durable multi-step workflow/state machine that can chain these one-shot continuations under the same `requestId`, inserting a fresh Review Gate whenever policy or a result requires one.
