# ARCA Review Continuation Wakeup V1

**Status:** implementation / local durable orchestration

## Purpose

Review-Gated Continuation V1 separates a technically completed Machine Bridge execution from substantive authorization to continue. Wakeup V1 removes the remaining dependency on an open caller waiting in a polling loop.

The durable path is now:

```text
Machine Bridge result
  -> ReviewGatedContinuation
  -> Human Review Queue
  -> durable continuation pointer
  -> human decision
  -> filesystem change event
  -> ReviewContinuationWakeController
  -> pointer becomes wake.pending=true
  -> orchestrator consumes/acknowledges wake
```

The wake controller does **not** execute the continuation. It only persists that the request is authorized to resume. Execution remains the responsibility of a separately authorized orchestrator.

## Durable pointer

Pointers live under:

`ARCA_HOME/review-continuations/pointers/<requestId>.json`

Format:

`arca-review-continuation-pointer-v1`

A pointer stores:

- durable `requestId`;
- bounded execution references (`jobId`, Action Registry action and descriptor hash);
- current Review Gate state;
- review IDs and human decisions;
- whether continuation is authorized;
- wake sequence, ready timestamp and acknowledgement metadata;
- SHA-256 `recordHash` for integrity/concurrency checks.

Raw Machine Bridge params are **not** persisted in the pointer. The execution descriptor is hashed before persistence.

## Wake semantics

When a request transitions from not-authorized to `authorized-to-continue`, the store sets:

- `wake.pending=true`;
- increments `wake.sequence`;
- records `wake.readyAt`;
- records reason `human-review-authorized`.

Repeated scans are idempotent and do not increment the sequence again while the authorization state is unchanged.

`reject`, `needs-more-information` and `manual-policy-required` never create an authorization wake.

## Event-driven local controller

`ReviewContinuationWakeController` observes the Human Review Queue item directory with `fs.watch` and debounces changes. A periodic recovery scan remains enabled because filesystem notifications are an optimization, not a durability boundary.

The standard Workbench launcher starts this controller automatically unless `--no-review-wake` is supplied.

Headless mode:

```bash
npm run review:wake -- --home .arca-workbench
```

Single recovery scan:

```bash
npm run review:wake -- --home .arca-workbench --once
```

## Consumer acknowledgement

A downstream orchestrator lists ready pointers with:

`store.list({wakePending:true})`

After accepting a wake, it calls `acknowledgeWake` with:

- `requestId`;
- its own bounded `consumerId`;
- the pointer's current `recordHash`.

The acknowledgement is optimistic-concurrency protected. A stale hash fails closed.

Acknowledging a wake does not itself execute code or mutate the ARCA Core.

## Recovery model

The architecture deliberately combines event notification with durable state:

- if the original chat/UI disappears, the pointer remains;
- if the Workbench restarts, the controller performs a recovery scan;
- if `fs.watch` drops an event, periodic reconciliation repairs the state;
- if an optional `onWake` callback fails, the durable pointer remains `wake.pending=true` for another consumer;
- an orchestrator can resume hours or days later using the same `requestId`.

## Security boundary

Wakeup V1 does not introduce:

- shell execution;
- automatic Core mutation;
- automatic `main` writes;
- review bypass;
- remote Creator authentication;
- storage of raw provider credentials;
- storage of raw Machine Bridge params in continuation pointers.

Human approval means only that the policy gate permits continuation. The next action still requires its normal Action Registry, capability, authorization, network and publication controls.

## Next step

The next autonomy layer is a **Continuation Dispatcher** that consumes acknowledged/ready pointers and maps them to a closed continuation registry. It must not deserialize arbitrary commands from the pointer. A future Mesh adapter may convert a ready pointer into a signed/capability-checked envelope while preserving the same `requestId`.
