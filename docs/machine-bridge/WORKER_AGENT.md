# ARCA Worker Agent

Provider-independent long-running or on-demand worker process for Machine Bridge V3.

The worker implements persistent identity, capability advertisement, atomic heartbeat state, a closed action registry, cooperative claim/lease handling, lease renewal and durable terminal results over either a local filesystem transport or an authenticated GitHub repository transport.

ARCA does not require Replit, a VPS, Android, a permanent daemon or any particular host. A worker may be persistent or ephemeral as long as it advertises truthful capabilities and satisfies the storage/network guarantees required by the actions it claims.

## Run locally

```bash
ARCA_WORKER_ID=worker-home-01 ARCA_WORKER_CAPABILITIES=node,repository,aie,pncp-plan node scripts/arca-worker-agent.mjs
```

Optional runtime settings:

- `ARCA_AGENT_STATE_DIR`: worker state directory. Default: `.arca-worker`.
- `ARCA_AGENT_QUEUE_DIR`: filesystem durable queue root. Default: `<state>/remote-jobs`.
- `ARCA_AGENT_HEARTBEAT_MS`: heartbeat interval. Minimum 15000 ms.
- `ARCA_AGENT_POLL_MS`: queue discovery interval. Minimum 1000 ms.
- `ARCA_AGENT_LEASE_MS`: claim lease duration. Minimum 15000 ms.
- `ARCA_AGENT_ONCE`: process currently available work and exit.
- `ARCA_AGENT_MAX_JOBS`: maximum one-shot jobs. Default 20, maximum 100.

## GitHub repository transport

Set `ARCA_AGENT_TRANSPORT=github` together with:

- `ARCA_GITHUB_REPOSITORY=owner/repository`
- `ARCA_GITHUB_REF=<queue-ref>` (default: `arca-runtime`)
- `ARCA_GITHUB_TOKEN=<repository write token>`

The token is used as the repository authentication boundary and is never written into worker descriptors, jobs, claims or results. A successful worker registration is written to `remote-jobs/workers/<worker-id>.json` with the transport identity and target ref, not the token.

The GitHub Actions worker uses the canonical implementation from `main` while reading and writing durable queues on the requested target ref. This prevents workload branches from replacing the trusted worker implementation.

## Queue layout

Both transports implement the same logical V3 layout:

- `queues/shared/`
- `queues/<worker-id>/`
- `workers/` for remote worker registrations
- `claims/`
- `results/`

Jobs must use `arca-remote-job-v3`, pass strict protocol validation, match worker capabilities and refer to a registered action. Malformed or incompatible jobs are ignored rather than converted into authoritative failures.

## Registered actions

The default registry exposes only explicit actions:

- `worker.ping`
- `worker.describe`
- `repository.test` — fixed `npm test`, requires `node,repository`
- `repository.check` — fixed `npm run check`, requires `node,repository`
- `aie.analyze` — bounded deterministic AIE analysis over records supplied in the job, requires `aie`
- `aie.procurement-profile` — offline normalization and analytical profile of supplied public-procurement records, requires `aie`
- `pncp.plan` — creates an allowlisted public PNCP detail GET plan without network access, requires `pncp-plan`
- `pncp.discovery-plan` — creates a bounded PNCP public consultation plan without network access, requires `pncp-plan`

`aie.analyze` is analytical only. It can run robust outlier, recurrent low-competition and concentration detectors, and returns hypotheses and limitations with `humanReviewRequired: true`.

`aie.procurement-profile` normalizes supplied procurement records, resolves supplier aliases only through exact normalized CNPJ, records normalization gaps instead of inventing values, and applies the currently ported price, competition, concentration and additive-burden detectors. Its output remains exploratory and `humanReviewRequired: true`.

Both AIE actions accept at most 10,000 records per job. Neither modifies the Core or declares guilt, fraud, crime or legal irregularity.

`pncp.discovery-plan` applies the Machine Bridge remote discovery ceilings before execution. It cannot switch network access on through job parameters.

### Optional PNCP public-network worker

`pncp.acquire-public` and `pncp.discovery-public` are not part of the default registry. They are registered only when the worker has capability `pncp-public-network` **and** starts with all of the following host-side settings:

- `ARCA_PNCP_PUBLIC_NETWORK_ENABLED=true`
- `ARCA_PNCP_CUSTODY_HOME=<persistent custody directory>`
- `ARCA_PNCP_STAGING_ROOT=<authorized staging directory>`

Each network job must additionally contain `authorizePublicNetwork: true` and its required investigation/source context. Job parameters cannot override the PNCP host/base URL, HTTP method or custody paths.

`pncp.discovery-public` also requires a bounded discovery scope: start/end dates, at least one of CNPJ/IBGE municipality/UF, and one or more modality identifiers. Its remote ceilings are fixed in code and cannot be raised by a job.

Example worker configuration:

```bash
ARCA_WORKER_ID=worker-pncp-01 \
ARCA_WORKER_CAPABILITIES=node,repository,pncp-plan,pncp-public-network \
ARCA_PNCP_PUBLIC_NETWORK_ENABLED=true \
ARCA_PNCP_CUSTODY_HOME=/srv/arca/custody \
ARCA_PNCP_STAGING_ROOT=/srv/arca/staging \
node scripts/arca-worker-agent.mjs
```

The acquisition actions store received bytes in the configured custody layer before releasing parsed or derived metadata. Results return hashes, public URLs and custody references rather than raw response buffers.

The canonical hosted GitHub Actions worker deliberately does not advertise `pncp-public-network` because its local filesystem is ephemeral. Users are free to attach another worker implementation or host when network acquisition with durable custody is required. The architecture does not prefer one provider.

No job field is interpreted as shell text. New actions must be registered in code.

## Submit a remote job

The submitter writes a V3 job, then sends `repository_dispatch: arca_job_available` as the fast-path wake-up signal. The scheduled controller remains the recovery path. Operational queue writes are kept off `main`; `repository_dispatch` is the fast path and the scheduled controller recovers unresolved work from `arca-runtime`.

```bash
ARCA_GITHUB_TOKEN=... npm run remote:submit -- \
  --repo owner/repository \
  --ref arca-runtime \
  --action worker.ping \
  --params '{"echo":"hello"}'
```

Tokens must be supplied through environment variables, not command-line arguments.

A production installation that chooses a persistent worker SHOULD run it under the host service manager (systemd, launchd, Windows Service, container restart policy, etc.) rather than requiring an open terminal. This is an operational choice, not an ARCA protocol requirement.

The Agent is not a remote arbitrary shell. It executes only registered Machine Bridge actions.
