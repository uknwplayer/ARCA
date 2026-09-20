# Opaque Mesh RPC V1

## Objective

Opaque Mesh RPC V1 composes the existing Mesh identity, signed-route and encrypted-envelope primitives into a bidirectional private request/response protocol.

The privacy goal is:

```text
origin plaintext
  -> encrypt to endpoint X25519 key
  -> relay A sees ciphertext
  -> relay B sees ciphertext
  -> endpoint decrypts
  -> authorized handler runs
  -> encrypt response to origin reply key
  -> relay B sees ciphertext
  -> relay A sees ciphertext
  -> origin decrypts
```

Relays can route and attest hops without receiving either request or response plaintext.

## Request packet

Format:

`arca-mesh-opaque-rpc-request-v1`

The immutable request metadata binds:

- requestId;
- payloadId;
- origin node;
- target node;
- required capabilities;
- maximum hops;
- creation/expiry;
- encrypted request envelope hash;
- target encryption-recipient statement hash;
- origin reply-recipient statement hash.

The immutable metadata receives `packetHash`.

The packet also carries:

- the target's signed public X25519 recipient statement;
- the origin's signed public reply X25519 recipient statement;
- `arca-mesh-encrypted-envelope-v1` ciphertext;
- route;
- signed/hash-chained forward receipts.

No request plaintext is present in the packet.

## Bidirectional encryption

Request:

- encrypted to the selected endpoint X25519 key.

Response:

- encrypted to the origin reply X25519 key supplied in the request packet.

The endpoint never places handler output directly into the result packet.

Result format:

`arca-mesh-opaque-rpc-result-v1`

contains only:

- correlation IDs;
- endpoint identity alias;
- forward/reply routes;
- receipts;
- encrypted response envelope;
- result hash.

The caller decrypts locally and returns:

`arca-mesh-opaque-rpc-call-v1`

The local call object may contain plaintext output because it exists after the trusted origin endpoint has decrypted the response. That local object is not the relay transport object.

## Forward routing

`MachineBridgeOpaqueRpcRelay` routes using only public metadata:

- required capabilities;
- reachable capabilities;
- visited nodes;
- hop budget;
- expiry.

The relay does not receive a decryption key.

Each hop can append a signed receipt that binds:

- direction `forward`;
- nodeId / nextNode;
- hop;
- requestId / payloadId;
- timestamp;
- previous hash;
- receipt hash.

With `requireSignedReceipts=true`, an unsigned hop fails closed.

With a `MeshIdentityTrustStore`, the receipt signer must use the currently pinned Ed25519 identity for that node.

## Endpoint

`MachineBridgeOpaqueRpcEndpoint` requires:

- exact target node;
- required capability match;
- exact signed X25519 recipient statement configured for the endpoint;
- recipient X25519 private key;
- optional strict signed-receipt/trust policy;
- handler supplied by the host.

Only after all public/ciphertext checks pass does the endpoint decrypt.

Replay guard runs after authenticated decryption and before successful reuse.

The handler receives:

- decrypted payload;
- requestId / payloadId;
- local request-decryption proof;
- verified route.

The handler is still an application capability boundary. Opaque RPC does not authorize arbitrary shell or Core mutation.

## Reply route

The endpoint encrypts handler output to the origin reply key.

Reply receipts use direction `reply`.

As the synchronous result unwinds:

```text
endpoint -> relay B -> relay A -> origin
```

each node appends a signed reply receipt.

The final `replyRoute` must equal the exact reverse of the forward route.

The result hash is recomputed after each authenticated reply-hop append.

## Correlation

The same requestId is preserved across:

- request packet;
- encrypted request;
- endpoint execution context;
- encrypted response;
- terminal result;
- local decrypted call result.

A deterministic response payloadId is derived from requestId + request payloadId without exposing private content.

Correlation mismatch fails closed.

## Privacy properties

Tests assert that serialized transit packets/results do not contain:

- private request instruction text;
- example personal-name context;
- private request notes;
- private response text;
- private response findings.

This proves the implemented in-memory relay path is opaque with respect to payload content.

It does not prove traffic-analysis resistance: relays still observe routing metadata, timing and ciphertext sizes.

## Capability separation

A route must expose the requested capability in `reachableCapabilities`.

The endpoint must itself expose every required capability.

No route is found when capabilities do not match.

Capability matching is not authorization. The endpoint handler must still be installed/authorized by the host.

## Replay

The request endpoint may use `MeshEncryptedEnvelopeReplayGuard`.

The origin may independently use another replay guard for encrypted responses.

Current replay state is process-local.

Durable multi-process federation still needs shared monotonic/replay state.

## Key separation

Ed25519 and X25519 keys remain separate:

- Ed25519: identity, advertisements and route receipts;
- X25519: payload confidentiality.

Tests keep signing and encryption private keys as distinct runtime objects.

## What V1 proves

V1 proves a complete in-memory private RPC path with:

- encrypted request;
- capability-aware multi-hop routing;
- trusted signed forward receipts;
- endpoint-only request decryption;
- handler execution after decryption;
- encrypted response;
- trusted signed reverse receipts;
- origin-only response decryption;
- end-to-end request/result correlation;
- relay plaintext non-observability in tests;
- replay failure;
- capability-route failure;
- wrong reply-key failure;
- packet metadata tamper failure before handler execution.

## What V1 does not yet prove

V1 does not yet provide:

- GitHub mailbox persistence for opaque RPC packets/results;
- restart-safe opaque RPC continuation;
- durable distributed replay state;
- deployed node key provisioning;
- public federation/Sybil resistance;
- anonymous routing;
- traffic-analysis resistance;
- automatic reasoning-provider selection;
- authorization to execute arbitrary actions.

Most importantly, Secure Reasoning Transport Gate should remain fail-closed for private opaque-relay until the opaque RPC path is connected to the actual reasoning adapter and durable transport.

## Next milestone

The next milestone is **Durable Opaque Mesh Mailbox V1**:

1. store only opaque request/result packets in the mailbox;
2. wake target nodes without serializing plaintext;
3. claim/lease encrypted packets;
4. recover/retry by requestId;
5. persist replay/sequence evidence safely;
6. run a durable multi-hop fixture and inspect Git state for absence of plaintext;
7. only then integrate a verified reasoning provider and consider unlocking private `opaque-relay` in the reasoning transport gate.
