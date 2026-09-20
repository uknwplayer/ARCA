# ARCA Capability Conformance Probes + Planner v1

**Status:** backend foundation  
**Scope:** Capability Registry, Agent Gateway, Machine Bridge participants  
**Frontend:** not included

## 1. Purpose

This layer turns the Capability Passport into something operationally useful without turning capability matching into authorization.

It adds two independent mechanisms:

1. **Conformance Probes** — safe synthetic tests that can promote a declared capability to `verified` only after an ARCA-controlled check.
2. **Capability Planner / Gap Detector** — a non-executing planner that shows which capabilities are available, which need verification and which are missing.

Neither component grants permission to execute a real task.

## 2. Conformance probes

A probe is a closed, local descriptor. It must declare:

- a stable `probeId`;
- the capability being tested;
- `syntheticOnly: true`;
- `sideEffects: false`;
- `subjectNetworkRequired: false`;
- a bounded input;
- a declarative assertion;
- a timeout between 1 and 30 seconds.

Probe descriptors reject credential-like fields. A remote participant cannot upload a probe and cause it to be trusted as an ARCA conformance test.

## 3. Probe execution boundary

`runCapabilityProbe()` receives an executor from the trusted host. The probe framework itself does not provide shell, browser automation, filesystem mutation or arbitrary network access.

The executor receives only a synthetic request:

```json
{
  "format": "arca-capability-probe-v1",
  "probeId": "arca.json.structured-output.v1",
  "participantId": "agent.example",
  "capabilityId": "json.structured-output",
  "synthetic": true,
  "input": {}
}
```

A probe result stores no raw participant output. The raw output is evaluated in memory and committed only through an evidence SHA-256.

Result metadata includes:

- pass/fail;
- execution state;
- evidence hash;
- verification-record hash;
- `authorizationIncluded: false`;
- `sideEffectsPerformed: false`;
- `rawOutputPersisted: false`.

A passing probe calls `recordVerification()` and promotes the exact capability fingerprint to `verified`. A failed probe marks it `degraded`.

## 4. Initial built-in probe

The v1 library includes one deliberately small built-in probe:

`arca.json.structured-output.v1`

It checks capability `json.structured-output` using an exact synthetic JSON response. This establishes the framework without pretending that complex capabilities such as legal research, OCR quality or code correctness can be verified by a superficial single test.

Additional probes should be capability-specific and conservative.

## 5. Gap Detector

`detectCapabilityGaps()` compares a requested capability set against Capability Passports.

For each requested capability, it distinguishes:

- available through at least one `verified` participant;
- `verification-needed`;
- `degraded`;
- `unverified` (`declared` only);
- `unknown`;
- `unavailable`;
- `missing` (no participant declares it).

The report is informational only:

```json
{
  "authorizationIncluded": false,
  "executionPerformed": false
}
```

## 6. Capability Planner

`buildCapabilityPlan()` accepts an explicit sequence/DAG of capability requirements.

Example:

```json
{
  "taskId": "investigation-1",
  "steps": [
    {"stepId":"acquire","capabilityId":"public.acquire"},
    {"stepId":"analyze","capabilityId":"document.analyze","dependsOn":["acquire"]},
    {"stepId":"publish","capabilityId":"report.publish","dependsOn":["analyze"]}
  ]
}
```

The planner validates unknown dependencies, self-dependencies and cycles before producing a plan.

Each step can become:

- `ready` — at least one verified participant is compatible;
- `needs-verification` — only declared participants exist and planning explicitly allows them to appear as unverified candidates;
- `blocked` — required capability cannot currently be satisfied;
- `optional-gap` — an optional capability is not currently satisfiable.

The plan does not choose an authoritative executor. It exposes candidate participant IDs and leaves final selection to the scheduler/policy layer.

Every plan states:

```json
{
  "authorizationIncluded": false,
  "executionPerformed": false,
  "schedulerSelectionPerformed": false,
  "humanReviewRequired": true
}
```

## 7. Trust model

The sequence is intentionally:

```text
participant advertises capability
        ↓
Capability Registry = declared
        ↓
ARCA-controlled synthetic probe
        ↓
Capability Registry = verified/degraded
        ↓
Planner checks compatibility
        ↓
Policy Engine decides authorization
        ↓
Scheduler/Bridge may select executor
        ↓
Human Review remains where required
```

No step may collapse capability, trust, authorization and execution into one decision.

## 8. Privacy properties

The probe/planner layer is designed to avoid creating a secondary surveillance or credential store.

- no API keys/tokens/credential references in probe descriptors;
- no raw probe output persisted by the framework;
- verification history stores hashes and bounded notes;
- planner reports participant IDs/capability state, not secrets;
- probe test vectors are synthetic;
- no investigation evidence is required to test a capability.

## 9. Tests

The v1 tests cover:

- passing probe promotes a capability;
- failed probe degrades a capability;
- raw output is absent from probe results;
- unsafe probe descriptors are rejected;
- gap classification distinguishes verified/unverified/missing;
- planner exposes verification gaps and missing capabilities;
- planner refuses dependency cycles;
- authorization/execution remain explicitly outside the planner.

## 10. Next extensions

Natural follow-ons:

- additional conservative probes for structured extraction, summarization and selected code tasks;
- AAP `/arca/capabilities` endpoint to exchange richer passports;
- worker synchronization into the Capability Registry;
- expiry/reverification policies;
- health/reliability observations kept distinct from semantic capability verification;
- higher-level task decomposition into capability DAGs;
- Privacy Classification + Publication Gate before public export.
