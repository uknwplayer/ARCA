# Remote Evidence Processor V1

## Purpose

Remote Request Evidence V1 defines signed evidence.

Cross-Peer Request Ownership V1 defines local ownership and uncertainty.

Secure Mesh Signer Broker V1 protects the Ed25519 private key.

Remote Evidence Processor V1 composes those pieces into an executable remote lifecycle without introducing automatic failover.

## Core ordering

For a newly accepted request, the processor enforces:

```text
verified incoming envelope
-> verified ownership-bound signed receipt
-> host acceptance policy
-> signed accepted evidence
-> execute exactly once in this accepted generation
-> durable Mesh result
-> signed completed evidence
```

The ordering is intentional.

A signed completion is never written before the durable result.

Execution never begins before signed acceptance exists.

## Ownership binding transport

Previously, the local ownership hash existed only in the origin-side ledger.

V1 extends Mesh receipts with an optional:

```text
ownershipBindingHash
```

When Cross-Peer Request Ownership uses the advanced relay guard, the flow becomes:

```text
reserve owner
-> create Mesh receipt containing ownershipBindingHash
-> sign receipt
-> persist dispatch-started evidence
-> remote forward
```

The remote processor extracts the binding from the **last incoming receipt addressed to its node**.

It does not trust a per-request environment variable or caller-supplied owner hash.

In strict mode, the incoming receipt must be signed and trusted.

Because `ownershipBindingHash` participates in the receipt hash and signed receipt payload, modifying it invalidates the receipt.

## Split ownership guard

`CrossPeerRequestOwnershipStore.asRelayGuard()` now provides:

- `reserveForward(context)`;
- `markForwardStarted(token)`;
- historical `beginForward(context)` for compatibility.

The Mesh Relay uses the split API when available.

This allows ownership to be reserved before the receipt is produced while still writing the dispatch marker immediately before the network forward.

## Async secure receipt signing

Mesh Relay and Mesh Endpoint now accept either:

- historical direct signer `{ identity, privateKey }`; or
- closed async signer interface with `signReceipt()`.

Therefore `createVaultMeshSignerBroker()` can be passed directly as `receiptSigner`.

The GitHub Mesh `registerSignedNode()` path similarly accepts the broker's async `signNodeAdvertisement()`.

This removes the need for a federated runtime to hold raw Ed25519 private-key material merely to produce receipts/advertisements.

## Processor inputs

`RemoteEvidenceProcessor` receives:

- nodeId;
- GitHub-compatible Mesh mailbox contract;
- Remote Request Evidence Ledger;
- Mesh trust store;
- explicit executor function;
- optional host acceptance policy;
- clock;
- signed-receipt policy.

The processor does not accept:

- arbitrary shell commands;
- arbitrary action names;
- raw signing key;
- ownerBindingHash as external authority;
- automatic fallback peer.

## Pre-accept validation

Before signing acceptance, the processor verifies:

- Mesh envelope structure;
- request/job correlation;
- payload hash;
- receipt chain;
- signed receipts when strict mode is enabled;
- trust store for signed receipts;
- final receipt target equals the processor node;
- final receipt contains a valid ownershipBindingHash.

If these checks fail, no acceptance evidence is created and execution does not start.

## Host acceptance policy

An optional host-controlled policy may return:

```text
accept = true
```

or:

```text
accept = false
category = bounded rejection category
```

Only a verified envelope reaches this policy.

A policy rejection is signed as remote rejection before any execution.

The policy is dependency-injected code. V1 does not connect natural-language/model output directly to this decision.

## Exactly-once limitations

V1 does not claim distributed exactly-once execution.

Instead it makes the remaining uncertainty explicit.

### Crash after acceptance, before execution

Remote state remains `accepted`.

A later invocation sees accepted evidence and no durable result.

It does **not** execute again automatically.

Result:

```text
accepted-uncertain
automaticFailoverAllowed = false
```

### Crash during/after execution, before durable result

