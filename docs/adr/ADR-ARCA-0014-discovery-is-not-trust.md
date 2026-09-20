# ADR-ARCA-0014 — Discovery is not trust

**Status:** Proposed for Agent Discovery Fabric v0.1  
**Date:** 2026-09-19

## Context

ARCA can now execute a real external Gemini runtime through AAP, Role Conformance and Cognitive Substitution. The next architectural requirement is to discover candidate agents and workers that were not manually embedded in the local runtime configuration.

Open discovery creates a trust-boundary problem: remote catalogs, registries and self-advertisements are statements by third parties. They cannot be treated as verified capabilities or as authorization.

## Decision

ARCA introduces a separate Discovery Candidate Registry.

Every newly discovered candidate enters with exactly these states:

```text
trustState = untrusted
capabilityState = declared
admissionState = not-admitted
```

Discovery sources cannot change these states.

Discovery does not automatically register a candidate in the Capability Registry, create a runtime binding, run a task, grant Creator authority or make a federation peer trusted.

v0.1 accepts only explicit static sources and host-authorized ARCA HTTP(S) catalogs. External catalog origins are allowlisted, redirects are refused, responses are bounded and secret-like fields are rejected.

## Consequences

### Positive

- internet-facing discovery can evolve independently of trust and execution;
- self-advertised capability claims remain visibly unverified;
- source provenance is preserved;
- a malicious or stale catalog cannot directly become an execution path;
- future A2A, MCP, ARCA federation and rendezvous adapters can target one normalized candidate layer.

### Cost

- discovery alone cannot execute anything;
- a second verification/admission pipeline is required before use;
- v0.1 does not perform broad internet crawling or decentralized rendezvous.

## Future work

Protocol-specific adapters may add A2A cards, MCP registries, ARCA signed advertisements and later rendezvous mechanisms.

Before open arbitrary-URL crawling, ARCA should add stronger DNS/IP resolution controls, rebinding resistance, source reputation/admission policy and Sybil-aware network design.

## Non-goals

This ADR does not authorize:

- automatic trust;
- automatic capability verification;
- automatic federation enrollment;
- automatic dispatch;
- post-start failover;
- code mutation;
- Creator authority delegation;
- hidden phone-home behavior.
