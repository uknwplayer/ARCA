# PNCP National Offline Attestation V0.1

Status: **FOUNDATION**

## Purpose

This attestation is the gate between the completed national offline proof and any future live PNCP collection.

It records a deterministic, hash-verifiable statement that the national scheduler/runner composition completed all 27 federative-unit shards in offline mode, with custody present for every shard and no failed shard.

## What it binds

The attestation binds:

- repository and exact code revision;
- scheduler, runner and checkpoint contract identifiers;
- national plan fingerprint;
- the ordered set of 27 completed shard IDs;
- a digest of per-shard result hashes and derived counts;
- custody-manifest count;
- the explicit fact that network use was false.

No raw PNCP response, source locator, exception text or investigative content is included.

## Fail-closed conditions

Attestation generation fails if any of the following is true:

- the cycle is not `COMPLETED`;
- fewer than 27 shards completed;
- any shard failed;
- a result hash is malformed;
- the checkpoint plan fingerprint differs from the cycle fingerprint;
- fewer than 27 custody manifests are present;
- custody-before-parsing is not asserted;
- network use is anything other than exactly `false`.

## Authorization boundary

A verified offline attestation does **not** authorize a live request.

It explicitly preserves:

- `publicNetworkAuthorized=false`;
- `realCollectionAuthorized=false`;
- `executionAuthorized=false`;
- `automaticAdversePublication=false`;
- `humanReviewRequired=true`;
- `anomalyIsNotIrregularity=true`.

The next live step must therefore be a separate, explicit, bounded authorization path.
