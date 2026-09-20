# ARCA Creator Structured Workflow V1

## Objective

Creator Structured Workflow V1 lets the Creator define and register a future autonomy workflow from **verified capabilities** without exposing arbitrary execution selectors.

The boundary is deliberately:

```text
Creator structured input
        ↓
Capability Workflow Planner
        ↓
verified capability + source-code policy
        ↓
closed Machine Bridge recipe
        ↓
durable proposal
        ↓
explicit Creator registration
        ↓
inert registered workflow
        ↓
later substantive authorization / durable wake
        ↓
execution
```

A natural-language model response is not converted directly into an action.

## Security invariant

The Creator-facing proposal input accepts only:

- `requestId`;
- optional `objectiveId`;
- `steps[]` containing:
  - `stepId`;
  - `capabilityId`;
  - bounded `params`;
- bounded execution policy:
  - optional `deadlineAt`;
  - `maxSubmitAttemptsPerJob`;
  - `maxTotalSubmitAttempts`.

It does **not** accept caller-selected:

- `action`;
- `recipeId`;
- shell commands;
- worker target;
- network authorization;
- credentials/secrets;
- direct source/main mutation.

Unknown structural fields fail closed.

The planner resolves:

`capabilityId -> source-code policy -> closed recipe`

only when one participant satisfies every required capability in `verified` state.

## Creator Action Registry

V1 adds three elevated Creator operations under `creator.propose-change`:

- `workflow.read`;
- `workflow.propose`;
- `workflow.register`.

Local bootstrap sessions remain limited to `creator.chat` and `creator.read` and therefore cannot inspect private workflow proposals, create them, or register them.

Recovery authentication cannot use these actions.

## Durable proposal store

Proposals are stored locally under:

```text
ARCA_HOME/creator-control/workflow-proposals/
```

Each record is hash-bound and contains:

- deterministic proposal ID;
- request/objective IDs;
- complete Capability Workflow Plan;
- normalized execution policy;
- proposal hash;
- registration state;
- record hash.

The proposal ID is derived from:

```text
SHA256(planHash + normalized execution policy)
```

Re-submitting the same plan and execution policy is idempotent.

A blocked plan is still durably recorded for diagnosis, but cannot be registered.

## Explicit registration

Registration requires:

- strong Creator session through the Creator Console authorization boundary;
- exact `proposalId`;
- exact current `recordHash`;
- exact `planHash`;
- `confirmRegistration=true`.

Registration uses the existing `GuardedAutonomyWorkflowCoordinator`.

This means the execution budget is durably registered before a future workflow run.

Registration persists:

- workflow definition hash;
- workflow record hash;
- continuation intent hash;
- context reference;
- budget policy hash;
- budget record hash.

Registration itself does **not** execute Machine Bridge work.

## Late-registration protection

A workflow cannot be attached after the same `requestId` already has substantive continuation authorization or a pending approved wake.

This prevents the unsafe sequence:

```text
approve arbitrary request
        ↓
later attach a new executable workflow
        ↓
old approval unexpectedly releases new work
```

Instead, the workflow must exist before the authorizing wake becomes active.

An existing non-authorized review pointer may coexist with registration, which is required for the intended reasoning-review-continuation flow.

## Creator Console 0.3.0

An integrated host may provide `CreatorWorkflowProposalService` to the local Creator Console.

When present, a strong Creator session receives:

- capability/policy description;
- proposal list;
- structured proposal creation;
- explicit workflow registration.

The browser UI provides a mobile-friendly structured panel with:

- request/objective IDs;
- JSON step editor;
- retry budgets;
- optional deadline;
- plan preview;
- capability gaps/candidate participants;
- explicit registration checkbox.

All dynamic proposal data is rendered with DOM text nodes / `textContent`, not raw HTML.

The standalone Creator launcher does not fabricate a Capability Registry or execution runtime. If no integrated workflow service exists, the workflow panel remains unavailable.

## API

### GET /api/workflows/capabilities

Requires `workflow.read`.

Returns source-code policies and the public Capability Registry snapshot.

### GET /api/workflows/proposals?status=...

Requires `workflow.read`.

Statuses:

- `all`;
- `blocked`;
- `ready`;
- `registered`.

### POST /api/workflows/propose

Requires `workflow.propose`.

The API accepts only the structured schema above. Raw secrets are also rejected by Creator Control Plane policy before reaching the planner.

### POST /api/workflows/register

Requires `workflow.register`.

Registration is optimistic-concurrency and plan-hash bound.

## Relationship to Reasoning-Approved Autonomy

Reasoning-Approved Autonomy already guarantees:

```text
reasoning output
  != executable authority
```

Creator Structured Workflow adds the missing user-facing preparation stage:

```text
structured capability proposal
        ↓
register closed workflow
        ↓
private reasoning / Human Review
        ↓
Creator approval
        ↓
only the already-registered workflow may resume
```

A future natural-language assistant may help **draft** structured steps, but those drafts must remain proposals and pass the same planner, capability verification, Creator authorization and review boundaries.

## V1 limitations

This milestone does not:

- select a scheduler/executor;
- authorize public network access;
- execute immediately after registration;
- enable arbitrary shell;
- write directly to `main`;
- expose Creator remotely;
- create capabilities or policies dynamically;
- turn model prose into commands.

Remote Creator remains out of scope until HTTPS/private tunnel and strong-auth hardening are completed.
