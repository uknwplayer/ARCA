# Review Continuation Dispatcher V1

## Objective

`ReviewContinuationDispatcher` closes the gap between **human authorization becoming durable** and a trusted orchestrator actually resuming work.

The pipeline is now:

`Machine Bridge result -> Human Review -> Review Gate -> durable wake -> Continuation Dispatcher -> closed handler -> next authorized step`

A wake is not itself an executable command. The dispatcher only acts when all of the following are true:

1. the durable continuation pointer has `wake.pending=true`;
2. the pointer still says `authorizedToContinue=true` and `gateState=authorized-to-continue`;
3. a continuation intent was registered for the same `requestId` before dispatch;
4. the intent names a handler present in the local closed registry with the exact registered version.

If any condition is absent, execution fails closed or remains pending.

## Durable intent

The intent is stored under:

`ARCA_HOME/review-continuations/intents/<requestId>.json`

It contains only bounded routing metadata:

- `requestId`;
- `handlerId` and `handlerVersion`;
- optional opaque `contextRef`;
- optional `contextHash`;
- last completed wake sequence;
- lease/attempt state;
- optional outcome reference/hash;
- tamper-evident `recordHash`.

It does **not** persist arbitrary source code, shell commands, raw Machine Bridge params, provider credentials, investigation payloads or private keys.

An intent is immutable in identity: re-registering the same `requestId` with a different handler/context descriptor is rejected.

## Closed Continuation Action Registry

Handlers are supplied by trusted host code when the dispatcher is constructed:

```ts
new ReviewContinuationDispatcher(pointerStore, [
  {
    id: "arca.example.resume",
    version: "1",
    handle: async (context) => ({
      format: "arca-continuation-handler-result-v1",
      requestId: context.requestId,
      wakeSequence: context.wakeSequence,
      status: "completed"
    })
  }
]);
```

There is no runtime path for a remote job or review payload to create executable code or dynamically add a handler.

`registerIntent(...)` rejects handler IDs outside this registry and pins the registry version into the durable intent.

## Dispatch contract

Each invocation receives a bounded context:

- the exact `requestId`;
- `wakeSequence`;
- deterministic `idempotencyKey = review-continuation:<requestId>:<wakeSequence>`;
- optional opaque context reference/hash;
- prior execution references already sanitized by the continuation pointer;
- review IDs;
- pointer hash.

The handler result must preserve both `requestId` and `wakeSequence` or the dispatcher fails closed.

Handler status can be:

- `completed`: mark the wake sequence complete, then acknowledge the durable wake;
- `deferred`: release the claim and leave the wake pending for a later attempt.

Thrown errors also leave the wake pending.

## Crash recovery and replay model

V1 provides durable claims/leases plus a per-wake completion marker.

The ordering is deliberate:

1. claim intent;
2. invoke handler;
3. persist `lastCompletedWakeSequence`;
4. acknowledge the continuation pointer wake.

If the process dies after step 3 but before step 4, the next dispatcher observes that the wake was already completed and acknowledges it **without replaying the handler**.

If the process dies after an external side effect but before step 3, the handler may be called again after the lease expires. Therefore handlers must treat the supplied `idempotencyKey` as authoritative and implement idempotent downstream behavior. V1 does not claim impossible exactly-once semantics across arbitrary external systems.

## Relationship to ReviewContinuationWakeController

`ReviewContinuationWakeController` already supports `onWake`.

A host can compose both primitives:

```ts
const dispatcher = new ReviewContinuationDispatcher(pointerStore, handlers);
const wakeController = new ReviewContinuationWakeController(queue, {
  store: pointerStore,
  onWake: event => dispatcher.dispatchRequest(event.requestId)
});
```

Recovery scans remain necessary. `dispatchPending()` can consume durable pending wakes after restart even if a filesystem event was missed.

## Security boundaries

The dispatcher does not:

- bypass Human Review;
- transform `completed` into approval;
- execute arbitrary shell commands;
- dynamically load code from Mesh/jobs/results;
- write to `main` by itself;
- bypass Machine Bridge Action Registry, capability or network policy;
- expose the Creator Console remotely;
- persist raw continuation commands.

A registered handler is trusted application code and remains responsible for applying the authorization/capability policy of the subsystem it invokes.

## Result

Review-Gated Continuation can now survive the original UI/caller, wake after human approval and hand control to a deterministic, locally registered continuation handler. This is the first execution bridge from durable human authorization toward unattended ARCA orchestration while preserving an explicit authority boundary.
