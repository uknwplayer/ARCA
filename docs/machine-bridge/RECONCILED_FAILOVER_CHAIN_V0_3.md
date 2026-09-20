# Reconciled Failover Chain v0.3

## Status

Draft implementation built on:

- Cognitive Substitution v0.2;
- Role Conformance;
- Execution Identity + Reconciled Failover v0.1;
- Controlled Replacement Dispatch v0.2;
- signed Remote Request Evidence;
- Remote Evidence Reconciliation.

The milestone adds a bounded automatic replacement chain such as:

```text
A -> signed pre-execution rejection
  -> B -> signed pre-execution rejection
       -> C -> completion
```

It does not add generic retry semantics.

## Core safety rule

The chain advances only when the existing Reconciled Failover gate proves a trusted signed remote rejection that happened before acceptance/execution and whose category is one of:

- `capability`;
- `unavailable`;
- `not-accepted`.

No other outcome advances the chain.

In particular:

```text
accepted               -> stop / reconcile
completed              -> terminal
unseen                 -> stop / reconcile
transport ambiguity    -> stop unless signed rejection is later proven
protocol ambiguity     -> stop unless signed rejection is later proven
policy rejection       -> blocked
invalid-request        -> blocked
unknown rejection      -> blocked
```

A local timeout or dispatch error remains insufficient on its own.

## Historical participant exclusion

Replacement selection excludes every participant already used by the execution, not only the immediately previous participant.

For an execution:

```text
attempt 1 -> A
attempt 2 -> B
```

the next selection excludes both A and B.

A new optional `excludedParticipantIds` field is stored in replacement-preparation evidence. The field is optional for backward compatibility with v0.2 records; old records are interpreted as excluding their immediately previous participant only.

This prevents automatic oscillation such as:

```text
A -> B -> A -> B
```

inside the same execution chain.

## Controller

`ReconciledFailoverChainController` coordinates existing components rather than replacing them.

For each bounded cycle it:

1. reads durable Execution Identity state;
2. returns immediately if the execution is complete;
3. if the latest attempt is a prepared replacement, invokes Controlled Replacement Dispatch;
4. never re-dispatches an ownership binding whose dispatch already started;
5. after a non-completed dispatch state, asks Reconciled Substitution to prepare another attempt;
6. Reconciled Substitution delegates to Reconciled Failover, which reads trusted remote evidence;
7. only a safe signed pre-execution rejection permits another participant to be prepared;
8. the next loop dispatches that new prepared participant.

The primary attempt may already have been dispatched outside this controller. The chain can begin from its signed rejection and create attempt 2.

## Bounded autonomy

Two bounds are mandatory:

- `maxAttempts`: total execution attempts, including the original participant;
- `maxTransitionsPerRun`: bounded orchestration cycles in one invocation.

The implementation defaults to a maximum of 8 attempts and 8 orchestration cycles, with hard upper bounds of 32.

Reaching a limit produces a durable paused/limited state. It does not expand authority.

## Restart behavior

The chain is reconstructed from durable evidence:

- execution attempts;
- signed failover authorization;
- replacement preparation;
- dispatch gate;
- Cross-Peer ownership and dispatch evidence;
- remote request evidence.

A later invocation does not replay an already-started network dispatch.

If a safe failover was authorized but no unused conformant participant existed, the execution can remain `awaiting-participant`. A later invocation may continue when a new eligible participant becomes available.

## Result states

The chain exposes bounded states:

- `completed`;
- `awaiting-reconciliation`;
- `awaiting-participant`;
- `blocked`;
- `attempt-limit-reached`;
- `bounded-run-paused`.

These are orchestration states, not new authorization sources.

## Security invariants

- signed rejection is required for automatic chain advancement;
- acceptance never authorizes replacement;
- uncertainty never authorizes replacement by itself;
- completed execution is terminal;
- policy and invalid-request rejection do not trigger another participant;
- previously used participants are excluded from new automatic selection;
- every replacement is independently capability-checked, Role-Conformance-checked, runtime-bound, availability-checked and authorized;
- every network dispatch remains protected by create-only Cross-Peer dispatch evidence;
- no automatic network replay occurs after dispatch starts;
- Creator code-mutation authority is unchanged;
- no State Transfer / Resume is introduced.

## Next frontier

Once this bounded chain is accepted, the next independent problem is **State Transfer / Resume**:

```text
A performs part of a resumable task
  -> durable checkpoint
  -> A becomes unavailable
  -> safe ownership/reconciliation
  -> B proves compatibility with the checkpoint contract
  -> B resumes from the checkpoint
```

That requires explicit checkpoint schemas, state provenance, resume compatibility and side-effect boundaries. It must not be inferred from ordinary model conversation history.
