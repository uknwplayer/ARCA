# ARCA Machine Bridge Protocol V3

Machine Bridge connects controllers and heterogeneous workers without requiring any specific provider.

## Job lifecycle

queued -> claimed -> completed | failed
                 \-> lease-expired -> queued

Jobs use `arca-remote-job-v3` and are validated before routing. Invalid structures, unknown actions and unmet capabilities do not become authoritative failures; they are ignored/delegated.

## Worker descriptor and registration

Workers advertise an id and capabilities. Jobs SHOULD express requirements instead of a fixed worker. `workerTarget` is reserved for workloads that truly require a specific worker.

Remote transports MAY persist a registration. The GitHub transport stores `arca-worker-registration-v1` under `remote-jobs/workers/<worker-id>.json`. Authentication is provided by the repository bearer token used to create/update that registration; secrets are never persisted in the registration.

## Claim / lease

A worker MUST claim a job before execution. A claim contains `jobId`, `workerId`, `claimedAt`, `leaseExpiresAt` and `attempt`. Only the active lease holder may publish the authoritative result. An expired lease permits reassignment.

The filesystem transport uses exclusive file creation. The GitHub transport uses create/update conflicts plus the current content SHA as optimistic concurrency control. A competing claimant that loses the write race receives no claim.

## Results

Terminal results use `arca-result-v1` with protocol version 3. Result creation is idempotent: once a terminal result exists for a `jobId`, later attempts do not replace it.

## Queues

- `remote-jobs/queues/<worker-id>/` — explicitly routed jobs
- `remote-jobs/queues/shared/` — capability-routed jobs
- `remote-jobs/workers/` — remote worker registrations
- `remote-jobs/claims/` — durable leases
- `remote-jobs/results/` — durable terminal results

## Trust boundary

Controller and canonical worker implementations live on the trusted source branch. The canonical hosted deployment uses `main` for reviewed implementation and `arca-runtime` for durable jobs, claims, worker registrations and results. The GitHub Actions worker checks out the canonical implementation from `main`, then operates on the pinned operational state ref through the GitHub API. Library consumers may choose another explicit ref for self-hosted transports, but source evolution and mutable operational state should remain separated.

Workers execute only registered actions. Arbitrary shell text is not a protocol action. Fixed repository actions may invoke predetermined commands such as `npm test` or `npm run check`; job parameters cannot alter those commands.

## Delivery

Fast path: authenticated job submission writes the durable queue item and sends `repository_dispatch: arca_job_available` with the target ref.

Recovery path: the controller periodically scans durable targeted/shared queues and dispatches a worker only when it finds a valid V3 job without a terminal result.

Delivery is at-least-once. Claims plus idempotent terminal-result creation prevent duplicate authoritative execution.
