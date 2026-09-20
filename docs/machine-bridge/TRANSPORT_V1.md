# Worker Transport V1

Transport is separated from execution. An Agent may use GitHub-backed durable queues today and another broker later without changing job semantics.

## Contract

A transport implementation exposes these logical operations:

- list(worker): dedicated jobs plus compatible shared jobs
- claim(job, worker, lease): atomically acquire or reject
- renew(claim): extend a live lease
- complete(claim, result): publish one authoritative terminal result
- release(claim, reason): relinquish work for delegation
- heartbeat(worker): publish liveness/capabilities

## Cooperative routing

Dedicated jobs are visible only to the target worker. Shared jobs are filtered by required capabilities. A worker that cannot satisfy a job does not claim it.

## Lease

Default lease is 120 seconds. Renewal should occur before half the lease elapses. If a worker disappears, the expired claim becomes eligible for reassignment. Result publication must verify the active claim holder.

## Security

Transport credentials are scoped separately from action execution. Jobs contain declarative action names and parameters, never arbitrary shell commands.
