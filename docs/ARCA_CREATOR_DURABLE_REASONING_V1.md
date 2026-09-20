# Creator Durable Reasoning V1

## Objective

Creator Durable Reasoning V1 connects the local Creator Console to the first-class Durable Reasoning Pending lifecycle.

The Creator experience becomes:

```text
Creator sends private request
  -> verified reasoning capability
  -> encrypted durable Mesh handoff
  -> HTTP response: pending
  -> browser may close
  -> relays/reasoner finish later
  -> Creator reconnects
  -> pending list is recovered
  -> status reaches result-ready
  -> collect decrypts only at origin
  -> result shown
  -> privacy reclassification + Human Review remain required
```

A long-running ChatGPT response is no longer required for the architectural path.

## Strong-session requirement

Durable private Creator reasoning is external/private processing.

Therefore `createCreatorDurableReasoningHandlers(...)` requires the Creator session to be:

- WebAuthn/passkey; or
- hardware-key authenticated.

A local bootstrap session cannot:

- start durable private reasoning;
- query its status;
- collect its result;
- list pending private reasoning requests.

This prevents the low-privilege bootstrap from becoming a route for private external reasoning.

## Creator classification

Each Creator message is classified conservatively before handoff:

- source: user-provided;
- subject type: mixed;
- privacy class: restricted;
- private communication: true;
- purpose: Creator Chat durable private reasoning.

Only a minimized context is submitted to the Reasoning Contract:

- message as instruction;
- deterministic payload ID derived from requestId;
- channel marker `arca-creator-console`.

The handler does not send:

- ARCA_HOME;
- local filesystem paths;
- Creator subject;
- session token;
- passkey material;
- bootstrap code.

## HTTP lifecycle

Creator Console adds optional asynchronous chat hooks.

### POST /api/chat

When a chat handler returns a lifecycle state other than `completed`, the outer response is:

- `status=pending`;
- `reasoningState=<lifecycle state>`.

For the durable reasoning adapter, the initial state is normally:

`awaiting-reasoning`.

### GET /api/chat/status?requestId=...

Requires an authenticated Creator session and `state.read` authorization.

The durable handler also independently requires a strong session.

The response contains only lifecycle/control metadata.

### GET /api/chat/pending

Returns the current hash-only pending request list for hosts that expose a pending-list handler.

The durable Creator integration again requires a strong session.

This route allows a new browser session to rediscover pending work without depending on browser local storage.

### POST /api/chat/collect

Requires `creator.chat` authorization.

When terminal ciphertext is available, the handler:

1. decrypts only at the origin;
2. reconstructs the verified reasoning result;
3. returns semantic output to the authenticated Creator;
4. leaves only hash/evidence metadata in the durable pending record.

## Browser behavior

The Creator browser shell understands `pending` chat responses.

While open, it polls the authenticated status endpoint at a bounded interval.

When the state becomes `result-ready`:

- it calls the explicit collect endpoint;
- displays the semantic result;
- stops polling that request.

On refresh/reconnect with a strong session:

- the browser requests `/api/chat/pending`;
- recreates watchers for each pending request.

The server remains the durable source of truth; browser state is not required for recovery.

## Workbench composition

New export:

`@arca/workbench/creator-durable-reasoning`

Factory:

`createCreatorConsoleWithDurableReasoning(...)`

The host supplies a fully configured `DurableReasoningPendingCoordinator`.

The factory wires:

- chat submit;
- status;
- collect;
- pending list.

It does not auto-create:

- provider credentials;
- node identities;
- Mesh private keys;
- trust pins;
- external authorization.

Those remain deployment responsibilities.

## Security boundaries

Creator Durable Reasoning V1 does not:

- expose Creator Console remotely;
- downgrade WebAuthn requirements;
- store private prompt/output in pending metadata;
- put private plaintext in Git;
- bypass Secure Reasoning Transport Gate;
- bypass verified reasoning capability requirements;
- authorize Core mutation;
- publish model output;
- bypass privacy reclassification;
- bypass Human Review.

Generic Creator Console async hooks are host extension points. The durable reasoning handler itself enforces strong-session and cryptographic/capability policy.

## Product effect

The Creator can submit a private reasoning task and leave.

A later authenticated session can discover that task from ARCA itself, observe its status and collect its result.

This closes the main UX gap between the cryptographic/restart-safe Machine Bridge work and the browser-based Creator Control Plane.
