# Reasoning-Approved Autonomy V1

## Objective

Reasoning-Approved Autonomy V1 connects a reviewed reasoning result to the existing durable Autonomy Workflow without allowing model output to become arbitrary executable instructions.

The invariant is:

```text
reasoning may inform a human decision
human approval may release a pre-registered workflow
reasoning output does not create executable actions by itself
```

The lifecycle is:

```text
register closed workflow intent
        ↓
submit durable private reasoning
        ↓
awaiting-reasoning
        ↓
encrypted result becomes ready
        ↓
collect + privacy reclassification
        ↓
awaiting-human-review
        ↓
Creator approves
        ↓
durable continuation wake
        ↓
ReviewAutonomyRuntime dispatches
        ↓
pre-registered Autonomy Workflow
```

## Bridge

`ReasoningApprovedAutonomyBridge` composes:

- `DurableReasoningPendingCoordinator`;
- `ReasoningOutputReviewGate`;
- `AutonomyWorkflowCoordinator`;
- `ReviewAutonomyRuntime`.

All components use the same `requestId`.

A reasoning request and workflow with different request IDs are rejected before workflow registration.

## Register before reasoning

`register(...)` registers the Autonomy Workflow and its continuation intent **before** starting reasoning.

This ordering is deliberate.

If reasoning later creates an approved review wake, the dispatcher already knows exactly which closed handler/definition that wake is permitted to resume.

The workflow contains only recipes already accepted by the existing Workflow Registry.

The model output is not parsed into:

- action names;
- recipe IDs;
- shell commands;
- network targets;
- arbitrary params.

If reasoning submission fails after registration, the workflow remains inert because no authorized wake exists. The same request can be retried safely.

## Durable ready handling

`handleReady(event)` is designed as the callback for `DurableReasoningPendingRuntime`.

It:

1. validates the durable ready event/requestId;
2. collects/decrypts the terminal reasoning result at origin;
3. requires a completed verified result;
4. sends the result through `ReasoningOutputReviewGate`;
5. returns only review/control metadata.

If review materialization fails, the callback throws. Durable Reasoning Pending therefore does not ACK the ready event and can retry later.

## Pending runtime composition

`createPendingRuntime(...)` creates a `DurableReasoningPendingRuntime` whose `onReady` handler is the bridge.

This means an originating browser/process does not need to remain alive.

A host can run:

- the durable reasoning pending runtime;
- the review autonomy runtime.

The first turns terminal ciphertext into Human Review. The second turns an approved Human Review into a dispatched workflow.

## Human authorization

Before approval:

- workflow intent exists;
- workflow definition exists;
- no Machine Bridge workflow step runs.

After an `approve` review decision:

- Review-Gated Continuation emits one durable wake;
- ReviewAutonomyRuntime claims the registered intent;
- Autonomy Workflow executes its pre-registered closed recipes;
- the wake is acknowledged after successful dispatch.

A repeated recovery scan does not replay the completed wake.

## Non-authorizing decisions

A reasoning result itself never authorizes continuation.

Review decisions preserve existing policy:

- approve -> may authorize the registered continuation;
- reject -> blocked;
- needs-more-information -> paused;
- acknowledge -> not substantive approval under the default policy.

## Security boundary

This milestone does not let a model choose arbitrary code or actions.

Specifically, reasoning output cannot:

- write a new workflow definition;
- select an unknown recipe;
- mutate workflow params after registration;
- invoke shell execution;
- write directly to main;
- grant capabilities;
- authorize network access;
- bypass Human Review.

Any future feature that converts model output into a proposed workflow must remain a **proposal** and pass separate schema, capability, policy and Human Review gates before registration.

## Failure and restart behavior

The architecture is restart-safe across each boundary:

- workflow/intent is persisted before reasoning starts;
- reasoning is durable through encrypted Mesh state;
- ready event is durable until its callback succeeds;
- Human Review is durable local state;
- approval wake is durable;
- dispatcher claims are leased/idempotent;
- workflow steps already completed are not replayed by later recovery cycles.

## Test proof

The V1 integration test proves:

1. a workflow is registered while no workflow job runs;
2. durable reasoning reaches a review;
3. no workflow job runs while review is pending;
4. approval creates the continuation wake;
5. ReviewAutonomyRuntime executes exactly one pre-registered `worker.ping` recipe;
6. model semantic text never appears in the dispatched Machine Bridge job;
7. a second recovery cycle does not replay the workflow.

## Product effect

ARCA can now continue work after an AI analysis without letting the AI silently convert analysis into authority.

The approval semantics are concrete:

```text
ARCA reasoning: "here is my analysis"
Creator: approve this continuation
ARCA: run the already-declared safe next step
```

This is the first complete reasoning -> human authorization -> autonomous continuation loop.
