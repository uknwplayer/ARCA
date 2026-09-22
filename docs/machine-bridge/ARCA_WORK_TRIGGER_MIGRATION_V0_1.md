# ARCA Work Trigger Migration V0.1

**Status:** MIGRATION REQUIRED / CANONICAL CODE PRESENT / NATIVE WORK EVENT BINDING NOT YET PROVEN

Date: 2026-09-22

## Purpose

Restore the previously proven ChatGPT Work GitHub event-triggered liveness path on the canonical repository `uknwplayer/ARCA` after the legacy repository `uknwplayer/arca-core-v1-foundation` was archived.

The canonical ARCA already contains the bounded Work execution plane: Execution Endpoint V0.1, Work Machine Bridge Worker V0.2 and repository.verify-ref V0.3. What is missing is not core code; it is an external ChatGPT Work event-task binding to the new repository/PR surface.

## Evidence and diagnosis

- Legacy PR #141 on `uknwplayer/arca-core-v1-foundation` previously produced `WORK-WAKEUP-ACK` and signed bounded `ARCA-WORK-RESULT-V1` comments from a GitHub event-triggered ChatGPT Work task.
- The legacy repository is archived and GitHub rejects new content writes with HTTP 403, so it can no longer receive a fresh commit wake stimulus.
- Canonical ARCA PR #90 (`test(work): WORK-ACCESS-CHECK-V2`) received a fresh liveness commit with token `ARCA-WAKE-20260922-WORK-ACCESS-CHECK-V2-001`.
- No `WORK-WAKEUP-ACK` was observed on PR #90 after the commit.
- Therefore Work reachability on the canonical repository is **not proven**. Absence of ACK is not proof that ChatGPT Work itself is unavailable; it is consistent with the event task still being bound only to the archived legacy repository.

## Required external binding

Configure a ChatGPT Work event-triggered task to observe pull-request commit updates in:

- repository: `uknwplayer/ARCA`
- isolated PR: `#90` (`test(work): WORK-ACCESS-CHECK-V2`)
- relevant path: `experiments/work-wakeup/PROBE.md`

The event task must be bounded to the following behavior:

1. React only to the configured pull-request commit/update event.
2. Inspect the current PR and `experiments/work-wakeup/PROBE.md`.
3. If the file contains a probe token not already acknowledged, add exactly one top-level PR comment containing:
   - `WORK-WAKEUP-ACK`;
   - the exact probe token;
   - the observed PR head commit SHA;
   - a short statement that activation came from the GitHub event-triggered Work task.
4. Stop after the acknowledgement.

## Forbidden behavior

The liveness task must not:

- merge or close the PR;
- mark it ready for review;
- mutate `main`;
- change repository settings;
- read or expose unrelated secrets;
- execute an older signed dispatch;
- run arbitrary shell;
- treat wake as claim, execution, trust or authority.

Canonical invariant: `wake != claim != execution != authority`.

## Acceptance procedure

After the external Work event binding is configured:

1. Read PR #90 and confirm the current probe token.
2. Create a fresh commit changing only the probe token in `experiments/work-wakeup/PROBE.md`.
3. Do not send a new human Work/chat message after the commit.
4. Observe PR #90 for one `WORK-WAKEUP-ACK` matching the new token and exact observed head SHA.
5. Verify there was no merge, `main` mutation or unrelated repository change.
6. Record the ACK comment URL, commit SHA and timestamps in a numbered ARCA checkpoint.

PASS requires all six conditions. Missing ACK is `INCONCLUSIVE/UNREACHABLE_FROM_CONFIGURED_SURFACE`, never evidence that a job did not execute elsewhere.

## Next gate after liveness

Only after liveness PASS may ARCA test the canonical bounded Work dispatch using `worker.ping`. `repository.verify-ref` or other capabilities remain a later gate. The first post-migration test must remain idempotent, signed, allowlisted, correlation-bound and incapable of merge/main mutation.

## Relationship to Vince and Edge Steward

This migration supplies one possible execution endpoint for future Vince routing. Vince must discover/observe Work availability rather than assume it. Edge Steward may later perform liveness observation/reconciliation, but its implementation remains frozen until the investigative core reaches the agreed gate.
