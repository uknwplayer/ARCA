# ARCA PNCP Source Availability V0.1

State: **OFFLINE GATE**

This contract separates public-source availability failures from internal scheduler failures.

A PNCP shard may fail because the public source does not answer, times out, drops a socket, returns a retryable server error, or cannot be resolved. Those conditions do not establish anything about the underlying procurement record and must not be represented as procurement irregularities.

## Typed source-unavailable failures

The national PNCP discovery runner may convert recognized transport/source-availability failures into:

```
code: ARCA_PNCP_SOURCE_UNAVAILABLE
sourceFailureRef: code:<SAFE_CODE> | sha256:<SAFE_HASH>
```

Raw error messages are not copied into the scheduler checkpoint.

Recognized source-availability classes include bounded timeout/abort conditions, common network transport cause codes, HTTP 429, and HTTP 5xx responses.

Parsing errors, custody failures, contract violations, invalid discovery results and other internal failures are **not** converted into source availability events.

## Scheduler semantics

Source availability continuation is opt-in through `continueOnSourceUnavailable=true`.

When enabled, a typed source-unavailable shard is written to the checkpoint under `unavailable` with:

- category `SOURCE_UNAVAILABLE`;
- attempt count;
- observation timestamp;
- sanitized failure reference;
- `humanReviewRequired=true`;
- `anomalyIsNotIrregularity=true`.

It does not increment the hard-failure counter.

The scheduler can then continue to later shards until either the shard budget, the hard-failure budget, or the source-unavailable budget is exhausted.

## Retry policy

Unavailable shards are not automatically retried. They remain skipped on later cycles unless `retryUnavailable=true` is supplied explicitly.

A successful explicit retry removes the availability gap and moves the shard into the completed set.

This prevents a temporarily unavailable UF from monopolizing every national cycle.

## Completion state

If all national shards have either completed or produced bounded source-availability outcomes, and there are no hard failures, the checkpoint may finish as:

`COMPLETED_WITH_AVAILABILITY_GAPS`

This means the scheduler completed the bounded observation cycle while some public source scopes were unavailable. It does not mean those scopes contain irregularities.

## Safety boundary

This V0.1 stage does not automatically open an investigation for every transient outage. It establishes a clean observer outcome first.

A later policy may decide when repeated or material source unavailability should be routed through the existing `SOURCE_UNAVAILABLE` investigation ingress, for example after persistence across multiple cycles.

No continuous national live scan is authorized by this contract.
