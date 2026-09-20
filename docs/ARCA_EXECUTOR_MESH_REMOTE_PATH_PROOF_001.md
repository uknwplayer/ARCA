# ARCA Executor Mesh — Remote Path Live Proof 001

Status: VERIFIED remote execution path; autonomous control-plane credential proof still pending.

## Purpose

This proof verifies the live remote execution half of Executor Mesh 003 without overstating control-plane autonomy.

A bounded public request envelope was persisted in the admitted satellite queue. The satellite GitHub workflow reacted to the queue commit, executed the bounded `smoke` profile, uploaded exactly one result artifact, and the artifact was independently decoded and cryptographically checked.

This proof does **not** claim that the canonical ARCA `workflow_dispatch` used `ARCA_SATELLITE_DISPATCH_TOKEN`. That credential path remains a separate proof.

## Live Linux execution

- target repository: `uknwplayer/arca-execution-satellite`
- executor: `github-satellite-linux`
- request id: `arca-mesh003-live-linux-001`
- queue path: `queue/requests/arca-mesh003-live-linux-001.json`
- dispatch commit: `99a1330e3fe4689db46da3321486c24ee3546a95`
- workflow: `ARCA Queued Public Executor Linux`
- run id: `35519411694`
- conclusion: `success`
- profile: `smoke`
- observed platform: `Linux-6.17.0-1022-azure-x86_64-with-glibc2.39`
- Python: `3.12.14`
- request SHA-256: `0d64ea1bcd9bf02eac4553339ffb95886202725d52d45259a76fc57eeda757bd`
- semantic result SHA-256: `4a86b803611a738a20270aa2295039801d221d539e127ff05e1adc4983e68858`
- artifact id: `10607603340`
- artifact digest / independently computed ZIP SHA-256: `sha256:93c18db0835259b940782253e16cb431d548388a836b59d2a450543d2631d076`

The artifact contained exactly one `execution-result.json`.

The unsigned canonical JSON payload was re-serialized with sorted keys and compact separators, then hashed with SHA-256. The recomputed value was:

```text
4a86b803611a738a20270aa2295039801d221d539e127ff05e1adc4983e68858
```

It exactly matched the executor-declared `result_sha256`.

The result reported:

```text
exit_code = 0
checks = python-runtime, filesystem-write
source = git-queue
```

## What this proves

The following live chain is verified:

```text
bounded public queue envelope
        |
        v
satellite repository
        |
        v
path-filtered GitHub workflow
        |
        v
github-satellite-linux
        |
        v
bounded smoke execution
        |
        v
single result artifact
        |
        v
independent semantic hash verification
```

The remote execution substrate therefore remains operational after Executor Mesh 002 was merged.

## What remains unproven

Executor Mesh 003 is not yet fully live-proven until the canonical ARCA workflow itself:

1. reads the least-privilege `ARCA_SATELLITE_DISPATCH_TOKEN`;
2. invokes `GitHubContentsQueueTransport`;
3. creates the satellite queue envelope without a human-authored queue commit;
4. receives the resulting dispatch SHA;
5. observes and verifies the satellite result.

Until that run succeeds, the correct status is:

```text
remote execution path: VERIFIED
autonomous control-plane transport: IMPLEMENTED / LIVE PROOF PENDING
```
