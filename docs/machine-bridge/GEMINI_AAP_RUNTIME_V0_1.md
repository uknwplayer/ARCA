# Gemini AAP Runtime v0.1

## Status

Bounded provider integration for synthetic validation.

This milestone places Google Gemini behind the existing ARCA Agent Protocol (AAP) boundary instead of coupling ARCA Core directly to a model vendor.

```text
ARCA
  -> Cognitive Substitution
  -> Agent Gateway / AAP
  -> Gemini AAP Runtime
  -> Gemini Developer API
```

## Provider boundary

The provider client is pinned to:

`https://generativelanguage.googleapis.com`

The runtime uses the Gemini `generateContent` REST surface with the `x-goog-api-key` request header.

The credential is accepted only at runtime through `ARCA_GEMINI_API_KEY` or `GEMINI_API_KEY`. It is not stored in ARCA participant descriptors, receipts, test fixtures, logs, or repository files.

Default model:

`gemini-3.8-flash`

Synthetic validation defaults:

- `maxOutputTokens=1024`;
- `thinkingLevel=low`.

The larger output envelope avoids starving a thinking-capable model before it can emit visible text, while `low` keeps the synthetic validation cheap and latency-bounded.

The model can be overridden through an explicit runtime configuration value that must match a bounded model-ID grammar.

## AAP runtime

The runtime exposes the same surface used by other external ARCA agents:

- `GET /arca/agent`;
- `POST /arca/jobs`;
- local `GET /health` for process health.

Descriptor capabilities:

- `reasoning`;
- `research`.

Provider output is wrapped into an `arca-agent-result-v1` result. ARCA receives correlation, provider/model identity, text, bounded usage metadata, and a human-review requirement.

## Synthetic-only default

v0.1 defaults to **synthetic-only** execution.

A task must explicitly carry `context.synthetic=true` or `context.arcaSynthetic=true`.

This is intentional. The initial live provider validation must not send investigations, personal data, private documents, credentials, or other sensitive material to a third-party free-tier endpoint.

Non-synthetic operation requires an explicit host-side override and is outside the initial validation scope.

## Failure behavior

The provider adapter:

- refuses redirects;
- uses a bounded timeout;
- caps provider response bytes;
- caps output tokens;
- rejects empty text candidates;
- emits sanitized HTTP/provider status errors;
- emits bounded diagnostics for provider status, HTTP status, finish reason and token counters;
- does not include provider error messages, raw provider output, prompts or credentials in diagnostics.

The runtime does not implement a hidden retry loop.

Existing Cognitive Substitution semantics remain authoritative:

```text
provider/runtime unavailable before dispatch -> another eligible runtime may be selected
failure after dispatch begins               -> no implicit post-start failover
```

## Live validation workflow

`.github/workflows/arca-live-gemini.yml` is manual-only through `workflow_dispatch`.

It requires the repository secret:

`ARCA_GEMINI_API_KEY`

The workflow:

1. starts the Gemini AAP runtime as a separate local process;
2. performs the AAP descriptor handshake;
3. registers the live runtime in Agent Gateway;
4. runs a synthetic Role Conformance fixture through the real Gemini API;
5. binds the verified participant to the Agent Gateway runtime;
6. executes one synthetic Cognitive Substitution call;
7. prints only bounded metadata, the signed receipt hash, and a SHA-256 hash of model output.

The raw model output is not intentionally printed or persisted by the validation script.

## Credential setup

Create/manage the Gemini credential in Google AI Studio, then store it as a GitHub Actions repository secret named `ARCA_GEMINI_API_KEY`.

Do not commit the credential, place it in workflow YAML, send it in chat, or place it in an AAP descriptor.

Current Google documentation:

- https://ai.google.dev/gemini-api/docs/generate-content/api-key
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits

## Scope

This milestone proves one real model provider behind AAP.

It does not yet prove:

- cross-provider Gemini -> Claude/GPT failover;
- automatic provider discovery;
- production use of personal or investigative data;
- state transfer between models;
- provider-side exactly-once execution;
- Creator code-mutation authority.
