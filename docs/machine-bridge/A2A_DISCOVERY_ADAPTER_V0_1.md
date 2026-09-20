# A2A Discovery Adapter v0.1

## Purpose

This adapter lets Agent Discovery Fabric read a **known A2A server origin** through the standard Agent Card well-known endpoint and normalize that card into an ARCA discovery candidate.

The current A2A specification uses:

```text
https://{server_domain}/.well-known/agent-card.json
```

ARCA does not search arbitrary domains in this version. A caller must explicitly supply the origin.

## Boundary

The adapter performs only discovery.

```text
known A2A origin
  -> GET /.well-known/agent-card.json
  -> validate bounded Agent Card
  -> normalize interface + skill claims
  -> Agent Discovery Candidate Registry
  -> UNTRUSTED / DECLARED / NOT-ADMITTED
```

No Agent Card field can grant trust, verified capability, admission, runtime binding, dispatch authorization, federation enrollment or Creator authority.

## A2A versions

The adapter understands the current v1-style `supportedInterfaces[]` shape and the legacy v0.3-style `url` / `preferredTransport` fields.

For v1 cards, the first usable supported interface is treated as the advertised interaction endpoint. The adapter does not invoke that endpoint.

## Skills

A2A skill IDs and tags are preserved only as deterministic **declared** capability labels:

```text
a2a
a2a.skill.<normalized>.<hash>
a2a.tag.<normalized>.<hash>
```

These labels are discovery metadata, not verified ARCA capabilities.

## Network policy

- network access is disabled by default;
- the card origin is explicit;
- HTTP without TLS is allowed only for explicit loopback tests;
- redirects are refused;
- card size and skill count are bounded;
- a card cannot redirect ARCA toward a different runtime origin unless that runtime origin is explicitly allowlisted;
- the adapter never forwards ARCA credentials to the Agent Card endpoint;
- the adapter does not probe or execute the advertised A2A endpoint.

## Why this is the first real adapter

A2A is directly agent-oriented: its Agent Card exists specifically so clients can discover an agent's identity, skills and supported interaction interfaces.

That makes it a closer fit to Agent Discovery Fabric than treating tool registries as if they were agent registries.

MCP Registry support remains useful and is expected as a separate `tool-server` discovery adapter rather than being mislabeled as an agent source.
