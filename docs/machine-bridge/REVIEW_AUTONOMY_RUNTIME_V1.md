# Review Autonomy Runtime V1

## Objective

`ReviewAutonomyRuntime` composes the durable Human Review path into one long-lived local runtime:

`Human Review Queue -> Review Gate -> durable wake -> Continuation Dispatcher -> closed handler`

The goal is operational autonomy without confusing autonomy with authority. The runtime can stay active for hours or days, recover after restart and resume only continuations that were already authorized under Review-Gated Continuation policy.

## Composition

The runtime owns or reuses:

- `HumanReviewQueue`;
- `ReviewContinuationStore`;
- `ReviewContinuationIntentStore`;
- `ReviewContinuationWakeController`;
- `ReviewContinuationDispatcher`.

Trusted continuation handlers are passed as code at construction time. The runtime does not discover or dynamically load executable handlers from jobs, review payloads, files, Mesh messages or network responses.

## Start and recovery

`start()` initializes all durable stores and snapshots wakes that were already pending before startup. It then starts the filesystem/recovery wake controller. A newly-created wake gets one immediate event-driven dispatch attempt; wakes that were already pending before startup are recovery-dispatched after the controller starts.

After startup it keeps two recovery mechanisms active:

1. the wake controller periodically reconciles Human Review state so a missed filesystem event cannot permanently lose an authorization transition;
2. the runtime periodically calls `dispatchPending()` so a handler failure, deferred operation or process restart does not require the original UI/caller to return.

A failure from a newly-created wake is deliberately **not** retried a second time in the same reconciliation cycle. The durable wake remains pending and is eligible only on a later recovery cycle. This prevents a transiently failing handler from being hammered twice back-to-back while retaining eventual recovery.

All local dispatch operations are serialized through one runtime chain to reduce duplicate concurrent processing inside a process. Cross-process coordination remains protected by the continuation intent claim/lease and record hashes.

## Registration

A continuation still must be registered explicitly before dispatch:

```ts
await runtime.registerIntent({
  requestId: "req-123",
  handlerId: "arca.example.resume",
  contextRef: "state:investigation-123"
});
```

The handler must already exist in the closed Continuation Action Registry supplied to the runtime. The runtime never invents a continuation merely because a Human Review was approved.

## One-shot recovery

`runOnce()` is available for cron/scheduler/recovery environments. It:

1. snapshots wakes that were already pending at the beginning of the cycle;
2. reconciles review state, giving newly-created wakes one event-driven attempt;
3. recovery-dispatches only the wakes that predated that cycle;
4. returns a bounded operational summary.

If a new event-driven attempt fails, a later `runOnce()` sees the still-pending wake as pre-existing recovery work and may retry it. This provides a path for 24/7 operation even where a permanent daemon is undesirable: a scheduler may invoke one-shot recovery periodically.

## Security boundary

Review Autonomy Runtime V1 does not:

- authorize a result by itself;
- bypass Human Review;
- promote `completed` to approval;
- load arbitrary commands or executable code from persisted state;
- provide shell access;
- change Core directly unless a separately trusted registered handler is itself authorized to use a Core API;
- bypass Machine Bridge Action Registry, capabilities, network policy or publication gates;
- expose Creator Console remotely;
- make an external provider trustworthy merely because it is reachable.

The runtime is an orchestration/liveness component. Subsystem authorization remains in the subsystem being invoked.

## Failure semantics

External side effects remain at-least-once unless the handler/downstream system honors the deterministic continuation idempotency key. A handler failure or `deferred` result leaves the durable wake pending for recovery. A completed dispatch is persisted before wake acknowledgement so a crash in that gap can be recovered without replaying the handler.

## Product effect

The original chat/browser/process is no longer required to remain alive while a request waits for human review. Once authorization arrives, a trusted host can wake and continue the same `requestId` automatically under a closed handler registry.

This is the local runtime foundation for the later path:

`arca-primary -> Machine Bridge/Mesh -> review -> wake -> autonomous continuation -> next capability`
