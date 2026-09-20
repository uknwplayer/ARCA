# ADR-ARCA-0010 — Role conformance before cognitive substitution

**Status:** Proposed for v0.2  
**Date:** 2026-09-19

## Context

Cognitive Substitution v0.1 separated a logical role from the participant and runtime that implement it. Capability verification establishes that a participant can perform a general capability, but a role can impose stricter observable behavior.

A participant with a verified `research` capability is not automatically proven to satisfy every research role.

Using capability status alone as the final substitution criterion would allow a participant to assume a role without evidence that it preserves that role's schemas, correlation rules or semantic invariants.

## Decision

ARCA requires **role-specific conformance evidence** before a participant is eligible for Cognitive Substitution v0.2.

Eligibility is evaluated in this order:

```text
Role Contract
-> verified required capabilities
-> current Role Conformance Profile
-> passing and fresh Role Conformance Evidence
-> current Participant Runtime Binding
-> runtime availability
-> independent policy/authorization gate
-> exact dispatch
```

The conformance profile is bound to `roleContractHash`. Evidence is bound to the profile hash and the participant descriptor hash.

Changing the role contract, profile, model/environment fingerprint or evidence freshness invalidates the prior proof.

## Test surface

Role conformance tests use only bounded synthetic fixtures.

Profiles must declare:

- `syntheticOnly=true`;
- `sideEffects=false`;
- `subjectNetworkRequired=false`.

The persisted profile uses a bounded schema language and a closed set of semantic assertions. It cannot carry arbitrary evaluator code.

Secret-like fixture fields, schema property names and semantic paths are rejected.

## Evidence handling

Semantic outputs are evaluated transiently.

Persistent evidence stores hashes, sizes, execution state and assertion outcomes, not raw model/tool output.

A completed fixture requires an output SHA-256 fingerprint.

The substitution receipt binds the profile and evidence hashes and is independently signed by the existing Mesh identity layer.

## Security boundary

Role conformance does not grant execution authority.

The following remain separate:

- capability verification;
- role conformance;
- runtime identity binding;
- availability;
- policy authorization;
- Human Review;
- Creator source-code mutation authorization.

Passing a conformance suite cannot bypass the Creator Sovereignty Gate.

## Failover

This ADR does not authorize post-start failover.

Timeout remains insufficient proof that the original execution did not occur. Reconciled failover requires a separate execution-identity and idempotency design.

## Consequences

### Positive

- role substitution is based on role-specific proof instead of generic capability labels;
- drift invalidation becomes explicit and auditable;
- a signed execution receipt can identify the exact conformance evidence used;
- synthetic testing avoids requiring private production material.

### Cost

- participants must be re-tested when relevant fingerprints or contracts change;
- profile authors must maintain bounded synthetic fixtures;
- role eligibility may temporarily fall to zero after drift until re-conformance succeeds.

This failure mode is intentional and fail-closed.
