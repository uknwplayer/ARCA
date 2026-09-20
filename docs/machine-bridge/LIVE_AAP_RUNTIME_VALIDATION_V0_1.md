# Live AAP Runtime Validation v0.1

## Purpose

This validation moves one step beyond in-process fixtures.

It starts two independent Node.js OS processes that expose the real AAP v1 HTTP surface:

- `GET /arca/agent`;
- `POST /arca/jobs`.

The ARCA Agent Gateway performs the real loopback HTTP handshake and job call. Cognitive Substitution uses its normal Agent Gateway dispatch adapter and the Role Conformance Suite is executed against the live HTTP runtimes.

## What is real in this validation

The following boundaries are exercised rather than mocked:

- separate OS process identity/PID;
- TCP loopback listener on an ephemeral port;
- HTTP request/response parsing;
- AAP descriptor handshake;
- Agent Gateway external-agent registration;
- runtime availability probe;
- Role Conformance execution over Agent Gateway HTTP;
- Cognitive Substitution participant selection;
- exact runtime binding to an AAP agent ID;
- dispatch-time HTTP failure.

The two runtime agents have distinct PIDs and distinct endpoints.

## Scenarios

### Two live runtimes

Both AAP processes are linked through `linkExternalAgent()`, pass Role Conformance through actual HTTP calls, and execute targeted jobs.

### Preferred runtime dies before dispatch

After both runtimes pass conformance, the preferred process is terminated.

The availability probe fails for that exact runtime before dispatch. Cognitive Substitution records it in the signed receipt and selects the still-live backup runtime.

### Preferred runtime fails after dispatch starts

The preferred runtime remains reachable for the availability probe but returns HTTP 503 when the real task reaches `POST /arca/jobs`.

The router returns `ARCA_SUBSTITUTION_EXECUTION_FAILED`.

The backup runtime is not called.

This proves the existing safety rule on a real transport boundary:

```text
pre-dispatch unavailable -> substitution allowed
post-start failure        -> no implicit failover
```

## Important limitation

These are **real AAP runtime processes**, but they are deterministic validation agents rather than commercial or local LLM models.

The validation proves ARCA's network/runtime integration independently of a model vendor.

Direct OpenAI, Anthropic, Gemini, Ollama and similar provider adapters are a separate integration problem and require an implemented adapter plus provider/runtime access. No provider credential is committed or introduced by this validation.
