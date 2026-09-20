# Live A2A Registry Resolution Validation v0.1

## Goal

Resolve search-hit identifiers inside the already-authorized public Registry without contacting third-party agent infrastructure.

```text
ARCA
  -> A2A Registry search hit
  -> GET /public/agents/:id
  -> bounded metadata + manifest reference
  -> UNTRUSTED / NOT-ADMITTED
  -> STOP
```

## Boundary

Registry resolution and third-party manifest retrieval are deliberately separate.

A registry may be authorized as a discovery source, but a `manifest_url` returned by that registry points at an independent external origin. v0.1 records that URL only when it is HTTPS and non-loopback. It does not fetch the manifest.

## State

Every resolution remains:

```text
trustState = untrusted
admissionState = not-admitted
candidateCreated = false
candidateExecuted = false
manifestFetched = false
trustGranted = false
admissionGranted = false
dispatchAuthorized = false
```

## Safety

- registry API origin must be a clean HTTPS origin;
- network is disabled by default;
- the registry origin must be explicitly host-authorized;
- redirects are refused;
- response size is bounded;
- only GET is used;
- credentials are not sent;
- unsafe or loopback manifest URLs are discarded;
- returned manifest URLs are not fetched;
- no Candidate Registry entry is created;
- no task or agent execution occurs.

The next independent boundary is third-party Agent Card inspection.
