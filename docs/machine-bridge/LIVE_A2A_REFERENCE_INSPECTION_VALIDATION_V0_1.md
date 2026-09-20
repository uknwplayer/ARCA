# Live A2A Reference Inspection Validation v0.1

## Goal

Close the first end-to-end discovery path from an unknown registry hit to a normalized ARCA discovery candidate without granting trust or execution.

```text
Registry Search
  -> Registry Resolution
  -> Reference Classification
  -> direct Agent Card only
  -> bounded GET
  -> A2A normalization
  -> Candidate Registry
  -> UNTRUSTED / DECLARED / NOT-ADMITTED
```

## Reference classes

v0.1 distinguishes:

- `direct-agent-card`: exact HTTPS `/.well-known/agent-card.json`; eligible for automatic inspection;
- `github-repository`: clean `github.com/<owner>/<repo>` reference; classified only, not fetched by the A2A HTTP adapter;
- `generic-https-reference`: recorded but not automatically inspected.

A repository reference requires a separate repository-aware resolver because repository HTML is not an Agent Card.

## Safety

- HTTPS only;
- loopback refused;
- credentials, query strings and fragments refused;
- direct Agent Card fetch is GET-only;
- redirects refused by the A2A adapter;
- response size bounded;
- raw Agent Card is not persisted by the validation;
- no task is sent to the advertised runtime;
- candidate enters only as `UNTRUSTED / DECLARED / NOT-ADMITTED`;
- no trust, admission or dispatch authority is granted.

A successful run proves inspection and normalization, not trustworthiness or operational approval.
