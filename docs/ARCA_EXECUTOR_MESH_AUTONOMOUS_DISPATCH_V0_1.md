# ARCA Executor Mesh — Autonomous Dispatch v0.1

Status: transport implementation verified by tests; remote execution path live-verified; autonomous control-plane credential proof pending.

This increment supplies the missing concrete transport between the ARCA scheduler and a public GitHub execution domain. The scheduler still selects an admitted executor. The transport can persist the bounded request directly in either the canonical queue branch or the satellite repository without a human-authored dispatch commit.

## Authority boundary

The transport credential belongs exclusively to the ARCA control plane. It is read from `ARCA_GITHUB_DISPATCH_TOKEN`, sent only as an HTTPS authorization header, and never copied into queue JSON, logs, commits, artifacts, result payloads, or dispatch references.

The token should be a GitHub App installation token or fine-grained token restricted to:

- repository: `uknwplayer/arca-execution-satellite`;
- permission: Contents read/write;
- no Actions write permission;
- no Administration, Secrets, Workflows, Pull requests, Issues, or Metadata write permission.

The satellite workflow itself retains `contents: read`, disables persisted checkout credentials, accepts no secrets and cannot alter the Core.

## Transport allowlist

The client rejects every repository, branch and path not explicitly listed by the control plane. The initial satellite boundary is:

- repository `uknwplayer/arca-execution-satellite`;
- branch `main`;
- prefixes `queue/requests/` and `queue/windows/requests/`.

Requests remain exact `arca.public-executor-request.v0.1` envelopes. No caller-controlled command or shell text exists in the contract.

## Idempotency

The queue filename is derived from the validated job ID. Re-dispatch with byte-identical content resolves to the commit that created the existing path. Reuse of the same job ID with different content fails closed as an idempotency conflict.

## Verified remote path

A live bounded Linux request was executed through the admitted satellite queue after Executor Mesh 002 was merged:

- request: `arca-mesh003-live-linux-001`;
- dispatch commit: `99a1330e3fe4689db46da3321486c24ee3546a95`;
- satellite run: `35519411694`;
- conclusion: `success`;
- semantic result SHA-256 independently recomputed and matched;
- artifact ZIP SHA-256 independently computed and matched the GitHub artifact digest.

See `docs/ARCA_EXECUTOR_MESH_REMOTE_PATH_PROOF_001.md`.

This proves the remote execution half of the path. It does not prove that the canonical ARCA control-plane workflow created the request using its least-privilege credential.

## Remaining live proof procedure

1. Install the least-privilege credential as `ARCA_SATELLITE_DISPATCH_TOKEN` in the `uknwplayer/ARCA` control repository.
2. Run **ARCA Executor Mesh Dispatch** with a new public job ID, `profile=smoke`, the desired OS and `disable_local=true`.
3. Confirm the scheduler selected the matching `github-satellite-*` executor.
4. Confirm `GitHubContentsQueueTransport` returned the satellite dispatch commit SHA.
5. Confirm the satellite push triggered exactly one queue workflow.
6. Download the single result artifact, recompute the semantic result hash and bind the proof to the dispatch commit and workflow run.

Until these steps succeed, this increment must not be described as a live autonomous cross-repository proof.
