# Reasoning Output Review Gate V1

## Objective

Reasoning Output Review Gate V1 closes the boundary expressed by every ARCA Reasoning Result:

`privacyReclassificationRequired=true`

A semantic model can create new identifiers, inferences, allegations, sensitive categories or conclusions even when its input was already classified. Therefore the output must not inherit the input classification automatically.

V1 provides:

```text
Reasoning Result
  -> output reclassification
  -> local Human Review item
  -> Review-Gated Continuation
  -> approve / reject / needs-more-information
```

No approval is inferred from technical completion.

## Conservative default

`ReasoningOutputReviewGate` defaults the output to:

`privacyClass=restricted`

unless the caller explicitly supplies another valid privacy class.

This is intentionally conservative. The current component does not pretend to semantically infer a lower privacy class from arbitrary model text.

Callers may supply classification indicators such as:

- direct identifiers;
- financial identifiers;
- sensitive categories;
- child/adolescent data;
- private communication;
- secret/credential material;
- adverse inference/accusation;
- minimization availability;
- disputed/outdated information.

The resulting record uses the existing tamper-evident `arca-privacy-classification-v1` format.

## Review materialization

A successful reasoning result must already prove:

- `status=completed`;
- `humanReviewRequired=true`;
- `coreMutationPerformed=false`;
- `privacyReclassificationRequired=true`;
- valid provider/payload/transport correlation hashes.

The gate creates one idempotent Human Review item:

`kind=reasoning.output`

The review contains:

- requestId and payloadId;
- provider/transport/result evidence references;
- privacy classification;
- output SHA-256;
- output byte size;
- semantic output only when below the configured local-review size limit.

The idempotency key is bound to:

`requestId + outputHash`

so replaying the same result does not create duplicate review items, while a different output for the same request does not silently inherit an old approval.

## Large output minimization

Default maximum semantic output persisted in the local Human Review record:

`128 KiB`

The limit can be configured between 1 KiB and 256 KiB.

When output exceeds the limit:

- output is omitted from the review payload;
- output hash and byte size remain;
- `outputOmitted=true`;
- the caller can collect/display the terminal result separately for review.

This prevents a large model response from overflowing the Human Review store merely to preserve a copy.

The size limit is not a publication rule and does not imply that smaller output is safe to publish.

## Review-Gated Continuation

After materializing the Human Review item, the gate immediately reconciles the same `requestId` through `ReviewGatedContinuation`.

Initial state is normally:

`awaiting-human-review`

and:

`authorizedToContinue=false`.

If the reviewer later chooses:

- `approve`: the continuation becomes `authorized-to-continue` and a durable wake is produced;
- `reject`: the continuation becomes `blocked`;
- `needs-more-information`: the workflow remains paused;
- `acknowledge`: does not authorize substantive continuation under default policy.

The reasoning output therefore uses the same durable Human Review/wake infrastructure as Machine Bridge findings.

## Storage boundary

The review queue is local ARCA state under `ARCA_HOME`.

Reasoning output materialized for review is **not** sent to the GitHub Machine Bridge mailbox by this component.

For private/federated reasoning:

- request remains encrypted in durable Mesh transport;
- response remains encrypted in durable Mesh transport;
- semantic output is decrypted at origin;
- a bounded copy may be stored only in the local Human Review queue.

Future hosted deployments must apply local-at-rest encryption/access controls appropriate to their threat model.

## No automatic downgrade

A reviewer approval does not change the privacy classification by itself.

Approval means the intended substantive continuation is authorized under Human Review policy.

Privacy/publication policy remains a separate gate.

If the output is later intended for publication, it must still pass Publication Gate / redaction policy.

## Product effect

The complete private reasoning chain now becomes:

```text
private Creator/workflow request
  -> encrypted durable reasoning
  -> terminal ciphertext
  -> origin decrypt
  -> privacy reclassification
  -> Human Review
  -> durable approval wake
  -> authorized next step
```

This removes the remaining ambiguity between “the model answered” and “ARCA is allowed to use that answer substantively.”
