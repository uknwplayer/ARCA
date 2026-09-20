# Agent Discovery Fabric v0.1

## Purpose

Agent Discovery Fabric introduces the first controlled discovery layer for external agents, tool servers and ARCA nodes.

The objective is to let ARCA learn that a remote capability candidate exists **without turning discovery into trust, verification, admission or execution authority**.

Core rule:

```text
FOUND != TRUSTED
DECLARED != VERIFIED
DISCOVERED != ADMITTED
ADMITTED != AUTHORIZED
```

## Scope

v0.1 supports:

- explicit static seed sources;
- explicit HTTP(S) ARCA discovery catalogs;
- bounded candidate ingestion;
- deterministic candidate keys;
- provenance observations from multiple sources;
- source failure isolation;
- a candidate registry whose records are always `untrusted`, `declared` and `not-admitted`.

An ARCA discovery catalog has format:

```json
{
  "format": "arca-agent-discovery-catalog-v1",
  "version": 1,
  "candidates": [
    {
      "id": "example-agent",
      "kind": "agent",
      "protocol": "aap",
      "endpoint": "https://example.invalid/agent",
      "provider": "example",
      "capabilities": ["research"]
    }
  ]
}
```

The catalog is an announcement mechanism only. It is not a trust root.

## Security boundary

Network discovery is disabled unless the host explicitly enables it.

Non-loopback HTTP is rejected. External catalog origins must be explicitly allowlisted by the host. Redirects are refused. Responses are bounded by time, bytes and candidate count. Secret-like fields are rejected before catalog data can enter the candidate registry.

The discovery layer does not send credentials to candidate endpoints and does not probe candidate endpoints in v0.1.

A source cannot promote its own claim to:

- verified capability;
- trusted identity;
- network admission;
- Creator authority;
- dispatch authorization.

Those decisions remain downstream responsibilities of identity verification, Capability Probes, Role Conformance, admission policy and the existing authorization gates.

## Candidate identity and provenance

The candidate key is deterministic over:

```text
kind + protocol + endpoint + advertisedId
```

Repeated observations of the same identity are deduplicated while preserving source-level provenance.

Capabilities from discovery remain self-declared claims. Multiple source observations may expand the set of declared claims, but nothing in Discovery v0.1 turns them into verified capabilities.

## Pipeline

```text
Known source
  -> Discovery Fabric
  -> Candidate Registry
       state = untrusted
       capability = declared
       admission = not-admitted
  -> future identity/protocol probe
  -> Capability Probe
  -> Role Conformance
  -> admission policy
  -> runtime binding
  -> Cognitive Substitution / Federation
```

## Explicit non-goals

v0.1 does not provide:

- arbitrary web crawling;
- search-engine scraping;
- DHT, gossip or peer-to-peer rendezvous;
- automatic A2A or MCP registry ingestion;
- DNS-rebinding-safe open internet crawling;
- trust-on-first-use;
- automatic candidate probing;
- automatic Capability Registry promotion;
- automatic dispatch;
- automatic Creator authority;
- hidden phone-home behavior.

These exclusions are deliberate. Broader internet discovery must be added through protocol-specific source adapters without weakening the discovery/trust boundary.

## Relationship to ARCA Node Discovery

Agent Discovery Fabric is a generic candidate-ingestion layer.

ARCA Node Discovery & Network Identity, tracked separately, can later use this layer as one source of candidate observations while retaining signed node identity, lineage, challenge-response and federation-specific admission semantics.
