# Controlled Replacement Dispatch v0.2

## Status

Draft implementation built on top of Execution Identity + Reconciled Failover v0.1.

The purpose of this milestone is to cross the dispatch boundary for a replacement attempt without turning timeout, transport failure or ambiguous remote state into an automatic retry.

## Safety model

A replacement attempt can be dispatched only when all of the following already exist:

1. a stable Execution Identity;
2. a previous attempt with durable reconciled failover authorization;
3. a prepared replacement attempt produced by Cognitive Substitution;
4. a Cross-Peer ownership reservation for that exact replacement request;
5. durable replacement-preparation evidence.

Immediately before dispatch, ARCA runs an exact-participant Cognitive Substitution preflight again.

The required participant is fixed. The router is not allowed to silently select another participant at dispatch time.

The live preflight re-checks:

- verified capabilities;
- current Role Conformance evidence;
- current runtime binding;
- availability;
- independent authorization.

Participant descriptor, runtime binding and Role Conformance hashes must still match the prepared attempt.

## Durable replacement preparation

`arca-execution-replacement-preparation-v1` binds:

- execution and next attempt;
- previous attempt and previous participant;
- selected participant and descriptor hash;
- runtime kind, runtime ID and runtime binding hash;
- Role Conformance evidence hash;
- Cross-Peer owner binding hash;
- failover receipt hash;
- execution request hash;
- Role Contract hash;
- preparation-time authorization-decision hash;
- selection-evidence hash.

The record contains no raw task output and no secret credential material.

## Dispatch authorization gate

Immediately before crossing the network boundary, ARCA persists `arca-execution-dispatch-gate-v1`.

It binds:

- the exact replacement preparation;
- the exact attempt;
- current participant descriptor;
- current runtime binding;
- current Role Conformance evidence;
- current independent authorization-decision hash.

The gate is create-only. A retry with the same semantic authorization may reuse the existing gate; a different authorization decision conflicts and fails closed.

## Exactly-one local dispatch attempt

The dispatcher uses Cross-Peer Request Ownership as the network side-effect guard.

Flow:

```text
prepared attempt
  -> exact live preflight
  -> durable dispatch gate
  -> local attempt start
  -> create-only Cross-Peer dispatch-started evidence
  -> network dispatch
```

Only the caller that successfully creates the Cross-Peer dispatch-started record may perform the network call.

A concurrent or later call that finds dispatch evidence already present does not dispatch again.

## Post-dispatch failures

Once dispatch-started evidence exists, the dispatcher never automatically retries the network call.

Transport, protocol or correlation failure produces Cross-Peer `uncertain` evidence.

```text
dispatch started
  -> timeout / transport / protocol ambiguity
  -> uncertain
  -> no automatic retry
  -> remote evidence reconciliation
```

This preserves the rule that absence of a response is not proof of non-execution.

## Completion

A correlated structured result produces one result hash.

That hash closes:

- Cross-Peer completion evidence; and
- the Execution Identity attempt completion record.

If Cross-Peer completion became durable but the local execution completion write was interrupted, a later call may repair the local completion from the durable Cross-Peer result hash without performing another network dispatch.

## Non-goals

v0.2 does not:

- retry an in-flight or uncertain replacement;
- automatically fail over again after a post-start failure;
- transfer partial agent state;
- claim global exactly-once semantics across arbitrary external systems;
- expand Creator code-mutation authority;
- enable discovery or federation trust expansion.

The next safe frontier after this milestone is a bounded automatic chain for **signed pre-execution rejection only**, followed later by State Transfer / Resume.
