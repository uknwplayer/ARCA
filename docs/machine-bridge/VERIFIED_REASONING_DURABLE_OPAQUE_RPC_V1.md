# Verified Reasoning over Durable Opaque RPC V1

## Objective

This milestone connects the provider-independent Reasoning Capability Contract to the restart-safe encrypted Machine Bridge path.

The end-to-end flow is:

```text
verified reasoning capability
    -> Privacy Classification
    -> verified opaque transport attestation
    -> Secure Reasoning Transport Gate
    -> Reasoning Provider Contract V1
    -> Durable Opaque RPC origin handoff
    -> relay A exits
    -> relay B later resumes
    -> verified reasoner endpoint decrypts
    -> provider result encrypted back
    -> relay B/A later resume reverse route
    -> origin later decrypts
    -> ARCA reasoning result + execution evidence
```

No relay needs plaintext and no process has to remain alive while the next hop executes.

## Durable origin client

`DurableOpaqueRpcOriginClient` adds the missing origin-side lifecycle around the existing durable relay continuation.

It uses:

- `GitHubOpaqueRpcMailboxTransport`;
- `DurableOpaqueRpcRelayContinuation`;
- signed receipts;
- trusted Mesh identities;
- Mesh Encrypted Envelope V1.

The client requires strict signed receipts and a trust store.

### submit

`submit(...)`:

1. checks for an already completed terminal result;
2. checks whether the entry relay already has a continuation for the same request;
3. refuses correlation/recipient drift;
4. creates the encrypted request only when no durable execution already exists;
5. hands it to the entry relay using `forwardAndReturn`;
6. returns immediately.

A repeated call with the same request while it is pending reuses the existing encrypted request metadata rather than creating another randomized encrypted packet.

### collect

`collect(requestId)`:

1. loads the verified terminal encrypted result;
2. checks origin/payload/recipient correlation;
3. decrypts only at the origin with the reply private key;
4. returns the plaintext output plus hash-only execution evidence.

The reply private key is never persisted into Git.

### runOrPend

`runOrPend(...)` is designed for callers that can be retried by a higher-level continuation runtime.

If no terminal result exists:

- the request is durably submitted;
- `DurableOpaqueRpcPendingError` is thrown;
- the error is explicitly retryable;
- the caller does not wait for downstream relays.

A later retry can happen in a different process. It first checks durable state and collects the result when available.

This is a store-and-return contract, not long-lived polling.

## Reasoning adapter

`DurableOpaqueReasoningProviderAdapter` implements the send adapter expected by `ReasoningProviderRegistry`.

It refuses execution unless the Secure Reasoning Transport decision:

- is allowed;
- is `opaque-relay`;
- contains a valid bound opaque transport attestation hash.

The exact standardized `arca-reasoning-request-v1` object is the encrypted payload.

The endpoint must return `arca-reasoning-provider-result-v1`.

The existing Reasoning Provider runtime still validates:

- requestId;
- payloadId;
- completed status;
- output bounds;
- Human Review preservation;
- zero Core mutation.

## Verified runner

`runVerifiedDurableOpaqueReasoning(...)` adds the capability/policy layer around the adapter.

Before dispatch it requires:

1. provider exists in `ReasoningProviderRegistry`;
2. provider uses the exact opaque transport profile supplied by the host;
3. Capability Passport has `reasoning=verified`;
4. passport provider/model/transport still match the provider descriptor;
5. `purposeConfirmed=true`;
6. `providerVerified=true`;
7. `privateProcessingAuthorized=true`.

It then creates the request-bound Opaque Reasoning Transport Attestation and calls the Reasoning Provider runtime.

The helper does not invent these authorizations.

## Execution evidence

After a successful terminal collection, ARCA produces:

`arca-durable-opaque-reasoning-evidence-v1`

Evidence contains only public/hash metadata:

- requestId / payloadId;
- endpoint node;
- request packet hash;
- request envelope hash;
- response envelope hash;
- result hash;
- recipient identity/key fingerprint;
- forward/reply routes;
- response plaintext hash from local decryption proof;
- Secure Reasoning Transport decision hash;
- opaque transport attestation hash;
- evidence hash.

It also records verified runtime properties:

- signed receipts verified;
- trusted recipient identity;
- durable continuation used;
- ciphertext-only protocol path;
- semantic output not persisted by the adapter;
- no Core mutation;
- Human Review required.

The evidence object does **not** contain the reasoning request or model output.

## Restart proof

The integration test models:

```text
origin submits private reasoning
  -> origin call returns pending

origin retries before downstream
  -> same encrypted request is reused

relay B starts later
  -> forwards and exits

reasoner endpoint starts later
  -> decrypts exact Reasoning Request V1
  -> produces Reasoning Provider Result V1
  -> encrypts response
  -> exits

relay B restarts
  -> reverse handoff and exits

relay A restarts
  -> terminal encrypted result and exits

origin/Reasoning runtime restarts
  -> collects/decrypts terminal result
  -> returns verified ARCA reasoning result
```

The simulated complete Git store is inspected and does not contain representative private input or output plaintext.

## Privacy gate binding

The Reasoning Transport Decision now records the valid opaque transport attestation hash.

This binds:

```text
exact standardized request payload hash
  -> privacy classification hash
  -> opaque transport profile hash
  -> cryptographic-path attestation hash
  -> transport decision hash
  -> actual encrypted execution evidence hash
```

Transport privacy and execution/capability authorization remain separate.

## Security boundaries

This milestone does not:

- make every Mesh node trustworthy;
- provide Sybil resistance;
- authorize arbitrary Machine Bridge actions;
- allow shell execution;
- permit direct Core mutation;
- bypass Human Review;
- publish model output;
- guarantee globally exactly-once model invocation if the endpoint dies after inference but before encrypted result persistence;
- persist reasoning plaintext in Git;
- persist private keys in Git.

Endpoint reasoning should remain side-effect-free or independently idempotent.

## Product effect

ARCA can now represent and execute a private reasoning request through a verified, encrypted, restart-safe multi-hop path while preserving provider independence.

A ChatGPT/OpenAI session is no longer an architectural requirement for this reasoning path. A compatible local model, private provider, or independently operated verified Mesh reasoner can implement the same contract.

The next product integration is to let the Creator Console and Autonomy Workflow submit these durable reasoning calls as first-class pending work rather than surfacing a retryable pending exception directly.
