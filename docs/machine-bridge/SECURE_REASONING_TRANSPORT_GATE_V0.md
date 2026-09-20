# Secure Reasoning Transport Gate V0

## Objective

Secure Reasoning Transport Gate V0 prevents an ARCA reasoning payload from being sent through a transport whose persistence/visibility properties are incompatible with the payload's privacy classification.

This closes a concrete gap between the current autonomy stack and future remote reasoning:

```text
reasoning payload
    -> Privacy Classification
    -> Secure Reasoning Transport Gate
    -> allowed transport only
    -> reasoning provider/node
```

The gate is evaluated **before** the delegate transport/provider is called.

## Why this exists

Machine Bridge currently has durable filesystem and GitHub-backed transports. Those transports are excellent for public jobs, correlation, recovery and auditability, but repository-backed transport writes job/result material into durable repository state.

That is not an acceptable default for private reasoning context.

A reasoning request may contain:

- personal data;
- sensitive/high-risk data;
- private communications;
- adverse inferences;
- user-provided context;
- investigation material that is lawful to process but not lawful or appropriate to persist in Git.

Therefore transport durability is now treated as a security property, not only an availability feature.

## Formats

V0 adds:

- `arca-reasoning-transport-profile-v1`;
- `arca-reasoning-transport-decision-v1`;
- `arca-secure-reasoning-result-v1`.

A transport profile is hash-bound and declares:

- `transportId`;
- kind;
- payload persistence;
- relay visibility;
- encryption mode;
- whether the destination is external;
- optional operator label.

The decision binds:

- `requestId`;
- `payloadId`;
- exact SHA-256 of the transient outbound payload;
- privacy `classificationHash`;
- transport `profileHash`;
- allow/deny result and bounded reason codes.

The decision does not contain the raw reasoning payload.

## Transport kinds

### `local`

Processing remains in the local trusted runtime.

Non-public material may be processed locally when purpose is confirmed. Credentials/secrets remain forbidden as reasoning payload material.

### `private-direct`

Direct external processing over TLS or stronger transport.

V0 requirements:

- endpoint/provider must be verified by the caller's trust layer;
- non-public processing requires explicit private-processing authorization;
- payload persistence declared by the transport must be non-durable;
- relay visibility must be `none`.

This profile is intended for a future verified provider or a directly connected Mesh endpoint.

### `opaque-relay`

A relay advertises metadata-only visibility and end-to-end encryption.

V0 deliberately does **not** authorize non-public reasoning through this profile yet.

The profile is necessary to model the future Mesh path, but a declaration that encryption exists is not enough. Until ARCA has a cryptographic envelope implementation that it can itself verify, non-public payloads fail closed with:

`opaque-relay-private-crypto-not-enforced-v0`.

Public, explicitly approved payloads can use this profile.

### `repository-backed`

Durable repository/mailbox transport such as the current GitHub-backed Machine Bridge path.

V0 permits only payloads that are both:

- effectively public (no private/sensitive indicators); and
- explicitly approved for public transport.

Personal, sensitive, high-risk, restricted or redact-before-publication payloads are rejected even if the repository is private.

This avoids confusing repository access control with a privacy boundary.

## Exact payload binding

The gate receives the actual transient JSON payload and computes its canonical SHA-256.

The supplied Privacy Classification must refer to the same `payloadId`.

A transport decision therefore binds:

`payload -> payloadHash -> classificationHash -> transportHash -> decisionHash`.

Changing the payload after authorization changes the payload hash and requires a new decision.

## Secret handling

The gate rejects:

- any classification with `secretOrCredential=true`;
- payload objects containing secret-like keys such as API keys, bearer tokens, passwords, private keys, cookies or credential fields.

This is defense-in-depth. It does not claim to detect secrets embedded inside arbitrary free text.

Credentials must continue to stay in Credential Vault/Broker boundaries.

## SecureReasoningTransportClient

`SecureReasoningTransportClient` wraps a concrete send function.

It:

1. computes and evaluates the transport decision;
2. throws before network/delegate execution when denied;
3. only calls the delegate for an allowed payload;
4. passes correlation/hash metadata to the delegate;
5. returns a result that remains `humanReviewRequired=true` and `coreMutationPerformed=false`.

The wrapper itself does not persist payloads or results.

## What V0 does not do

V0 does not:

- implement a reasoning model/provider;
- classify arbitrary free text automatically;
- encrypt a Mesh payload;
- implement key exchange;
- prove remote attestation;
- authorize execution of Machine Bridge actions;
- authorize Core mutation;
- bypass Human Review;
- make a GitHub repository suitable for private reasoning payloads;
- claim that TLS alone protects provider-side retention.

Those remain separate controls.

## Integration rule

Any future remote `reasoning` capability must pass through this gate (or a stricter successor) before it may be attached to:

- Creator Chat external reasoning;
- Autonomous Workflow reasoning steps;
- Machine Bridge Direct Call;
- Mesh/Federation reasoning nodes.

Repository-backed reasoning is public-only in V0.

## Next step

The next layer is **Reasoning Capability Contract V1**:

- provider-independent request/result schema;
- verified `reasoning` capability passport/probe;
- transport profile attached to each provider/node;
- Secure Reasoning Transport Gate mandatory before dispatch;
- bounded input/output sizes and timeout;
- no direct Core mutation;
- Human Review preserved.

After that, a cryptographic Mesh envelope can upgrade `opaque-relay` from public-only to private-capable without changing the higher-level reasoning contract.
