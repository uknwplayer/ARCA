# ARCA Durable Shared Investigation Queue V0.1

Status: **FOUNDATION**

## Purpose

This contract gives ARCA a durable, shared work queue for autonomous investigations across Brazil. A human session does not create a private copy of an investigation. Requests for the same normalized scope converge on one canonical record, and interested people become subscribers to that shared record.

The queue is infrastructure only. It does not start a real investigation and it does not publish allegations.

## Operating model

- ARCA may enqueue work after an autonomous anomaly, a public-source change, a scheduled review, or a human request.
- Ten people requesting the same scope produce one investigation with ten subscribers, not ten independent workers.
- Humans can watch, comment, confirm, submit a public source, dispute a finding, or request deeper review.
- A watch, comment, or confirmation is preserved without waking a worker.
- A public source, dispute, or deepen request creates a durable wake reason.
- Workers claim investigations through exclusive, expiring leases. An active lease prevents duplicate processing; an expired lease is recoverable.
- Failed work remains pending. Successful completion acknowledges only the wake reasons handled by that lease.
- Queue state, contributions, attempts, and publication gates survive process restarts.

## Canonical identity

The investigation identifier is derived from a normalized tuple:

1. jurisdiction;
2. subject reference;
3. topic;
4. time window;
5. ordered public-source scopes.

Equivalent casing, spacing, and source-scope order produce the same identifier. A municipality, state, federal body, or national scope is represented by the same generic contract; there is no locality-specific default.

## State model

The supported progression is:

`LEAD → TRIAGE → COLLECTION → ANALYSIS → ADVERSARIAL_VERIFICATION → HUMAN_REVIEW`

Terminal outcomes are `PUBLICABLE`, `ARCHIVED`, and `REJECTED`. Transition to `PUBLICABLE` requires an explicit human-review assertion. Queue persistence never bypasses the evidence, provenance, privacy, or publication-boundary rules elsewhere in ARCA.

## Durability and concurrency

Each investigation is stored separately and updated with an atomic temporary-file, synchronization, and rename sequence. Record locks are acquired exclusively and fail closed while active. A stale lock may be recovered after its configured timeout.

Worker ownership is also fail closed:

- only the lease owner can renew or complete work;
- a second worker cannot claim an active investigation;
- an expired lease can be reclaimed and increments the attempt counter;
- completion is recorded before the lease is released.

This foundation targets a single durable filesystem shared by cooperating processes. A later adapter may implement the same contract on a transactional database without changing the human or worker semantics.

## Safety boundary

The queue accepts references and structured metadata, not raw investigative artifacts, credentials, secrets, or executable references. Publication remains a separate, explicitly reviewed action. Public-source contributions are prompts for verification, never automatic proof.

## Verification

The test suite covers:

- shared deduplication across ten human requests;
- restart persistence and canonical normalization;
- passive versus worker-waking contributions;
- exclusive leases and expired-lease recovery;
- retry behavior after failure;
- priority independent of audience size;
- publication review after restart;
- rejection of unsafe references;
- active-lock failure and stale-lock recovery.
