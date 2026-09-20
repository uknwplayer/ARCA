# Live A2A Discovery Validation v0.1

## Goal

Prove the next boundary after Agent Discovery Fabric and the A2A adapter:

```text
ARCA
  -> public Internet
  -> known A2A server origin
  -> GET /.well-known/agent-card.json
  -> normalize Agent Card
  -> Candidate Registry
  -> UNTRUSTED / DECLARED / NOT-ADMITTED
```

This validation deliberately stops before identity verification, capability verification, admission, runtime binding or task execution.

## Workflow

GitHub Actions workflow:

```text
ARCA Live A2A Discovery Validation
```

Inputs:

- `origin`: clean HTTPS origin of the A2A server;
- `allowed_agent_origins`: optional comma-separated allowlist for a card that advertises an interaction endpoint on a different origin.

The default target is `https://a2aregistry.org`, a public A2A registry whose project documents an A2A Agent Card and a public agent directory. The workflow treats that target only as a public network validation endpoint, not as a trust root.

## Evidence

Successful output contains only bounded metadata:

- source origin;
- candidate key;
- advertised ID and provider;
- protocol;
- discovery/trust/admission states;
- declared capability count and SHA-256 digest;
- advertised endpoint origin;
- explicit `candidateExecuted=false`;
- explicit `trustGranted=false`;
- explicit `admissionGranted=false`;
- explicit `dispatchAuthorized=false`.

The raw Agent Card is not persisted by the validation script.

## Safety

The live workflow:

- requires HTTPS;
- refuses loopback;
- refuses credentials, query strings, fragments and path-bearing origins;
- refuses redirects through the A2A adapter;
- does not send credentials;
- does not POST to or execute the discovered agent;
- preserves the Agent Discovery Fabric trust boundary.

A successful run demonstrates **public discovery**, not trustworthiness or usability of the discovered agent.
