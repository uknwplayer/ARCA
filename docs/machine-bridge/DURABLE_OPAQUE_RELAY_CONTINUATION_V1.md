# Durable Opaque Relay Continuation V1

## Objective

Durable Opaque Relay Continuation V1 removes the requirement for an upstream relay process to remain alive while a downstream opaque request is executing.

The previous durable mailbox could survive restarts, but its `remotePeer()` adapter still waited/polled for a terminal result. That wastes a runner and couples liveness to a long-lived process.

V1 changes the lifecycle to:

```text
relay receives encrypted request
  -> append signed forward receipt
  -> persist continuation
  -> enqueue ciphertext to next hop
  -> return immediately / process exits

downstream encrypted reply arrives later
  -> repository dispatch wakes relay
  -> load continuation
  -> append signed reply receipt
  -> enqueue ciphertext reply upstream
  -> mark continuation complete
  -> return immediately / process exits
```

No relay needs request or response plaintext.

## Pure hop transitions

Opaque Mesh RPC now exports two deterministic transition helpers:

- `appendOpaqueRpcForwardHop(...)`
- `appendOpaqueRpcReplyHop(...)`

They apply the existing request/result verification rules, append the correct signed/hash-chained receipt and return the next route state.

This avoids duplicating routing cryptography inside durable transport code.

## Continuation record

Format:

`arca-opaque-rpc-continuation-v1`

Stored under:

`remote-opaque-rpc/continuations/<nodeId>/<requestId>.json`

A continuation binds:

- requestId;
- current relay node;
- upstream node;
- downstream node;
- immutable request packet hash;
- full received route-state hash;
- full forwarded route-state hash;
- received encrypted packet;
- forwarded encrypted packet;
- state: `waiting-reply` or `completed`;
- creation/update timestamps;
- completion result hash;
- continuation hash.

The separate **route-state hashes** matter because `packetHash` intentionally covers immutable request metadata and therefore remains unchanged as signed route receipts are appended.

A mutated stored route cannot inherit the same continuation trust merely because the immutable packetHash still matches.

## Forward handoff

`DurableOpaqueRpcRelayContinuation.forwardAndReturn(...)`:

1. verifies the encrypted request and current signed route;
2. optionally claims the queued request;
3. appends this relay's signed forward receipt;
4. persists the continuation before handoff;
5. enqueues the encrypted packet to the signed next node;
6. triggers the downstream wake event;
7. returns `arca-opaque-rpc-handoff-v1` immediately.

The handoff result explicitly marks `returnedImmediately=true`.

For a local first relay, `claimQueued=false` may be used because no durable inbound queue exists yet. Remote relay processors should claim their queue item.

## Reply mailbox

Encrypted partial replies are stored under:

`remote-opaque-rpc/replies/<nodeId>/<requestId>.json`

Format:

`arca-opaque-rpc-reply-mailbox-v1`

The wrapper binds:

- target node;
- requestId;
- request packet hash;
- current encrypted result hash;
- queued timestamp;
- request packet;
- encrypted partial result;
- wrapper hash.

The target node must equal the signed `nextNode` of the latest reply receipt.

A wake event:

`arca_opaque_rpc_reply_available`

contains only target ref, node ID and request ID.

## Reply claims

Concurrent continuation processors are controlled through:

`remote-opaque-rpc/reply-claims/<nodeId>/<requestId>.json`

Format:

`arca-opaque-rpc-reply-claim-v1`

The lease binds the exact reply wrapper/result hash, processor, attempt and expiry.

An active lease excludes another continuation worker. After lease expiry, another worker may resume with an incremented attempt.

## Reverse continuation

`resumeReplyAndReturn(...)`:

1. loads and integrity-verifies the stored continuation;
2. returns idempotently when already completed;
3. claims the encrypted reply;
4. verifies the downstream partial result;
5. appends this relay's signed reverse receipt;
6. either:
   - enqueues the encrypted reply to the upstream relay, or
   - writes the complete terminal encrypted result when upstream is the origin;
7. marks the continuation completed with the exact result hash;
8. returns immediately.

The exact forward route is therefore unwound one independently wakeable node at a time.

## Endpoint store-and-return

`processDurableOpaqueRpcEndpoint(...)`:

- claims the endpoint queue;
- checks whether an identical downstream reply/terminal result already exists;
- executes the configured Opaque RPC endpoint only when needed;
- persists the encrypted reply or terminal result;
- returns immediately.

There remains a narrow at-least-once execution window if a process dies after the host handler finishes but before its encrypted result is durably persisted.

Therefore V1 endpoint handlers used with this continuation path must be side-effect-free or independently idempotent. A reasoning provider is a suitable target; arbitrary financial/system side effects are not.

## Idempotency

V1 provides idempotency at the durable message/continuation layers:

- repeated queue enqueue of the same packet does not duplicate it;
- active claims are exclusive;
- stored continuation identity conflicts fail closed;
- duplicate reply wake after completed continuation returns the same completion result hash;
- duplicate terminal persistence is accepted only when the existing result hash matches.

This is not a claim of globally exactly-once execution.

## Restart proof

The tests model:

```text
origin
  -> relay A process starts, persists handoff, exits
  -> relay B process starts later, persists handoff, exits
  -> endpoint process starts later, produces encrypted response, exits
  -> relay B restarts on reply wake, forwards encrypted reply, exits
  -> relay A restarts on reply wake, writes terminal result, exits
  -> origin starts later and decrypts terminal result
```

No prior process remains alive while the next stage executes.

The final route remains:

`relay-a -> relay-b -> reasoner-b`

and the reply route remains:

`reasoner-b -> relay-b -> relay-a`.

## Ciphertext-only continuation state

Tests inspect the complete simulated Git store, including:

- request queues;
- claims;
- continuation records;
- reply queues;
- reply claims;
- terminal results.

Representative private request and response strings are absent from all persisted data.

Continuations contain encrypted packets and public routing/signature metadata only.

## Security boundaries

Durable Opaque Relay Continuation V1 does not:

- persist private keys;
- reveal request/response plaintext to relays or Git;
- make capability discovery equal authorization;
- provide distributed Sybil resistance;
- provide traffic-analysis resistance;
- guarantee globally exactly-once endpoint handler execution;
- persist a cryptographic replay database independent of queue/result state;
- automatically enable a reasoning provider;
- bypass Human Review;
- authorize Core mutation.

## Reasoning transport status

This milestone removes the long-lived relay dependency that previously blocked a safe private opaque reasoning path.

One major integration step still remains before the privacy gate should be opened:

**Verified Reasoning over Durable Opaque RPC V1**

That proof must show that:

1. a currently verified `reasoning` capability is selected;
2. the exact standardized reasoning request is classified before dispatch;
3. the request enters this encrypted continuation path;
4. Git/relay state contains no private plaintext;
5. only the verified reasoning endpoint decrypts;
6. the provider result is encrypted back to origin;
7. the origin reclassifies output;
8. Human Review remains required;
9. Core mutation remains false;
10. the transport attestation is explicit enough for Secure Reasoning Transport Gate to distinguish this path from a merely self-declared `opaque-relay`.

Until that integration is green, generic private `opaque-relay` remains fail-closed.
