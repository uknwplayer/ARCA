# ARCA Creator Workflow-Reasoning Binding V1

## Objective

Creator Workflow-Reasoning Binding V1 makes the Human Review decision explicit about **which already-registered closed workflow** an approval may release.

The lifecycle is:

```text
structured capability proposal
        ↓
explicit Creator registration
        ↓
registered workflow + budget + continuation intent
        ↓
private reasoning instruction
        ↓
hash-bound reasoning/workflow binding
        ↓
durable encrypted reasoning
        ↓
output privacy reclassification
        ↓
Human Review shows exact workflow hashes
        ↓
Creator approval
        ↓
durable continuation wake
        ↓
only the already-registered workflow resumes
```

The central invariant remains:

```text
model output != executable authority
```

## Binding record

Before private reasoning starts, ARCA persists a local binding under:

```text
ARCA_HOME/creator-control/workflow-reasoning-bindings/
```

The record contains control metadata only:

- requestId;
- proposalId;
- proposalHash;
- planHash;
- workflowDefinitionHash;
- workflowRecordHash;
- continuation intent record hash;
- payloadId;
- instructionHash;
- responseFormat;
- bindingHash;
- recordHash.

The private reasoning instruction itself is **not** persisted in the binding. Only its SHA-256 hash is retained outside the encrypted reasoning request path.

A requestId cannot be rebound to a different instruction/workflow descriptor.

## Start preconditions

Workflow-bound reasoning starts only when:

1. the Creator session is strong WebAuthn/hardware-key;
2. the proposal is already `registered`;
3. caller supplies the exact current proposal `recordHash`;
4. caller supplies the exact `planHash`;
5. persisted workflow is still in `registered` state;
6. workflow definition/record hashes still match proposal registration metadata;
7. continuation intent hash still matches;
8. no continuation pointer already exists for that requestId.

The last condition prevents attaching a new reasoning/authorization interpretation to a request that has already entered a review/authorization cycle.

## Reasoning request

The reasoning instruction travels only through the existing private reasoning path.

The durable local binding stores `instructionHash`, while the actual instruction is submitted through:

- Secure Reasoning Transport Gate;
- verified Reasoning Capability;
- signed/E2E opaque Mesh;
- Durable Reasoning Pending.

Reasoning context carries binding metadata such as proposalId, planHash, workflowDefinitionHash and bindingHash, not a replacement executable workflow.

## Human Review authorization context

`ReasoningOutputReviewGate` now accepts an optional:

```text
authorizationContext.kind = "registered-workflow"
```

with:

- proposalId;
- proposalHash;
- planHash;
- workflowDefinitionHash;
- bindingHash.

When present, the Human Review item explicitly states that approval may release that workflow.

The review title/summary/recommendations and classification source references include the workflow binding metadata.

Review idempotency includes `bindingHash`, so an older unbound or differently bound review cannot silently substitute for the exact authorization context.

## Creator Console 0.4.0

An integrated Creator host may inject `CreatorWorkflowReasoningService`.

State then exposes:

```json
{
  "workflows": {
    "structuredProposal": true,
    "reasoningBinding": true
  }
}
```

Routes:

- `POST /api/workflows/reason`
- `GET /api/workflows/reason/status?requestId=...`
- `POST /api/workflows/reason/collect`
- `GET /api/workflows/reason/pending`

Starting/collecting bound reasoning uses the elevated closed Creator action `workflow.reason` under `creator.propose-change`.

Status/pending reads use `workflow.read`.

Bootstrap and recovery sessions cannot use these operations.

## Browser behavior

For a registered workflow, the Creator UI can show:

- proposal ID;
- plan hash;
- workflow definition hash;
- private reasoning instruction box;
- “Iniciar reasoning vinculado”.

The browser may then close.

On return, the Creator Console can rediscover bound pending reasoning and resume status polling.

When the result is ready:

- collect/decrypt happens at origin;
- output is reclassified;
- Human Review is materialized;
- polling stops at `awaiting-human-review`.

The Human Review panel displays the authorization context and warns that approval may release the exact registered workflow.

Dynamic review/workflow data continues to be rendered with DOM text nodes / `textContent`, never raw HTML.

## Fail-closed status semantics

A technically completed reasoning call is not exposed as substantively `completed` before a Human Review item exists.

If the encrypted result is technically complete but review materialization has not happened yet, Creator workflow reasoning status reports `result-ready`.

Only after a bound review exists can status become:

- `awaiting-human-review`;
- `blocked`;
- `needs-more-information`;
- `manual-policy-required`;
- `completed` after an authorizing approval.

## Durable background materialization

`CreatorWorkflowReasoningService.createPendingRuntime()` composes the existing `DurableReasoningPendingRuntime`.

A persistent/scheduled host can therefore:

1. discover terminal encrypted reasoning after the browser disappears;
2. validate the ready event against the binding payloadId;
3. collect/decrypt at origin;
4. materialize the bound Human Review;
5. ACK the durable ready event only after the callback succeeds.

If review materialization fails, the ready event remains recoverable.

## Approval and autonomous continuation

The workflow is registered **before** reasoning.

Approval therefore does not create a new executable plan. It changes only the Review-Gated Continuation state for the same requestId.

The existing ReviewAutonomyRuntime may then dispatch the already-registered closed workflow.

The model cannot choose:

- action;
- recipeId;
- workflow params after registration;
- shell;
- network target;
- capabilities;
- direct source/main mutation.

## Security boundaries

This milestone does not authorize publication, lower privacy classification, grant shell access, or permit direct `main` writes.

Creator remains root of trust, not root execution.

The Creator Console remains loopback-only.

Remote Creator stays out of scope until trusted HTTPS/private tunnel and strong-auth hardening exist.

`main` branch protection remains a separate governance gap.

## Test proof

The integration tests prove:

- no workflow execution before approval;
- binding record contains only instruction hash, not private instruction plaintext;
- reasoning context contains workflow hashes, not executable mutation selected by model text;
- Human Review contains exact proposal/plan/definition/binding hashes;
- Creator approval releases exactly one pre-registered `repository.check`;
- private instruction and semantic model text do not enter the dispatched Machine Bridge job;
- recovery does not replay the completed workflow;
- unregistered/stale/rebound/pre-existing-pointer cases fail closed;
- Creator Console workflow reasoning endpoints require a strong Creator session.

## Product effect

The Creator can now safely perform this sequence:

```text
1. "Prepare a repository verification workflow."
2. inspect capability -> policy -> closed recipe
3. register it
4. "Analyze privately whether I should continue."
5. leave the browser
6. return to a Human Review showing exact workflow hashes
7. approve or reject
8. if approved, ARCA resumes only that registered workflow
```

This closes the semantic authorization gap between Creator reasoning and autonomous continuation.