Same result: accepted without a durable result.

No replay occurs automatically.

### Durable write succeeds but acknowledgement is lost

A retry observes the durable result.

It signs completion without re-executing.

### Durable result exists but completion signing failed

A retry signs completion from the existing verified result.

It does not re-execute.

## Existing result recovery

If a correlated durable result already exists:

1. verify the Mesh result;
2. verify request/job correlation;
3. require prior signed `accepted` evidence;
4. sign completion from `resultHash`;
5. never execute again.

If the durable result exists but the remote evidence state is still `unseen`, V1 fails closed with:

```text
ARCA_REMOTE_EVIDENCE_ACCEPTANCE_MISSING
```

The processor does **not** create acceptance retroactively after execution. That would falsify the historical ordering claim.

This recovery path is observational.

## Concurrent processors

Acceptance decision storage is create-only.

If two processors race:

- one creates acceptance and may execute;
- the other sees existing acceptance;
- the second does not execute.

Thus concurrent calls against the same evidence ledger produce at most one V1 execution start.

Mailbox claims add another concurrency layer for `runOnce()`.

## Queue processing

`runOnce({ processorId, leaseMs, maxItems })`:

- lists the bounded queue for this node;
- claims each request through the existing Mesh mailbox lease mechanism;
- processes claimed envelopes;
- emits only sanitized processor events.

It does not persist raw error messages in the evidence ledger.

## Result persistence

The processor requires the mailbox/result store contract:

- `getResult(requestId)`;
- `writeResult(result)`.

After execution it verifies the Mesh result before persistence.

If `writeResult()` returns a conflict, the processor reloads the durable result and requires the same `resultHash`.

A different resultHash fails closed.

## Signed rejection remains non-authorizing

Even a cryptographically valid rejection produces:

```text
automaticFailoverAllowed = false
```

V1 does not convert rejection into permission to choose another peer.

That policy remains a later milestone.

## Security properties

V1:

- derives owner binding from the signed incoming Mesh receipt;
- verifies current trusted Mesh signer identities;
- signs acceptance before execution;
- persists result before signed completion;
- never turns execution failure into rejection;
- never retries accepted work automatically;
- recovers durable results without replay;
- supports Vault-backed receipt and advertisement signing;
- persists only hashes/metadata in remote evidence;
- does not expose private keys/keyRef;
- does not create trust;
- does not discover peers;
- does not expand authorization;
- does not enable post-forward failover.

## Public processor snapshot

The processor snapshot exposes only:

- format/version;
- nodeId;
- whether signed receipts are required;
- whether remote evidence is enabled.

No credentials, vault refs, private keys, semantic payload or executor details are exposed.

## Tests

V1 tests cover:

- signed receipt carries ownershipBindingHash;
- tampering with binding invalidates receipt;
- unsigned binding rejected before acceptance;
- signed policy rejection with zero execution;
- exact `accepted -> execute -> durable result -> completion` ordering;
- execution failure leaves accepted/uncertain and retry does not execute;
- lost durable-write acknowledgement recovers without replay;
- completion-signing failure recovers from durable result without replay;
- concurrent processors start at most one execution;
- pre-existing acceptance without result never re-executes;
- bounded queue claim/runOnce behavior;
- split reserve/dispatch ordering;
- Vault Signer Broker used directly by Mesh Relay receipts;
- async closed signer accepted by GitHub signed node registration.

## Next external proof

The strongest remaining milestone is still a live federation run across two independently controlled repositories/hosts.

That proof should demonstrate:

- separate credentials;
- separate Mesh identities/private-key vaults;
- explicit trust enrollment;
- signed owner-binding receipt;
- remote signed acceptance;
- exactly one remote execution start;
- durable result;
- remote signed completion;
- origin reconciliation;
- no private key or semantic private payload leakage into Git state.

Until such a second independent surface exists, V1 remains fail-closed rather than pretending to prove distributed exactly-once semantics.
