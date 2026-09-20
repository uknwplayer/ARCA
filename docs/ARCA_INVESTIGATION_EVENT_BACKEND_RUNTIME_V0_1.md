# Investigation Event Backend Runtime V0.1

Status: **FOUNDATION**

## Result

This runtime connects the durable shared investigation queue to ARCA's durable event fabric and a deployment-supplied private investigative backend.

The order is deliberate:

1. persist the canonical queue work;
2. persist a minimal wake event;
3. claim an exclusive worker lease;
4. obtain an idempotent private work receipt;
5. acknowledge only the wake reasons covered by the lease.

A failure at step 2 can be recovered from the still-pending queue. A failure at step 4 releases the lease as failed while preserving the pending reasons.

## National scope

The runtime has no municipality-specific path or default. Municipality, state, federal and national scopes use the same queue identity and delivery contract. Source adapters such as PNCP can generate candidates anywhere in Brazil without changing the runtime.

## Minimal event boundary

Wake events contain only:

- investigation identifier;
- opaque reason identifier and kind;
- priority;
- mandatory human-review flag.

The canonical scope, participant identity, comment text, source locator, raw artifact, credentials and secrets are excluded. The private backend receives only the minimal work envelope needed to create an idempotent receipt.

## Human participation

Passive contributions remain durable but do not wake the backend. Public sources, disputes and deepen requests create wake reasons. Multiple humans interested in the same canonical investigation still share one queue record and one execution claim.

## Recovery

Work written before an event can be replayed after restart. The stable event body makes an already-persisted event a duplicate rather than a second execution.

A failed delivery is never silently redelivered. An explicitly authorized recovery creates a distinct persisted retry event. The private backend must use the event identifier as its idempotency key.

## Publication boundary

Private acceptance means only that derived investigative work is pending. It is not evidence, a finding or authorization to publish. The human-review gate remains mandatory.
