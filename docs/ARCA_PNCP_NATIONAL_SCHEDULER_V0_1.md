# PNCP National Scheduler V0.1

Status: **FOUNDATION**

## Purpose

The scheduler wakes the PNCP Observer in small, recoverable cycles. It does not replace investigative agents. Its job is to decide which federative-unit shard runs next, preserve progress and deliver classified signals to the shared investigation runtime.

## Cycle

The default cycle processes three state shards in deterministic UF-code order. After every shard, an atomic checkpoint records only derived counts, timestamps and hashes. Raw responses, source locators, record contents and exception messages are excluded.

A process restart loads the same checkpoint and skips completed shards. Failed shards are recorded by a safe error reference and are not retried unless the caller explicitly enables retry.

## Network gate

Offline fixture runners may validate the scheduler without network access. A network-enabled runner requires both:

- `authorizePublicNetwork: true`;
- the exact confirmation `PNCP_PUBLIC_GET_ONLY`.

The existing connector and custody requirements remain authoritative after this gate.

## Agent handoff

For every successful shard:

1. the discovery runner returns the bounded, custody-aware PNCP result;
2. a classifier emits zero or more actionable observations;
3. the national ingress deduplicates each observation into a shared investigation;
4. the event runtime wakes the private investigative backend;
5. specialized agents perform analysis later under their own contracts.

Thus the Observer filters and schedules; agents continue to investigate, challenge hypotheses, correlate evidence and prepare material for human review.

## Failure behavior

A shard fails closed when its result belongs to another UF, classification exceeds its budget, ingestion rejects an observation or any dependency fails. Partial ingestion is safe to retry because canonical investigations and observation triggers are deterministic.
