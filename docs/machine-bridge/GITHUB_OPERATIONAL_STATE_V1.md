# GitHub Operational State V1

## Status

Implemented foundation for separating Machine Bridge durable operational state from the canonical source branch.

## Goal

Machine Bridge uses GitHub as one durable transport option for queues, claims, worker registrations, Mesh mailboxes, encrypted Opaque RPC mailboxes and terminal results. Those records are runtime state, not source code.

GitHub Operational State V1 establishes a dedicated state ref:

`arca-runtime`

while keeping trusted executable implementation on:

`main`

The intended relationship is:

```text
main
  -> canonical reviewed implementation
  -> branch/PR/CI/review-gated source changes

arca-runtime
  -> durable jobs
  -> claims/leases
  -> worker registrations
  -> Mesh mailboxes
  -> encrypted Opaque RPC state
  -> results / rendezvous metadata
```

## Security properties

1. The canonical GitHub Actions worker checks out implementation from `main`.
2. Its durable queue/ref is independently pinned to `arca-runtime`.
3. The hosted worker rejects another operational target ref.
4. The closed Mesh workflow rejects another mailbox target ref.
5. Controller recovery reads unresolved work from `arca-runtime`.
6. Runtime queue commits no longer need to advance `main`.
7. Repository dispatch remains the fast wake-up path; scheduled controllers remain restart/recovery paths.
8. This separation does not grant new actions, shell access, network authority or Core mutation.
9. Capability verification remains separate from authorization.
10. Private Opaque RPC state remains ciphertext-only according to its existing protocol constraints.

## Library behavior

The GitHub-backed Machine Bridge transports now default to `arca-runtime`:

- `GitHubMachineBridgeTransport`;
- `GitHubMeshMailboxTransport`;
- `GitHubOpaqueRpcMailboxTransport`.

Callers may still pass an explicit ref at the library layer for portable/self-hosted deployments. The canonical hosted workflows are stricter and pin the operational ref to `arca-runtime`.

## CLI/runtime behavior

When `ARCA_GITHUB_REF` / `--ref` is omitted, the GitHub worker, review sync, remote submit/call and Mesh mailbox runtime use `arca-runtime`.

Tokens continue to be supplied out-of-band and are not persisted into queue/mailbox records.

## Controller behavior

### Machine Bridge V3

`arca_job_available` carries only the target ref needed for recovery. The canonical controller accepts `arca-runtime`, discovers unresolved jobs there and dispatches the trusted worker implementation from `main`.

Pushes containing runtime queue data are no longer required to trigger the controller.

### Mesh V0 recovery

The Mesh recovery controller scans `remote-mesh/queues/**` on `arca-runtime` and redispatches unresolved closed-topology envelopes. The execution workflow still comes from `main`.

## Existing state on main

Historical runtime records already committed to `main` remain evidence of earlier probes. V1 stops using `main` as the default mutable rendezvous surface; it does not rewrite Git history.

A later cleanup may remove obsolete live-state fixtures from the source tree after the new state ref has been proven end-to-end.

## Deployment prerequisite

The repository must contain an `arca-runtime` branch/ref before the first canonical hosted write. It may be initialized from a reviewed commit; runtime processors subsequently use that ref only as durable state.

## Non-goals

This milestone does not yet:

- move rendezvous to a separate repository/provider;
- provide public federation or Sybil resistance;
- make GitHub mandatory for Machine Bridge;
- change exactly-once guarantees;
- enable arbitrary remote execution;
- enable remote Creator exposure.

It is an isolation boundary between source evolution and operational rendezvous state.
