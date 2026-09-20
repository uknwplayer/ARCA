# Durable Opaque Mesh Mailbox V1

## Objective

Durable Opaque Mesh Mailbox V1 moves the encrypted Opaque Mesh RPC request/response path from an in-memory proof into restart-safe GitHub-backed storage without turning Git into plaintext storage.

The persistence boundary is:

```text
private request
  -> Opaque Mesh RPC encryption
  -> ciphertext-only request packet
  -> GitHub mailbox queue
  -> claim / lease
  -> endpoint processing
  -> ciphertext-only terminal result
  -> GitHub mailbox result
  -> origin recovery + local decryption
```

GitHub may persist routing metadata, public signed key statements, signed hop receipts and ciphertext. It must not persist request/response plaintext.

## Transport

Implementation:

`GitHubOpaqueRpcMailboxTransport`

Default storage root:

`remote-opaque-rpc`

It composes the existing `GitHubMachineBridgeTransport` only as a durable JSON/dispatch primitive. It does not enqueue ordinary V3 plaintext jobs.

## Queue

Requests are stored at:

`remote-opaque-rpc/queues/<nodeId>/<requestId>.json`

The stored value is an already verified:

`arca-mesh-opaque-rpc-request-v1`

packet.

Before persistence the mailbox validates:

- request correlation;
- encrypted-envelope integrity;
- recipient/reply key statements;
- route/receipt chain;
- configured trust policy;
- signed receipt policy;
- expiry.

The mailbox never receives the request decryption private key.

## Signed next-hop binding

Durable routing must not allow a caller to take a valid encrypted packet and place it arbitrarily into another node's queue.

V1 binds the queue destination to the route state:

- initial packets with no forwarding receipt may be enqueued only for the final encrypted target endpoint;
- after a relay has appended a forwarding receipt, the durable target queue must exactly equal that receipt's signed `nextNode`.

This makes the durable handoff consistent with the cryptographically evidenced route.

## Wakeup

Successful enqueue may emit:

`arca_opaque_rpc_available`

through repository dispatch with only:

- target ref;
- target node ID;
- request ID.

No plaintext or decryption key is included in the dispatch event.

## Claim / lease

Claims are stored at:

`remote-opaque-rpc/claims/<nodeId>/<requestId>.json`

Format:

`arca-opaque-rpc-mailbox-claim-v1`

Fields bind:

- nodeId;
- requestId;
- immutable packetHash;
- processorId;
- attempt;
- claimedAt;
- leaseUntil.

A claim is permitted only when the exact packet exists in that node's queue and the queued `packetHash` matches the packet supplied by the processor.

An active lease excludes concurrent processors. After expiry, a new processor may acquire the request with incremented attempt count.

This provides restart-safe work ownership without granting execution authority.

## Terminal result

Terminal results are stored at:

`remote-opaque-rpc/results/<requestId>.json`

The stored wrapper contains:

- requestId;
- immutable request packet hash;
- encrypted terminal result hash;
- storedAt;
- original encrypted request packet;
- encrypted terminal result;
- wrapper hash.

Both request and response content remain ciphertext.

The wrapper intentionally keeps the request packet with the terminal result so a restarted origin can verify the exact request/result binding without relying on transient process state.

## Recovery

A new mailbox process can:

1. discover the encrypted queued request;
2. verify the packet;
3. claim it after a prior lease expires;
4. write a ciphertext-only terminal result;
5. recover the terminal result by requestId after another restart;
6. verify its cryptographic correlation;
7. pass the encrypted response back to the origin for local decryption.

The tests explicitly create multiple independent `GitHubOpaqueRpcMailboxTransport` instances over the same fake Git content store to prove this restart boundary.

## Historical verification

A recovered terminal result may be older than the current live-message acceptance window.

For cryptographic inspection, stored result verification uses the encrypted response envelope's historical issuance time when checking the signed route/result material.

This separates:

- **live ingress freshness/replay controls**, which apply before execution;
- **historical authenticity/integrity verification**, which must continue working after restart.

Expired queued requests are not returned as active work.

## Plaintext exclusion proof

The durable mailbox tests search the complete simulated Git content store after both request and result persistence.

They verify absence of representative private strings from:

- request instruction;
- personal context;
- private request note;
- private response;
- response detail.

The origin can still recover and decrypt the terminal response with its own X25519 private key.

This is a concrete custody property:

```text
Git persistence != plaintext access
```

## Result tamper detection

Recovery verifies:

- wrapper hash;
- request packet hash;
- Opaque RPC result hash;
- encrypted response envelope hash;
- ciphertext hash;
- signed route evidence according to configured policy.

Stored ciphertext modification therefore fails closed before local decryption.

## Remote peer adapter

`remotePeer(...)` exposes a peer compatible with the Opaque Mesh RPC relay interface.

It:

1. verifies the packet;
2. checks for an existing terminal result;
3. enqueues the request for the remote node;
4. emits wakeup;
5. waits for the terminal result by requestId.

This provides durable cross-process semantics with the existing relay abstraction.

## Current scaling limitation

V1's `remotePeer` is still **wait-based**.

A caller/relay may remain alive polling until the downstream terminal result arrives.

This is acceptable as a protocol integration checkpoint, but it is not the desired large-scale architecture.

The next evolution is store-and-return continuation:

```text
relay receives encrypted packet
  -> persist next-hop handoff
  -> record continuation
  -> exit

downstream result event
  -> wake continuation
  -> verify exact requestId/result
  -> persist/send next upstream step
  -> exit
```

This removes idle runner occupancy and allows long-running or intermittently connected nodes.

## Replay boundary

Opaque RPC encrypted-envelope replay guards are currently process-local.

GitHub queue/claim idempotency prevents some duplicate execution paths, but it is not a distributed cryptographic replay database.

Before public/federated deployment, ARCA needs durable anti-replay or monotonic sequence state bound to recipient identities/keys.

## Security boundaries

Durable Opaque Mesh Mailbox V1 does not:

- expose request or response plaintext to Git;
- store X25519/Ed25519 private keys;
- authorize a handler from capability advertisement alone;
- bypass signed-route/trust checks when configured;
- provide distributed replay state;
- provide anonymous routing or traffic-analysis resistance;
- automatically enable private reasoning;
- bypass Human Review;
- write source changes directly to `main`.

## Reasoning transport status

Even with ciphertext-only durable storage proven by tests, the Secure Reasoning Transport Gate should remain conservative until two additional conditions are proven together:

1. restart-safe **store-and-return** opaque continuation rather than long-lived polling;
2. a verified Reasoning Capability adapter actually dispatching through this opaque path while preserving Human Review and output reclassification.

Only then should private `opaque-relay` move from fail-closed to a narrowly attested transport mode.

## Next milestone

**Durable Opaque Relay Continuation V1**

Requirements:

- persist continuation state by requestId;
- hand off ciphertext and return immediately;
- downstream completion wakes exactly one upstream continuation;
- duplicate wakeups remain idempotent;
- restart between every hop is safe;
- signed receipts and encrypted envelopes remain verifiable;
- no plaintext in continuation records;
- bounded retry/deadline budgets remain enforced;
- Human Review interruption remains possible.

After that, the private reasoning integration can be tested without keeping any UI, chat session or GitHub runner continuously alive.
