# ARCA Cognitive Substitution v0.2 — Role Conformance Suite

**Status:** implementation candidate  
**Base:** Cognitive Substitution / Functional Mimicry v0.1  
**Scope:** role-specific behavioral eligibility before substitution

## Purpose

V0.1 established that a cognitive function can outlive a concrete agent when capability verification, runtime binding, authorization and signed provenance remain intact.

V0.2 closes the next gap:

> A verified capability is necessary, but it is not sufficient evidence that a participant can satisfy a specific role contract.

For example, two participants may both expose `research`, while `research.public` requires correlation preservation, bounded structured output, explicit uncertainty and specific semantic invariants.

V0.2 therefore inserts a **Role Conformance Gate** between capability verification and runtime eligibility.

```text
logical role
   |
   v
verified capability
   |
   v
role conformance profile
   |
   +-- bounded input schema
   +-- bounded output schema
   +-- synthetic fixtures
   +-- closed semantic assertions
   |
   v
hash-only conformance evidence
   |
   v
runtime binding
   |
   v
availability
   |
   v
policy gate
   |
   v
exact dispatch
```

## RoleConformanceProfile

A conformance profile is bound to the exact `roleContractHash`.

It declares:

- a stable profile ID and version;
- `syntheticOnly=true`;
- `sideEffects=false`;
- `subjectNetworkRequired=false`;
- bounded execution timeout;
- maximum evidence age;
- bounded input/output schemas;
- one or more synthetic fixtures;
- closed assertion types;
- `profileHash`.

The schema language is intentionally a bounded JSON-shape subset rather than arbitrary executable validation code. It supports objects, arrays, strings, numbers, integers, booleans, null, enums, required fields, bounded arrays/strings and explicit additional-property policy.

This prevents a role profile from becoming an unreviewed code-execution surface.

## Synthetic fixtures

Fixtures are restricted to JSON-safe, non-secret synthetic data.

A profile may not declare side effects or require external participant network access. Each fixture is executed under an AbortSignal with a bounded timeout.

No real investigation payload, private communication, credential, authorization token or production semantic record is required to prove role conformance.

## Closed semantic assertions

V0.2 supports closed assertion families instead of arbitrary evaluator callbacks in the persisted profile:

- `exact-json`;
- `json-subset`;
- `path-equals`;
- `path-equals-input`;
- `text-contains-all`;
- `text-excludes-all`;
- `boolean-path-true`;
- `array-min-items`.

This permits role-specific semantic constraints while keeping the evaluator auditable and bounded.

## Evidence

A conformance run produces `arca-role-conformance-evidence-v1`.

Evidence is bound simultaneously to:

- `roleContractHash`;
- `profileHash`;
- `participantDescriptorHash`;
- participant ID;
- verifier ID;
- test timestamp and expiry.

Per-fixture evidence stores:

- execution state;
- schema pass/fail;
- output SHA-256;
- output byte size;
- assertion pass/fail summaries.

It explicitly records:

`rawOutputPersisted=false`

The semantic model/tool output is evaluated transiently and is not copied into the conformance evidence record.

## Freshness and drift

Evidence becomes unusable when:

1. the role contract changes;
2. the conformance profile changes;
3. the participant descriptor fingerprint changes;
4. the evidence exceeds `maxEvidenceAgeMs`;
5. any fixture or assertion fails.

Capability re-verification after a model/environment change does not automatically restore role conformance. The role suite must run again against the new participant fingerprint.

## Router integration

In v0.2, `CognitiveSubstitutionRouter` requires a `RoleConformanceRegistry`.

Candidate eligibility becomes:

```text
capability verified
AND role profile current
AND passing conformance evidence current
AND runtime binding current
AND participant available
AND policy authorizes exact target
```

A participant that has the required capability but lacks current role evidence is skipped before availability and before dispatch.

The signed substitution receipt now additionally binds:

- `roleConformanceProfileHash`;
- `roleConformanceEvidenceHash`;
- `conformanceVerifiedAt`;
- `conformanceValidUntil`;
- `conformanceRejectedParticipants`.

This lets an auditor answer not only **which participant executed**, but **which exact conformance proof justified that participant assuming the role**.

## What v0.2 does not do

V0.2 does not claim two models have identical internal cognition.

It does not copy weights, infer private chain-of-thought, learn hidden policies or perform unrestricted imitation learning.

It also does not introduce post-start failover. Once a dispatch starts, timeout or transport failure is still not proof that no side effect occurred.

Reconciled post-start failover remains dependent on shared execution identity, enforceable idempotency and completion reconciliation.

## Governance invariants

V0.2 preserves the boundaries established earlier:

- capability is not authorization;
- conformance is not authorization;
- runtime binding is not authorization;
- Human Review is not Creator code-mutation authority;
- substitution cannot bypass the Creator Sovereignty Gate;
- conformance fixtures are synthetic and side-effect free;
- raw conformance outputs are not persisted in evidence;
- a failed or stale proof fails closed.

## Next frontier

After v0.2 is proven in the canonical runtime, the next safe frontier is **Execution Identity + Reconciled Failover**.

Behavioral Mimicry should remain later still: first prove role compliance and execution safety, then consider learning from permitted observable traces.
