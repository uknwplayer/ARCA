# Execution Identity + Reconciled Failover v0.1

## Status

Implementation candidate layered on top of:

- Cross-Peer Request Ownership / Idempotency Evidence V1;
- Remote Request Evidence V1;
- Remote Evidence Reconciliation V1;
- Cognitive Substitution v0.2 / Role Conformance.

The goal of this milestone is to establish a durable execution identity above individual executor attempts and to prove when a new attempt may be prepared without treating a timeout as proof of non-execution.

## Core rule

A request and an execution are not the same thing as an attempt.

```text
logical request
   |
   v
executionId
   |
   +-- attempt 1 -> participant A
   |
   +-- attempt 2 -> participant B
```

The execution identity remains stable while each attempt receives its own request/job/participant/runtime bindings. The coordinator refuses both request-hash drift and role-contract drift before it can supersede the current attempt.

## Execution identity

`arca-execution-identity-v1` is deterministic from:

- logical request ID;
- role ID;
- exact role contract hash;
- request hash;
- policy/authorization binding hash.

It also records an idempotency class:

- `unknown`;
- `read-only`;
- `pure-compute`;
- `synthetic`;
- `no-side-effect`;
- `external-idempotent`;
- `side-effecting`.

V0.1 records this class for future policy use but does **not** use it to authorize retry after an uncertain outcome.

## Attempt identity

Each attempt is append-only and binds:

- execution ID/hash;
- monotonically increasing attempt number;
- participant ID;
- participant descriptor hash;
- runtime binding hash;
- Role Conformance evidence hash;
- remote request ID;
- remote job ID;
- payload hash;
- selected remote node;
- exact Cross-Peer owner binding hash.

Attempt start and completion are separate create-only records.

A completed attempt cannot be failed over.

A superseded attempt cannot later be restarted or locally completed.

## Reconciliation before failover

The failover controller delegates observation to the existing `RemoteEvidenceReconciliationController`.

V0.1 authorizes a next attempt only when the selected remote owner provides a trusted signed **pre-execution rejection** in one of these categories:

- `capability`;
- `unavailable`;
- `not-accepted`.

These categories are safe because Remote Request Evidence makes acceptance and rejection mutually exclusive for the same remote request decision.

The following never authorize failover in v0.1:

- accepted;
- accepted + local uncertainty;
- completed;
- unseen remote evidence;
- timeout without signed rejection;
- transport failure without signed rejection;
- policy rejection;
- invalid-request rejection;
- unknown rejection.

This is intentionally stricter than a generic retry policy.

## Signed failover authorization

When the gate is satisfied, the controller creates an `arca-reconciled-failover-receipt-v1`.

The receipt binds:

- execution identity/hash;
- logical request and role;
- policy binding hash;
- source attempt ID/hash;
- previous participant descriptor;
- previous runtime binding;
- previous Role Conformance evidence;
- remote request/job/node;
- Cross-Peer owner binding hash;
- exact reconciliation decision statement hash;
- rejection category;
- authorization timestamp;
- the rule that the next attempt must use a different participant.

The receipt is signed under the dedicated Mesh domain:

`arca.mesh.reconciled-failover-receipt.v1`

The Mesh Signer Broker supports this operation inside the existing encrypted credential-vault boundary.

## Durable local authorization record

The Execution Identity Store does not mark an attempt superseded merely because an arbitrary file exists.

Before persistence it requires:

1. a cryptographically valid reconciled-failover signed statement;
2. a signer trusted by the supplied Mesh trust store;
3. exact execution ID / attempt ID / attempt hash binding;
4. a valid receipt content hash.

It then stores a small locally hash-sealed authorization record containing only the relevant receipt/statement fingerprints and timestamps.

## Next attempt

A next attempt may be prepared only when:

- the signed failover receipt is still valid and trusted;
- its source attempt is the current latest attempt;
- the same authorization exists durably in the Execution Identity Store;
- the next participant differs from the previous participant;
- the new attempt binds a fresh participant/runtime/conformance/ownership tuple.

V0.1 does not automatically dispatch that new attempt.

```text
reconcile
  |
  v
eligibility gate
  |
  v
signed failover authorization
  |
  v
prepare next attempt
  |
  v
EXPLICIT DISPATCH BOUNDARY
```

This keeps the first milestone auditable while avoiding an accidental transition from evidence processing into autonomous side-effect execution.

## Relationship to Cognitive Substitution

Cognitive Substitution remains the participant-selection layer.

Execution Identity / Reconciled Failover is the temporal safety layer.

A higher-level orchestration flow may use Cognitive Substitution to resolve a different verified/conformant participant and then pass that exact participant/runtime/conformance evidence into `prepareNextAttempt()`.

The Machine Bridge layer intentionally does not import the Agent package to avoid reversing the package boundary.

## Security invariants

- timeout is never proof of non-execution;
- absence of evidence is never proof of non-execution;
- accepted execution is never silently rerouted;
- completion is terminal for failover purposes;
- policy rejection is not converted into permission to search for another executor;
- invalid request is not converted into permission to search for another executor;
- a next attempt cannot reuse the same participant;
- failover authorization is cryptographically signed and trust-checked;
- Role Conformance remains required for the next participant at the selection layer;
- Creator code-mutation authority is unchanged;
- no automatic dispatch is introduced by this milestone.

## What remains

The next safe integration step is a higher-level coordinator that combines:

1. Cognitive Substitution candidate resolution;
2. this signed failover authorization;
3. exact next-attempt creation;
4. explicit dispatch/start;
5. result reconciliation back into the same execution identity.

Only after that is proven should ARCA consider allowing selected idempotent classes to recover from outcomes that were not cleanly rejected before execution.


## Cognitive replacement coordinator

The Agent layer provides `ReconciledSubstitutionCoordinator` to connect the signed Machine Bridge failover authorization to Cognitive Substitution without crossing the dispatch boundary.

The coordinator:

1. verifies that the supplied request hashes to the exact `requestHash` stored in Execution Identity;
2. verifies that the current Role Contract hash matches `roleContractHash`;
3. obtains or reuses the durable reconciled-failover authorization;
4. asks `CognitiveSubstitutionRouter.preflight()` for an eligible participant while explicitly excluding the previous participant;
5. runs the normal independent authorization gate for that exact replacement;
6. reserves the next Cross-Peer owner without dispatching;
7. creates the next append-only attempt with the exact participant, runtime, Role Conformance and owner-binding evidence.

If no replacement is currently available, the signed failover authorization remains durable and can be reused later. Once an attempt is prepared, repeating the coordinator returns the existing planned attempt instead of creating another.

Preparation never invokes the router dispatch function.
