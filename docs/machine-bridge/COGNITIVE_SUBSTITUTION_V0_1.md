# ARCA Cognitive Substitution / Functional Mimicry Layer v0.1

**Status:** implementation candidate  
**Scope:** Agent Bundle + Capability Registry + Machine Bridge routing boundary

## Purpose

This layer separates a **logical cognitive role** from both the concrete participant that satisfies it and the runtime target that actually executes it.

A role such as `research.public` is defined by a stable contract. Agents, workers, tools, models or services may satisfy that role only when the required capabilities are currently **verified** for that concrete participant fingerprint.

The architectural rule is:

> A capability may outlive a provider. A role may outlive an agent. Logical identity, runtime identity and execution provenance must remain distinct and observable.

This is functional substitution, not model cloning and not a claim that two models have identical internal cognition.

## Runtime objects

`RoleContractRegistry` stores role contracts with stable role/version, required capabilities, allowed participant kinds, risk classification, a bounded output behavior envelope, a SHA-256 contract fingerprint, verified-only matching and mandatory authorization separation.

`ParticipantRuntimeBindingRegistry` explicitly maps:

```text
logical participantId
        |
        v
participant descriptor fingerprint
        |
        v
runtime binding
        |
        +-- agent-gateway -> agentId
        +-- machine-bridge-worker -> workerId
        +-- endpoint/custom -> runtimeId
```

A binding is valid only for the exact participant `descriptorHash` it was created for. Model/environment changes invalidate capability verification and also make the old runtime binding stale. Re-verification alone does not silently renew the binding.

`CognitiveSubstitutionRouter` receives a request and role, selects an eligible verified participant, resolves its explicit runtime binding, checks liveness before execution, invokes an external authorization gate, dispatches exactly once, validates the observable result envelope and emits a cryptographically signed substitution receipt.

## Signed substitution receipts

A plain SHA-256 checksum is not authentication. V0.1 therefore requires every successful substitution receipt to be signed with an ARCA Mesh Ed25519 node identity under the dedicated domain:

`arca.mesh.cognitive-substitution-receipt.v1`

The receipt binds:

- role contract hash;
- concrete participant descriptor hash;
- runtime binding hash;
- logical participant ID;
- concrete runtime kind and runtime ID;
- preferred participant and selected participant;
- unavailable and binding-rejected participants;
- request and output hashes;
- output size;
- policy-decision reference;
- completion timestamp;
- issuer node identity;
- explicit no-post-start-failover flag.

`verifyCognitiveSubstitutionReceipt(...)` requires a Mesh trust store. A forged receipt may have a valid self-consistent hash and even a mathematically valid Ed25519 signature, but it is rejected if the signer identity is not trusted.

The Mesh signer broker also exposes `cognitive-substitution-receipt`, allowing production keys to remain in the Credential Vault rather than being embedded in the router.

## Why preflight-only

V0.1 intentionally does **not** retry another participant after an execution call has started.

A transport failure can occur after the first executor has already caused a side effect but before the caller receives the result. Blindly invoking a second participant can duplicate effects. Therefore v0.1 may substitute a participant only before dispatch, when the preferred participant is unavailable or cannot provide a valid current binding.

Durable exactly-once or reconciled post-start failover belongs to a later profile with shared execution identity, idempotency and ownership semantics.

## Capability is not authorization

The Capability Registry answers whether a concrete participant has passed conformance for a capability. It does not grant permission.

The router requires an `authorize(context)` dependency. A role contract cannot disable authorization. A denied or malformed decision fails closed before dispatch.

The authorization context includes the role, logical participant and resolved runtime binding, so policy can authorize the exact execution target rather than an ambiguous capability name.

## Creator sovereignty and source-code mutation

This layer does not grant source-code mutation rights.

Its result declares `coreMutationPerformed: false`. If a selected worker later requests a Machine Bridge action classified as `code`, the Creator Sovereignty Gate remains authoritative and must independently validate a Creator-owned single-use authorization.

Substitution cannot reinterpret a verified capability, role match, runtime binding, Human Review decision or agent preference as Creator authorization.

## Selection algorithm

For a role:

1. load its immutable contract;
2. query `CapabilityRegistry.findCompatible(...)`, which defaults to verified capabilities;
3. filter participant kinds allowed by the role;
4. move an explicitly preferred participant to the front when eligible;
5. resolve a binding tied to the exact participant descriptor fingerprint;
6. reject missing/stale bindings;
7. test the bound runtime with the injected non-mutating availability probe;
8. select the first available candidate deterministically;
9. call the authorization gate;
10. dispatch exactly once to the bound runtime;
11. validate the behavior envelope;
12. sign and locally verify the substitution receipt against the trust store.

Without an explicit preference, eligible participants are ordered by stable participant ID. V0.1 deliberately has no opaque quality score or provider ranking.

## Behavior envelope

The behavior envelope constrains observable output:

- maximum serialized output bytes;
- required top-level keys;
- optional correlation preservation for `requestId`, `jobId` and `taskId`.

It does not claim semantic equivalence between models. More advanced behavioral conformance can later add synthetic scenario suites, statistical drift checks and role-specific evaluators.

## Native ARCA adapters

`createAgentGatewaySubstitutionDispatch(...)` requires a binding with `runtimeKind=agent-gateway` and dispatches to exactly `binding.runtimeId`. `AgentGateway.dispatch(...)` fails if that target is missing, externally disallowed or capability-incompatible; it does not silently fall back to the principal agent.

`createMachineBridgeSubstitutionDispatch(...)` requires `runtimeKind=machine-bridge-worker`, writes the binding's `runtimeId` into the existing V3 `workerTarget`, unions role capabilities into `job.requires`, and calls the existing Machine Bridge client's `call()`.

The logical participant and runtime target are deliberately allowed to be different identifiers.

## Current limit

V0.1 proves role-level substitution, explicit runtime identity, signed provenance and governance boundaries. It does not learn another agent's hidden decision process, copy weights, infer private chain-of-thought, guarantee semantic identity, or perform post-start automatic failover.

A later behavioral-mimicry profile may learn from permitted observable input/output traces, but it must remain distinct from identity, authorization and claims of subjective equivalence.
