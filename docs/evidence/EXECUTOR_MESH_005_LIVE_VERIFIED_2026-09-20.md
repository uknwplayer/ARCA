# Executor Mesh 005 — LIVE VERIFIED

Date: 2026-09-20
Status: LIVE VERIFIED
Canonical repository: `uknwplayer/ARCA`
Canonical main SHA under test: `06c407d89072f4a5d5a6800f7bf2027a5ac7de2b`

## Gate

Mesh 005 required a live, controlled transient failure in the first eligible remote execution domain, autonomous fallback to a second independently addressable domain, successful bounded execution there, canonical result verification, and preservation of failed-attempt provenance.

## Live proof

Canonical workflow run: `35525872863`
Job: `arca-mesh005-live-failover-004`
Profile: `smoke`
Local execution disabled: `true`
Controlled Satellite A transient failure: `true`

Observed attempt history:

1. `github-satellite-linux` / `github-git-queue`
   - outcome: `TRANSIENT_FAILURE`
   - detail: `Mesh005 controlled transient failure: Satellite A`
2. `github-satellite-b-linux` / `github-git-queue-b`
   - outcome: `DISPATCHED`
   - external id: `6babdc5ff2252b9199611653a23bfe409fd3ed7d`

Satellite B workflow run: `35525880822`
Satellite B job: `execute`
Conclusion: `success`

Artifact:
- id: `10610150619`
- name: `arca-satellite-b-linux-result-35525880822`
- expired: `false`
- artifact digest: `sha256:953ed5076d06f69ee033f3a6da77d8db49f19168a809ab3b36da42fd446cfe4b`

Canonical accepted receipt:
- schema: `arca.executor-receipt.v0.1`
- executor: `github-satellite-b-linux`
- provider family: `github-git-queue-b`
- dispatch correlation/external id: `6babdc5ff2252b9199611653a23bfe409fd3ed7d`
- result SHA-256: `14a9024a4fae73345eea0fa42f632fba5fe3c056ddfef1ee6d91574524be04d5`
- verification state: `ACCEPTED`

## Conclusion

The live gate is satisfied: the first eligible satellite failed transiently, the dispatcher preserved that provenance, advanced to a separately addressed provider/execution domain, Satellite B executed successfully, and the canonical control plane accepted the returned result only after Mesh 004 verification.

This evidence establishes availability/failover behavior. It does not grant additional execution authority, relax trust admission, permit secrets in public jobs, or allow providers to self-promote.
