# Federation Deterministic Peer Selection V1

## Purpose

Federation V1 establishes an explicit trust boundary between operators.

Federation Peer Catalog V1 persists which peers are trusted.

Federation Peer Health / Backoff V1 describes whether an already-trusted binding is currently healthy, degraded or cooling down.

Deterministic Peer Selection V1 adds one narrow capability:

> choose one peer from a bounded set of already-enrolled, capability-compatible peers before forwarding begins.

Selection does not enroll, discover, trust or authorize a peer.

## Authority order

The selection order is deliberately constrained:

1. the peer must already exist in the explicit operator-selected set;
2. its node binding must already map to a peer trust binding;
3. the Mesh relay must consider the peer capability-compatible;
4. health state may influence which compatible peer is preferred;
5. the chosen node must still be one of the relay's actual compatible candidates;
6. exactly one forward is started for that selection decision.

Capability remains compatibility information, not authorization.

Health remains operational state, not trust.

## Explicit peer set

The preferred construction is:

`FederationPeerSelector.fromCatalog(...)`

It requires an explicit non-empty list of `peerIds`.

It does not call catalog-wide discovery to populate its candidate set.

Each requested peer:

- must exist in the durable federation catalog;
- must be active;
- is converted to a binding hash that includes its exact node, transport domain and Ed25519 identity.

A direct `bindings` constructor also exists for embedding/tests, but it still requires explicit node/peer/binding hashes and does not create Mesh peers or trust identities.

## Relay boundary

`MachineBridgeMeshRelay` accepts an optional `peerSelector`.

Without a selector, historical behavior remains unchanged: compatible candidates are sorted by node ID and the first is selected.

With a selector:

1. the relay first performs its existing route-loop and capability filtering;
2. the selector receives only immutable routing descriptors:
   - nodeId;
   - capabilities;
   - reachableCapabilities;
   - requestId/jobId;
   - requiredCapabilities;
   - relay node ID;
   - evaluation time;
3. it does not receive the peer's `forward` function or credentials;
4. the selector returns a node ID;
5. the relay verifies that node is one of the already-compatible candidates;
6. only then is the hop receipt created and forwarding begins.

A selector cannot return an arbitrary node outside the candidate set.

## Deterministic health policy

V1 ranks attemptable peers as:

1. `healthy`;
2. `unknown`;
3. `degraded`.

`cooldown` peers are not attemptable.

Within the same health class:

1. fewer consecutive failures wins;
2. lower lexical `peerId` wins;
3. lower lexical `nodeId` wins.

The deterministic ordering makes routing decisions reproducible for the same inputs.

No latency scoring, pricing, reputation, model quality score or probabilistic choice is introduced in V1.

## All peers in cooldown

If every compatible enrolled candidate is in active cooldown, selection fails locally with:

`ARCA_FEDERATION_NO_ATTEMPTABLE_PEER`

The error exposes the earliest known `retryAt` timestamp.

No untrusted or unknown peer is substituted.

## No automatic post-forward failover

V1 intentionally does **not** attempt a second peer after forwarding to the selected peer has begun.

Reason:

A timeout or connection failure does not prove that the remote side failed before accepting/enqueueing the request.

Automatically forwarding the same logical job to a second operator could therefore create duplicate execution.

The safe V1 rule is:

```text
select once -> append signed route receipt -> forward once
```

If the forward later fails:

- Peer Health may record the operational failure;
- a later recovery cycle can re-evaluate the request according to higher-level idempotency/recovery rules;
- the relay itself does not silently fan out or retry another peer.

## Selection decision

A direct selector call returns:

`arca-federation-selection-decision-v1`

with:

- selected node ID;
- selected peer ID;
- health state;
- consecutive failure count;
- compatible candidate count;
- attemptable candidate count;
- required capabilities;
- request/job correlation when supplied;
- evaluation timestamp.

The Mesh adapter only returns the selected node ID to the relay.

V1 does not persist the decision automatically.

## Security properties

Selection cannot:

- enroll a peer;
- list arbitrary external peers as discovery;
- trust a key;
- rotate a key;
- enable a disabled peer;
- change repository/ref/root;
- modify capabilities;
- grant execution authorization;
- bypass Human Review;
- bypass Mesh loop/hop controls;
- select a node outside the relay's compatible candidate set;
- automatically retry a second peer after forwarding starts.

## Tests

V1 covers:

- healthy over unknown/degraded preference;
- cooldown exclusion;
- degraded probe selection;
- earliest retry when all peers cool down;
- unbound candidate fail-closed behavior;
- capability filtering before ranking;
- stable tie-breaking;
- selector/relay integration;
- rejection of a selector result outside the compatible set;
- immutable selector routing context;
- no automatic second-peer retry after a forward starts;
- explicit catalog peer set;
- disabled and empty peer-set rejection.

## Next step

The next useful proof is a live multi-peer topology using independent hosts/repositories.

Until that exists, selection remains fully testable but should not be described as production-proven cross-operator load balancing.

Future selection policy may add operator-configured priorities or cost classes, but only if those inputs remain deterministic, explicit and subordinate to trust + authorization boundaries.
