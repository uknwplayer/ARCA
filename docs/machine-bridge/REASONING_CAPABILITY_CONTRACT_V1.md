# Reasoning Capability Contract V1

## Objective

Reasoning Capability Contract V1 gives ARCA a provider-independent contract for semantic reasoning without giving a model direct authority over the Core, Machine Bridge actions or publication.

The path is:

```text
caller / autonomous workflow
    -> ReasoningProviderRegistry
    -> standard reasoning request
    -> Secure Reasoning Transport Gate
    -> selected provider adapter
    -> correlated provider result
    -> bounded ARCA reasoning result
    -> Human Review / downstream policy
```

A provider can be local, a direct remote service or, later, a verified Mesh node. The higher-level contract does not depend on OpenAI, Anthropic, Gemini, Ollama, a particular HTTP endpoint or a particular model.

## Contracts

V1 adds these formats:

- `arca-reasoning-provider-v1`
- `arca-reasoning-request-v1`
- `arca-reasoning-provider-result-v1`
- `arca-reasoning-result-v1`
- `arca-reasoning-probe-result-v1`

### Provider descriptor

A public provider descriptor contains:

- provider ID, provider name and optional model;
- participant kind: model, service or agent;
- transport ID/hash/kind;
- whether the provider is external;
- timeout and maximum output size;
- capability `reasoning`;
- immutable descriptor hash.

It intentionally does not contain:

- endpoint credentials;
- API keys/tokens;
- private keys;
- authorization headers;
- provider handler code.

The runtime keeps the concrete send function outside the descriptor.

### Reasoning request

A request contains:

- `requestId`;
- `payloadId`;
- bounded instruction;
- bounded JSON context;
- response format: `text` or `json`;
- `humanReviewRequired=true`;
- `coreMutationAllowed=false`.

The exact request object is passed through Secure Reasoning Transport Gate before the provider is invoked. The gate binds the exact outbound payload hash to the Privacy Classification and transport profile.

### Provider result

Provider adapters must return:

- matching `requestId`;
- matching `payloadId`;
- `status=completed`;
- bounded JSON output;
- `humanReviewRequired=true`;
- `coreMutationPerformed=false`.

Correlation mismatch, oversized output or a provider claiming direct Core mutation fails closed.

### ARCA reasoning result

The normalized result contains:

- provider and transport decision references/hashes;
- exact request payload hash;
- bounded output;
- `outputPersisted=false`;
- `privacyReclassificationRequired=true`;
- `humanReviewRequired=true`;
- `coreMutationPerformed=false`.

`privacyReclassificationRequired=true` is important: semantic reasoning can create new inferences even when the source context had a lower privacy class. The output must be reclassified before durable storage, publication or broader routing.

## Provider registry

`ReasoningProviderRegistry` is a runtime registry, not a scheduler.

It:

- registers a provider descriptor plus a concrete send adapter;
- exposes only public descriptors through `list()` / `getDescriptor()`;
- runs a provider only when a provider ID is explicitly chosen;
- does not rank models;
- does not decide authorization;
- does not automatically enable external providers.

Provider selection remains a separate Capability Planner / policy concern.

## Capability Registry integration

`registerReasoningProviderCapability()` registers a provider into the existing Capability Registry with:

- capability `reasoning`;
- version 1;
- JSON input/output;
- network requirement derived from the transport;
- Human Review required;
- medium risk class.

The initial state is `declared`, not `verified`.

A provider does not become trusted merely by registering itself.

## Conformance probe

`probeReasoningProviderCapability()` runs a synthetic public probe:

- no investigation data;
- no personal data;
- deterministic arithmetic task;
- deterministic marker `ARCA-REASONING-PROBE-V1`;
- expected result `2 + 3 = 5`.

A passing result promotes the existing Capability Registry record via `recordVerification()`. A failing result degrades it.

The probe result stores:

- pass/fail;
- execution state;
- evidence hash;
- verification record hash.

It does **not** persist the raw provider output.

This probe validates minimal contract/conformance behavior. It is not a general intelligence score and does not certify factual reliability for arbitrary tasks.

## External provider identity boundary

For an external provider, reasoning conformance verification requires a separate prior assertion that the endpoint/provider identity has been verified.

This avoids a circular trust claim:

```text
unknown endpoint
  !=
verified reasoning provider
```

Transport/endpoint identity and reasoning capability are separate trust dimensions.

Future Mesh identity/signature work should supply this prerequisite cryptographically.

## Timeout and resource bounds

Each provider descriptor has:

- timeout: 1–120 seconds;
- maximum output bytes: 1 KiB–512 KiB.

The runtime aborts the provider adapter on timeout and clears the timer when the provider returns.

Input instruction/context are bounded before dispatch.

These bounds complement Autonomy Workflow Guardrails. They do not replace workflow-level retry/cost/deadline budgets.

## Security boundaries

Reasoning Capability Contract V1 does not:

- allow arbitrary shell execution;
- create Machine Bridge action names dynamically;
- mutate the ARCA Core;
- authorize publication;
- bypass Human Review;
- expose credentials in provider descriptors;
- make repository-backed transport suitable for private reasoning;
- automatically trust a provider's self-declared capabilities;
- automatically select the "best" provider;
- claim that a synthetic conformance probe measures model quality.

Secure Reasoning Transport Gate remains mandatory for the actual outbound payload.

## Creator Chat

Creator Chat already requests capability `reasoning`, but external reasoning must not be enabled merely because a provider exists.

The intended integration is:

```text
Creator Chat
  -> explicit provider/capability selection
  -> verified reasoning provider
  -> Secure Reasoning Transport Gate
  -> Reasoning Capability Contract V1
  -> result
  -> existing Creator/Human Review boundary
```

This should be integrated as a separate small change rather than silently changing existing Creator Chat behavior.

## Autonomous Workflow

A future reviewed capability-to-recipe policy can add a `reasoning` workflow step.

That step should require:

1. verified `reasoning` capability;
2. explicit provider/route policy;
3. Secure Reasoning Transport Gate approval for the exact payload;
4. workflow retry/deadline budget;
5. Human Review when policy or output requires it.

The model remains a reasoning participant, not an authority over the workflow engine.

## Mesh evolution

The contract is already transport-independent.

For Mesh reasoning, remaining prerequisites are:

- cryptographically signed node identity;
- signed capability advertisements;
- verified endpoint identity;
- enforceable end-to-end encrypted payload envelope;
- replay protection;
- opaque relays that can route without reading payloads;
- resource/cost budgets;
- result receipts/attestations.

Once those exist, a Mesh node can implement the same Reasoning Capability Contract without changing ARCA's higher-level reasoning API.
