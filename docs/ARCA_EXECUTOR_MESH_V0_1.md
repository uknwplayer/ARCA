# ARCA Executor Mesh v0.1

Status: public integration candidate.

The Executor Mesh separates **decision authority** from **execution substrate**.

ARCA defines the Job, policy, admission requirements and provenance. Executors only execute bounded profiles. An executor never gains authority to promote Core code, widen policy, publish private material, or grant itself admission.

## Public GitHub executors

This integration declares two local candidates:

- `github-arca-linux`
- `github-arca-windows`

Both are public-only, secret-free and cost-zero at the scheduler model level. They use a dedicated `executor-queue` branch so operational queue state does not pollute `main`.

The request contract contains only:

- schema;
- bounded profile;
- request identifier;
- `public_only=true`;
- `secrets_allowed=false`.

No caller-controlled shell command is accepted.

## Profiles

- `smoke`: runtime/filesystem sanity check.
- `python-unit`: Executor Mesh contract tests.
- `node-test`: ARCA Node test suite.
- `node-check-public`: ARCA public release gate.

## Admission

Descriptors start as `CANDIDATE` and `DECLARED`. The scheduler rejects candidates. A live queue proof must succeed on the actual ARCA public repository before the descriptor can be updated to `LAB_ADMITTED` / `VERIFIED`.

## Queue branch

The queue transport writes requests to the `executor-queue` branch. Workflows triggered on that branch resolve exactly one request from the dispatch commit, then check out `main` separately and execute the latest admitted runtime code.

This preserves the separation:

```text
main
  source + policies + workflows

executor-queue
  bounded public request envelopes

GitHub-hosted runner
  executes profile
  emits hashed result artifact
```

## Scheduler

Hard filters are applied before scoring:

- admission;
- availability;
- minimum trust;
- required capabilities;
- privacy;
- secret handling;
- region;
- budget.

Eligible executors are scored by estimated cost, elapsed time, reliability penalty and unused scarce-resource penalty.

## Next proof

After merge, create `executor-queue` from `main`, dispatch one Linux smoke request and one Windows smoke request, verify result hashes and artifacts, then update both descriptors with immutable evidence.
