# Autonomy Workflow Guardrails V1

## Objective

Autonomy Workflow Guardrails V1 bounds unattended retry behavior around `AutonomyWorkflow V1`.

The main risk addressed is not arbitrary command execution—the workflow/recipe registries already close that boundary—but a durable request repeatedly consuming remote execution resources after transport failures, stalled workers or a forgotten long-running workflow.

The guarded path is:

`Review wake -> GuardedAutonomyWorkflowCoordinator -> execution budget -> AutonomyWorkflow -> Machine Bridge`

## Durable execution policy

`WorkflowExecutionBudgetStore` persists policy and counters under:

`ARCA_HOME/review-continuations/workflow-budgets/<requestId>.json`

A policy contains:

- optional `deadlineAt`;
- `maxSubmitAttemptsPerJob` — default `3`, range `1..20`;
- `maxTotalSubmitAttempts` — default `20`, range `1..500`.

The policy is immutable for a `requestId`. Re-registering the same request with a divergent policy fails closed.

The record also contains:

- total submission-attempt count;
- bounded per-`jobId` counters;
- latest allow/deny decision and bounded code;
- `policyHash`;
- tamper-evident `recordHash`.

No job payload, credential or raw result is stored in the budget record.

## Guarded Machine Bridge client

`BudgetGuardedMachineBridgeClient` decorates the existing recoverable Machine Bridge client.

Before forwarding a **new submit attempt**, it atomically updates the durable budget record and checks:

1. deadline;
2. total submission-attempt budget;
3. per-job submission-attempt budget.

When allowed, the original submit proceeds.

When denied, the delegate is not called. The guard returns a correlated synthetic terminal Machine Bridge result with the same `jobId` and `requestId`, for example:

`workflow-job-attempt-budget-exceeded`

The normal Autonomy Workflow terminal-failure path then stops and acknowledges the consumed wake instead of entering an infinite recovery loop.

A durable Machine Bridge result that already exists is consumed without spending a new submission attempt, because the underlying workflow checks `getResult(jobId)` before calling `submit`.

## Guarded coordinator

`GuardedAutonomyWorkflowCoordinator` composes:

- `WorkflowExecutionBudgetStore`;
- `BudgetGuardedMachineBridgeClient`;
- `AutonomyWorkflowCoordinator`.

Registration first persists the execution policy, then registers the durable workflow/continuation intent. This ordering avoids creating an executable continuation that lacks its required budget policy.

The handler remains the same closed `machine-bridge.workflow-v1` handler; only its Machine Bridge client is guarded.

## Failure semantics

Transient transport failures still leave the workflow wake pending, but every forwarded resubmission consumes durable budget.

Once budget is exhausted, the next attempted submission becomes a terminal guard result and the workflow stops. This creates an upper bound even if the remote transport continues failing indefinitely.

A deadline prevents **new submission attempts** after its timestamp. An already durable result may still be consumed after that time; the guard does not discard work that has already completed.

## Concurrency boundary

The V1 budget store is intended to run inside the existing Review Continuation Dispatcher path, whose per-request claim/lease serializes authorized continuation handling across cooperating runtimes. It is not presented as a standalone distributed quota service for unrelated untrusted writers.

Future Mesh-wide resource accounting should use signed node-side quotas/receipts rather than assuming this local record is global consensus.

## Security boundary

Guardrails V1 does not:

- grant authorization;
- make a capability verified;
- select a provider/worker;
- enable network access;
- execute shell or arbitrary actions;
- bypass Human Review;
- replace Machine Bridge claims/leases;
- provide billing or cryptocurrency accounting;
- claim exactly-once execution.

It adds a bounded resource/liveness policy around already-authorized, already-closed workflow execution.

## Product effect

A 24/7 ARCA runtime can recover from outages without retrying forever. The same durable request can wait and resume, but the operator can define a hard submission budget and deadline before unattended execution begins.

This is a prerequisite for safely extending autonomous workflows toward remote reasoning nodes and federated Mesh execution, where every retry may have real compute, API or infrastructure cost.

## Next evolution

The next useful guardrails are:

- bounded typed conditions over prior step results;
- workflow-level elapsed/runtime accounting;
- provider/node cost budgets once signed usage receipts exist;
- Mesh hop/deadline budgets propagated in signed envelopes;
- explicit policy classes for which transitions may continue automatically versus require fresh Human Review.
