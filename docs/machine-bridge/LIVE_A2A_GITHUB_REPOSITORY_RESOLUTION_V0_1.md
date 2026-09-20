# Live A2A GitHub Repository Resolution v0.1

## Goal

Close the repository-aware branch discovered by A2A Registry resolution without treating repository HTML as Agent Card JSON.

```text
A2A Registry
  -> GitHub repository reference
  -> GitHub public API
  -> repository metadata
  -> probe bounded known Agent Card paths only
  -> validate Agent Card
  -> advertised endpoint origin policy gate
  -> A2A normalization
  -> Candidate Registry
  -> UNTRUSTED / DECLARED / NOT-ADMITTED
```

## Known Agent Card paths

v0.1 probes only:

1. `agent-card.json`
2. `.well-known/agent-card.json`

No recursive repository crawl is performed.

## External endpoint policy

An Agent Card stored in GitHub can advertise an unrelated runtime origin. Repository discovery does not authorize that origin.

The resolver therefore requires the advertised endpoint origin to appear in an explicit host-provided allowlist before creating a Candidate Registry entry.

If the origin is not authorized, the card may be inspected and hashed but the resolver stops with `endpoint-authorization-required`.

## Network boundary

v0.1 contacts only `https://api.github.com` while resolving repository contents.

The advertised agent runtime is never contacted by this resolver.

## Safety state

A created candidate remains:

```text
trustState = untrusted
capabilityState = declared
admissionState = not-admitted
candidateExecuted = false
trustGranted = false
admissionGranted = false
dispatchAuthorized = false
rawAgentCardPersisted = false
```

A successful validation proves repository-aware discovery and normalization, not identity, capability verification, trust, admission, or execution.
