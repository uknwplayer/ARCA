# Capability Workflow Planner V1

## Objective

Capability Workflow Planner V1 is the policy compiler between a requested capability sequence and `AutonomyWorkflow V1`.

It changes the planning vocabulary from:

`caller chooses Machine Bridge action`

to:

`caller requests capability -> verified capability + source-code policy -> closed recipe -> proposed workflow`

The planner does not execute or register the workflow. Its output is a proposal that still enters the normal Review/Continuation path.

## Inputs

A plan request contains:

- `requestId`;
- optional bounded `objectiveId` used only as a stable label, not interpreted as executable natural language;
- 1–50 ordered steps;
- each step has a `stepId`, `capabilityId` and optional bounded JSON params.

The caller never supplies a Machine Bridge action name.

## Policy registry

`CapabilityWorkflowPolicyRegistry` maps one capability ID to one closed continuation recipe in V1.

Default policy is deliberately small:

- `repository` -> `mb.repository.check`;
- `pncp-plan` -> `mb.pncp.plan`.

This mapping is source-code policy. Unknown capabilities do not fall back to a guessed action. They produce `policy-missing`.

V1 rejects ambiguous multiple policies for the same capability. Future versions may support explicit policy variants, but implicit ranking is intentionally absent.

A policy may only reference a recipe already present in the closed Machine Bridge continuation recipe registry. A network-requiring recipe would additionally need explicit `allowNetworkPlanning`; planning that recipe still would not authorize network use.

## Capability verification

For each step the planner combines:

1. the requested capability;
2. capabilities required by the mapped closed recipe;
3. `CapabilityRegistry` verification state.

A step is `ready` only when at least one participant has every required capability in `verified` state.

Declared, degraded, unavailable, unknown or `verification-needed` capabilities cannot become a ready workflow step.

The plan exposes candidate participant IDs for compatibility/audit purposes only. It does **not** select a scheduler target or grant that participant authority.

## Parameter boundary

Parameters are:

- required to be bounded JSON objects;
- rejected if secret/credential-like keys are present;
- passed through the trusted recipe normalizer;
- rejected if the recipe refuses them.

For example, the PNCP plan recipe refuses `allowNetwork=true`. Repository check accepts no arbitrary command parameters.

## Output

The output format is:

`arca-capability-workflow-plan-v1`

It contains:

- request/objective identifiers;
- per-step capability, policy and recipe mapping;
- required capabilities;
- verified compatible participant IDs;
- gap/reason when blocked;
- deterministic `planHash` independent of `generatedAt`;
- a directly registerable `AutonomyWorkflow` definition only when all steps are ready.

Every output explicitly states:

- `authorizationIncluded=false`;
- `executionPerformed=false`;
- `registrationPerformed=false`;
- `schedulerSelectionPerformed=false`;
- `networkAuthorizationIncluded=false`;
- `humanReviewRequired=true`.

## Fail-closed cases

A workflow is not produced when any step has:

- no capability-to-recipe policy;
- no known recipe;
- no participant with all required capabilities verified;
- invalid or secret-bearing parameters;
- parameter-based network escalation rejected by the recipe.

There is no best-effort action guessing.

## Security model

The planner separates four concepts that must remain independent:

- **capability request** — what kind of function is needed;
- **compatibility** — which verified participants could satisfy it;
- **policy compilation** — which closed recipe is permitted for that capability;
- **authorization/execution** — handled later by Review, Continuation, Machine Bridge and subsystem policies.

A verified capability is not authorization. A compiled workflow is not authorization. A participant candidate is not a selected executor.

## Product effect

The ARCA no longer needs a caller to know the internal Machine Bridge action name for supported operations. A higher-level controller can ask for capabilities, receive a deterministic closed workflow proposal, obtain the required review/authorization, and then let the durable autonomy runtime execute it.

This is the bridge toward a future Network Capability Planner where the same capability request can be satisfied by verified local or Mesh participants without coupling the objective to one AI provider or one server.

## Next evolution

Natural next steps are:

- workflow budgets, deadlines and maximum execution counts;
- typed bounded conditions over prior results;
- more reviewed capability-to-recipe policies, including AIE capabilities;
- provider-independent `reasoning` capability with conformance verification;
- policy-aware participant routing across Mesh/Federation;
- signed node advertisements and receipts.
