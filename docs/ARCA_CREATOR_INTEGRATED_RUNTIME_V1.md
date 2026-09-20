# ARCA Creator Integrated Runtime V1

## Objective

Creator Integrated Runtime V1 assembles the previously independent Creator, reasoning, Human Review and autonomy components into one local runtime without weakening their boundaries.

The composition is:

```text
Creator Console (loopback)
        │
        ├── generic durable private Creator reasoning
        ├── structured workflow proposal/registration
        ├── workflow-bound private reasoning
        └── Human Review decisions
                    │
                    ↓
            Review-Gated Continuation
                    │
                    ↓
            ReviewAutonomyRuntime
                    │
                    ↓
       Guarded Autonomy Workflow
                    │
                    ↓
              Machine Bridge
```

The runtime is a wiring layer. It does not invent new execution authority.

## Required host inputs

The integrated runtime requires:

- one `ARCA_HOME`;
- a verified `DurableReasoningPendingCoordinator`;
- a recoverable Machine Bridge workflow client;
- optionally an explicit Capability Registry, otherwise the reasoning coordinator registry is reused.

The reasoning coordinator must use the same `ARCA_HOME`.

The workflow client must expose:

- durable result lookup;
- submit;
- wait-for-result.

No provider credential is added to Creator runtime state.

## Shared local state

The runtime constructs and wires:

- HumanReviewQueue;
- ReviewContinuationStore;
- ReviewGatedContinuation;
- ReasoningOutputReviewGate;
- GuardedAutonomyWorkflowCoordinator;
- ReviewAutonomyRuntime;
- CreatorWorkflowProposalService;
- CreatorWorkflowReasoningService;
- Creator durable chat handlers;
- Creator Console.

All durable control state uses the same local `ARCA_HOME`.

This makes review decisions, continuation wakes, workflow registration and reasoning bindings reconstructible after browser/caller restart.

## Background runtime ownership

Generic Creator reasoning and workflow-bound reasoning can share a `DurableReasoningPendingCoordinator`.

That creates an ownership problem: a background workflow runtime must not ACK a ready event belonging to an unrelated generic Creator chat.

V1 therefore adds an optional `shouldHandle(record)` filter to `DurableReasoningPendingRuntime`.

`CreatorWorkflowReasoningService.createPendingRuntime()` filters strictly to requestIds that have a durable workflow-reasoning binding.

Consequences:

- bound workflow reasoning may be collected/materialized in background;
- unbound generic reasoning stays untouched and recoverable by its own consumer/browser;
- a background runtime cannot silently consume another reasoning channel's ready event.

The scan reports an `ignored` count for non-owned records.

## Start lifecycle

`CreatorIntegratedRuntime.start()` starts:

1. ReviewAutonomyRuntime;
2. filtered workflow-reasoning pending runtime;
3. local Creator Console.

If later startup fails, already-started background runtimes are stopped before the error is returned.

Creator Console remains loopback-only because the existing server enforces loopback binding.

## Stop lifecycle

`stop()`:

1. stops the HTTP Creator Console;
2. stops workflow-reasoning background recovery;
3. stops ReviewAutonomyRuntime;
4. drains their internal serialized chains.

No new remote exposure is introduced.

## Scheduler-friendly mode

`runOnce()` executes:

- one filtered workflow-reasoning recovery scan;
- one Human Review/autonomy recovery scan.

This allows a host to choose between:

- persistent local runtime; or
- external scheduler / periodic one-shot invocation.

The original browser does not need to remain alive.

## Generic Creator chat

The integrated runtime also injects `createCreatorDurableReasoningHandlers(...)` into the Creator Console.

The same ReasoningOutputReviewGate is shared with workflow-bound reasoning.

Generic private reasoning still requires a strong Creator session and does not gain workflow execution authority merely because the integrated runtime exists.

## Workflow-bound reasoning

The runtime injects both:

- CreatorWorkflowProposalService;
- CreatorWorkflowReasoningService.

Therefore the local Creator UI can perform the full safe sequence:

```text
capability proposal
 -> inspect closed recipe
 -> register workflow
 -> private reasoning bound to workflow hashes
 -> Human Review
 -> approve/reject
 -> durable wake
 -> registered workflow continuation
```

## Security invariants

Creator Integrated Runtime does not:

- add arbitrary shell;
- convert model text directly into actions;
- select unknown recipes;
- authorize public network access;
- expose credentials;
- write directly to `main`;
- turn registration into execution;
- bypass Human Review;
- expose Creator remotely.

Capability verification remains compatibility, not authorization.

Creator remains root of trust, not root execution.

## Recovery behavior

The runtime is designed around already-durable components.

A crash may occur after:

- workflow registration;
- reasoning submission;
- terminal ciphertext;
- review materialization;
- human approval;
- continuation wake;
- workflow step completion.

Recovery scans use existing hashes/cursors/wakes/leases to continue without depending on the original browser turn.

## Test proof

V1 tests prove:

- all integrated services share the intended runtime graph;
- Creator Console exposes workflow proposal and workflow-reasoning capability when assembled;
- runtime remains loopback-only;
- `runOnce()` performs recovery without executing an unauthorized workflow;
- filtered Durable Reasoning Pending processes only owned requestIds and does not ACK unowned ready work.

## Deployment boundary

This is a local/in-process assembly primitive.

A production packaged launcher still needs explicit configuration for:

- the verified reasoning provider/transport;
- Machine Bridge workflow client/transport;
- local credential/private-key custody.

Those inputs must remain provider-independent and must not be replaced by committed static secrets.

Remote Creator remains a later milestone after trusted HTTPS/private tunnel and strong-auth hardening.
