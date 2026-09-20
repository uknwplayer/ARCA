# ARCA Evidence Taxonomy V0.1

Status: PROPOSED ENFORCEABLE TAXONOMY  
Roadmap: 2/16  
Date: 2026-09-20

## Purpose

Prevent investigative leads, anomalies, allegations and automated classifications from being silently promoted into facts or findings.

This taxonomy classifies the **evidentiary state of a claim**, not the character, guilt, competence, ideology, or political desirability of a person or organization.

## Claim states

- `ALLEGATION` — a source asserts the claim; ARCA has not independently established it.
- `ANOMALY` — a measurable deviation, mismatch or unusual pattern was observed. It does not establish wrongdoing.
- `CORRELATION` — two or more observations are associated in data/time/relationships. Causation is not established.
- `DOCUMENTARY_EVIDENCE` — a traceable document or public record directly supports a material component of the claim.
- `INDEPENDENTLY_CORROBORATED` — materially independent sources support the same material proposition.
- `OFFICIALLY_CONFIRMED` — a competent official source expressly confirms the proposition within its stated scope.
- `ADJUDICATED_FACT` — a final/operative adjudicative record establishes the proposition within that proceeding's scope; appeal/finality context must be retained when relevant.
- `CONTESTED` — material evidence or a relevant source disputes the proposition.
- `REFUTED` — sufficiently authoritative evidence establishes that the proposition, as formulated, is false or materially incorrect.
- `UNRESOLVED` — available evidence is insufficient or conflicting and no stronger state is justified.

## Non-linear rule

These states are not a guilt ladder. `ALLEGATION -> ANOMALY -> ...` is not an automatic progression.

A claim may move between states only when a new evidence assessment records the basis and provenance. `CONTESTED`, `REFUTED`, and `UNRESOLVED` are first-class outcomes.

## Source locator

Every persisted evidence assessment must carry one or more reproducibility locators. A locator may contain:

- canonical public URL;
- source/dataset name;
- public record or document identifier;
- query/record locator needed to find it again;
- access method;
- retrieval timestamp;
- content SHA-256 when computed;
- availability state such as `AVAILABLE` or `NO_LONGER_RETRIEVABLE`.

A locator identifies how to return to evidence. It is not a copy of the raw artifact.

## Assessment record

An assessment records:

- stable claim identifier;
- claim text/proposition;
- evidentiary state;
- source locators;
- concise rationale tied to those sources;
- assessor/worker identifier;
- assessment timestamp;
- optional predecessor assessment;
- review state.

The taxonomy does not contain a field for "guilt probability". Confidence, if later introduced, may describe extraction/matching reliability, not probability that a named person committed wrongdoing.

## Contradictory evidence

ARCA must preserve evidence that weakens or contradicts a hypothesis. A newer assessment must not delete earlier provenance. A claim can be marked `CONTESTED` or `UNRESOLVED` while preserving both supporting and contradicting locators.

## Human review gate

Person-specific adverse conclusions are not publication-ready merely because an automated worker assigned an evidentiary state. Publication/escalation policy is separate and must include human review where required.

## Public/private repository boundary

The **public ARCA repository** stores this taxonomy, schemas, generic validation code, synthetic examples and tests.

Case-specific claim text, named entities, source locators, assessments and investigative relationships belong in the future **private investigative store**, unless a separately reviewed publication process deliberately exports an evidence package.

Raw source artifacts are not committed to either project repository. Secrets belong in neither.

## Completion criteria

Evidence Taxonomy V0.1 is complete when:

1. normative states and invariants are documented;
2. a machine-readable taxonomy exists;
3. runtime validation rejects unsupported states and evidence without source locators;
4. tests prove contradictory/unresolved outcomes are representable and provenance is mandatory;
5. canonical CI passes and the change is merged.
