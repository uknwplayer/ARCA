# Live A2A Registry Search Validation v0.1

## Goal

Prove the boundary immediately after live A2A endpoint discovery:

```text
ARCA
  -> public Internet
  -> host-authorized A2A Registry API
  -> GET /public/agents?q=<query>
  -> bounded search hits
  -> UNTRUSTED REFERENCES
  -> stop
```

This stage intentionally does **not** fetch arbitrary third-party Agent Cards and does not create executable discovery candidates.

## Why a separate search stage exists

A registry listing is a third-party statement about another system. Search results may contain identifiers, names and manifest references, but those values are not capability verification, identity verification, admission or authorization.

The search stage therefore records references only. A later explicit resolution stage may fetch a selected or policy-authorized Agent Card and pass it through the existing A2A discovery adapter.

## Public endpoint

The initial provider is the Global A2A Registry public search API:

```text
GET https://api.a2a-registry.org/public/agents
```

The API origin remains host-authorized. Network access is disabled by default in the adapter.

## Search hit state

Every returned hit is forced to:

```text
trustState = untrusted
admissionState = not-admitted
candidateCreated = false
candidateExecuted = false
trustGranted = false
admissionGranted = false
dispatchAuthorized = false
```

Registry ranking, verification badges or other provider-side metadata cannot override these states.

## Safety

v0.1:

- requires an explicit clean HTTPS API origin;
- refuses loopback;
- requires the API origin in a host allowlist;
- refuses redirects;
- bounds response size and hit count;
- sends no credential;
- performs GET only;
- does not fetch returned third-party manifest URLs;
- does not create Candidate Registry entries;
- does not execute agents;
- grants no trust, admission or dispatch authority.

A successful live run demonstrates **searchability of the open agent ecosystem**, not trustworthiness or usability of any returned agent.
