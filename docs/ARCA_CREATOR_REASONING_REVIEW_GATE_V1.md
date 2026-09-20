# Creator Reasoning Review Gate V1

## Objective

Creator Reasoning Review Gate V1 connects three previously separate ARCA guarantees into one product flow:

1. durable encrypted reasoning;
2. output privacy reclassification;
3. explicit Creator Human Review before substantive continuation.

The resulting lifecycle is:

```text
Creator Chat
  -> awaiting-reasoning
  -> result-ready
  -> collect/decrypt at origin
  -> privacy reclassification
  -> awaiting-human-review
  -> Creator decision
      -> approve -> completed / continuation wake
      -> reject -> blocked
      -> needs-more-information -> paused
```

A technically completed model call is therefore not treated as an authorization decision.

## Creator durable reasoning integration

`createCreatorDurableReasoningHandlers(...)` now owns a `ReasoningOutputReviewGate`.

The default gate uses the same local `ARCA_HOME` as the durable reasoning coordinator.

When an encrypted reasoning result is collected:

1. the terminal result is decrypted at the origin;
2. the verified reasoning result is reconstructed;
3. the output is classified again, conservatively as `restricted` by default;
4. a local `reasoning.output` Human Review item is materialized;
5. the returned Creator lifecycle becomes `awaiting-human-review` unless the exact review has already been approved.

The response may show the semantic output to the authenticated Creator for review, but the output is not authorized for Core mutation, publication or arbitrary workflow continuation merely because it is visible.

## Review status recovery

After review materialization, Creator reasoning status also reflects the review gate.

For the same `requestId`:

- pending review -> `awaiting-human-review`;
- rejected review -> `blocked`;
- needs-more-information -> `needs-more-information`;
- approved review -> `completed` with `authorizedToContinue=true`.

This prevents browser polling from mistaking the already-decrypted reasoning record for a fully authorized terminal request.

## Creator Action Registry

The Creator Action Registry now distinguishes:

- `review.read` -> `creator.review` -> elevated;
- `review.decide` -> `creator.review` -> elevated.

A local bootstrap session still has only:

- `creator.chat`;
- `creator.read`.

Therefore bootstrap authentication cannot list private Human Review payloads or decide them.

Recovery authentication cannot use these review actions either.

Strong WebAuthn/hardware-key Creator sessions include the `creator.review` scope.

## Creator Console API

### GET /api/reviews?status=pending

Requires `review.read`.

Returns local Human Review records for the requested valid status:

- pending;
- resolved;
- dismissed;
- all.

Private review payloads are therefore not exposed to the low-privilege bootstrap session.

### POST /api/reviews/resolve

Requires `review.decide`.

Input:

- reviewId;
- decision;
- reason;
- expectedRecordHash.

Supported decisions:

- approve;
- reject;
- acknowledge;
- needs-more-information.

The optimistic-concurrency `expectedRecordHash` prevents a stale browser from silently overwriting a changed review item.

After resolution, the Creator Console immediately reconciles the same source `requestId` through `ReviewGatedContinuation`.

An approval can therefore create the existing durable continuation wake in the same request.

## Browser UI

The local Creator browser now exposes a Human Review panel only when the current session is strong.

The panel:

- lists pending reviews;
- shows review title, summary, privacy class and priority;
- shows bounded local semantic output when present;
- shows hash/size metadata when a large output was deliberately omitted;
- requires a written reason;
- supports Approve, Reject and Needs More Information.

The browser uses text nodes / `textContent` for review data; semantic output is not inserted as raw HTML.

When asynchronous reasoning reaches `awaiting-human-review`, the chat watcher stops polling the reasoning transport and hands control to the Human Review panel.

## Audit and authority

Every review list/read request is audited through `review.read`.

Every decision is audited through `review.decide`.

Audit records retain payload hashes rather than semantic review content.

Creator approval means the specific substantive continuation represented by the review gate is authorized. It still does not:

- lower the privacy classification;
- authorize publication;
- grant arbitrary shell access;
- authorize direct writes to `main`;
- bypass Action Registry or capability policy;
- turn Creator identity into unrestricted execution authority.

## Security boundary

The Creator Console remains loopback-only.

Human Review records remain local under `ARCA_HOME`.

The GitHub-backed Machine Bridge continues to carry ciphertext/hash metadata only for the private reasoning path.

The local review store may contain bounded semantic reasoning output so the Creator can inspect it. Hosted or remotely reachable deployments must add appropriate at-rest encryption and access controls before changing the current local-only boundary.

## Product effect

The Creator experience now has a concrete stop point for sensitive AI output:

```text
ARCA: reasoning finished
ARCA: output classified restricted
ARCA: awaiting your review

Creator: approve
ARCA: continuation authorized
```

This closes the main control loop between durable private reasoning and explicit human authorization.
