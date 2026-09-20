# PNCP National Watcher Runtime V0.1

Status: **FOUNDATION**

## Result

The PNCP watcher now has a national planning contract and a safe path into the shared investigation runtime.

Coverage is divided deterministically across all 27 federative units. There is no preferred municipality and no municipality-specific execution path. A municipality can be represented by the same generic jurisdiction contract when a signal has local scope.

## What creates work

A new publication alone is informational and does not automatically create an investigation. Work is created only for an actionable observation:

- potential integrity relevance;
- material public-record change;
- provenance change;
- source unavailability.

These labels are triage signals, not findings. Every observation must assert that anomaly is not irregularity and that human review remains required.

## Flow

1. Build 27 bounded PNCP discovery shards.
2. Keep public network access blocked until the existing explicit authorization gate is satisfied.
3. Preserve successful responses in custody before classification.
4. Produce an actionable observation from derived analysis.
5. Deduplicate it into a canonical shared investigation.
6. Persist the wake event and obtain a private backend receipt.
7. Keep any adverse publication behind human review.

## Privacy and separation

The wake event does not carry the PNCP URL, record reference, jurisdiction, participant identity or raw response. Those values remain on the queue/source side and in the private investigative domain according to existing custody rules.

## Operational limits

Each state shard has independent page and record ceilings. Concurrency is bounded, ordering is deterministic, and the plan reports total worst-case pages and records for the national cycle. This version creates the plan and ingestion contract; a later scheduler will execute shards incrementally with durable checkpoints.
