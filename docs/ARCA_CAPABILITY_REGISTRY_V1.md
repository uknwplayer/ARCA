# ARCA Capability Registry & Capability Passport v1

**Status:** backend foundation  
**Scope:** agents, workers, tools, connectors, models and services  
**Relationship:** Agent Gateway + Machine Bridge capability-first architecture

## 1. Purpose

The Capability Registry turns capability advertisement into an auditable inventory. It answers two separate questions:

1. **What does a participant claim it can do?**
2. **What has ARCA actually verified that this concrete participant/version can do?**

It deliberately does **not** answer whether the participant is authorized to execute a task. Capability compatibility is necessary but never sufficient authorization.

## 2. Participant types

A Capability Passport may describe:

- `agent`
- `worker`
- `tool`
- `connector`
- `model`
- `service`

An Agent Registry entry can be synchronized into the Capability Registry without exposing its connection credentials.

## 3. Capability status

Each capability has one of these states:

- `declared` — advertised by the participant or configuration, not independently verified;
- `verified` — a successful ARCA conformance verification exists for the exact capability fingerprint;
- `degraded` — a conformance verification failed or the capability is currently unreliable;
- `unavailable` — intentionally disabled or unavailable;
- `unknown` — status cannot currently be determined;
- `verification-needed` — a formerly verified capability changed environment/fingerprint and must be tested again.

A participant cannot self-promote a capability to `verified`. Registration always starts from a non-authoritative declaration. `verified` is reachable only through `recordVerification()`.

## 4. Capability Passport

Format: `arca-capability-passport-v1`.

Example:

```json
{
  "format": "arca-capability-passport-v1",
  "participantId": "agent.local.coder",
  "kind": "agent",
  "provider": "local",
  "model": "example-v1",
  "source": "agent-registry",
  "descriptorHash": "...sha256...",
  "capabilities": [
    {
      "id": "code.generate",
      "version": "1",
      "status": "verified",
      "input": ["text", "code"],
      "output": ["text", "code"],
      "networkRequired": false,
      "humanReviewRequired": true,
      "riskClass": "medium",
      "fingerprint": "...sha256...",
      "verifiedAt": "2026-09-17T14:00:00.000Z"
    }
  ],
  "updatedAt": "2026-09-17T14:00:00.000Z"
}
```

The passport intentionally contains no password, API key, bearer token, OAuth token or `credentialRef`.

## 5. Fingerprints and invalidation

A capability fingerprint binds the capability contract to the participant environment:

- participant ID;
- participant kind;
- provider;
- model identifier when known;
- non-secret labels;
- capability version and structural metadata.

If that fingerprint changes, a previously verified capability becomes `verification-needed`. This prevents a verification obtained for one model/runtime from silently carrying over to another.

## 6. Verification records

Format: `arca-capability-verification-v1`.

A verification record stores:

- participant ID;
- capability ID;
- capability fingerprint;
- verifier ID;
- timestamp;
- `passed`/`failed` outcome;
- optional SHA-256 of external test evidence;
- bounded non-secret notes;
- hash of the previous verification record;
- hash of the current record.

The verification history is therefore tamper-evident without storing prompts, credentials or sensitive payloads in the verification ledger.

## 7. Compatibility search

`findCompatible()` defaults to participants whose requested capabilities are `verified`.

Declared capabilities can be included explicitly for planning/discovery, but that does not make them trusted or authorized.

The registry snapshot explicitly returns:

```json
{"authorizationIncluded": false}
```

Authorization remains a separate Policy Engine / execution-boundary responsibility.

## 8. Agent Registry integration

`syncAgentRegistry()` imports sanitized public descriptors returned by the existing Agent Registry. Every imported agent capability begins as `declared` unless a matching verification already exists for the same fingerprint.

This gives ARCA a unified catalog while preserving the distinction:

```text
Agent Registry        -> identity / routing descriptor
Capability Registry   -> capability inventory / verification state
Policy Engine         -> authorization
Machine Bridge        -> execution
Human Review          -> sensitive decision authority
```

## 9. Conformance tests

The registry test suite covers:

- self-declared `verified` being downgraded to `declared`;
- successful verification promotion;
- chained verification hashes;
- tamper detection;
- model/environment change invalidation;
- verified-only compatibility lookup by default;
- Agent Registry synchronization without credential leakage;
- rejection of credential-like metadata.

## 10. Implemented capability extensions

The backend now also includes:

- `CapabilityProbeRegistry` for closed synthetic conformance probes;
- `runCapabilityProbe()` with bounded timeout, no persisted raw output and hash-backed verification;
- a built-in `json.structured-output` probe;
- `detectCapabilityGaps()` for missing/degraded/unverified capability analysis;
- `buildCapabilityPlan()` for dependency-safe capability DAG planning without execution or authorization.

See `docs/ARCA_CAPABILITY_PLANNER_PROBES_V1.md`.

## 11. Next extensions

Recommended follow-on work:

- richer provider/agent-specific safe conformance probes;
- `/arca/capabilities` AAP endpoint for richer remote passports;
- capability expiry/reverification policies;
- worker capability synchronization;
- health/reliability observations kept separate from capability semantics;
- higher-level task decomposition into a capability DAG;
- Privacy Classification + Publication Gate before public export.

The current foundation still stops before automatic capability execution or automatic trust promotion.
