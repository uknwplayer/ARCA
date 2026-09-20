# ARCA Investigative Roadmap V0.1 — Validation

Status: VALIDATION CANDIDATE  
Roadmap: 16/16  
Date: 2026-09-20

## Result

The sixteen-step V0.1 architecture is implemented as a fail-closed investigative control plane.

Steps 1–15 were independently merged only after canonical CI passed. Step 15 added the cross-component controlled pilot to CI, so future changes must continue to pass the integrated path.

The controlled pilot proves the software/control path with synthetic non-adverse data. It does **not** claim that ARCA has established wrongdoing by any real person/entity, completed a live real-world investigation, or completed a live investigative dispatch across satellites.

## Canonical flow

`PUBLIC/LAWFUL SOURCE -> SOURCE LOCATOR -> EVIDENCE STATE -> CTG/CORPUS -> PATTERN LEAD -> TEMPORAL/RELATIONAL REVIEW -> RED FLAG -> PRIVATE UNRESOLVED CASE CANDIDATE -> ADVERSARIAL VERIFICATION -> HUMAN REVIEW -> PRIVATE INVESTIGATION RECORD -> REVIEWED ABSTRACT LEARNING`

Mesh006 can distribute only sanitized public investigative task classes; its execution receipt proves execution/integrity, not investigative truth.

## Repository boundary

### Public ARCA
Code, policies, schemas, abstract typologies, reviewed source registries, generic public-source descriptors, workers, orchestration, synthetic tests, controlled pilot, and architecture documentation.

### Private investigative store
Real case candidates, named entities/relations, concrete case source locators, evidence assessments, timelines, red-flag matches, adversarial challenges and Investigation Record revisions.

The private investigative store is a deployment boundary defined by V0.1; it is not automatically provisioned by the public repository.

### Private Registry/Archive
Project checkpoints, canonical SHAs and recovery/audit history only. It is explicitly **not** the investigative case database.

### Neither repository
Raw videos/audio/images/PDFs/dataset dumps/scraped page copies, credentials, tokens, keys or other secrets. Inputs are processed transiently; derived knowledge and reproducibility locators persist according to the boundary.

## Evidence reproducibility

Persisted derived knowledge should retain enough information to return to lawful evidence when possible: canonical URL, source/dataset, public record id, query/record locator, access method, retrieval timestamp and content hash when available. Dead links remain historical locators with availability state; they do not become proof.

## Validation evidence

The Step 15 CI run `35530562769` executed the existing Node suite, Executor Mesh contract tests, the new cross-component investigative controlled pilot, repository/publication checks and public repository preview successfully.

The machine-readable roadmap manifest records the prior PR/run chain and the invariants carried into this validation.

## Operational gates not falsely claimed

V0.1 implementation completion is distinct from operational deployment. A real private investigative backend must be provisioned before retaining real case records. A live investigative Mesh006 satellite mission remains a separate operational proof. Neither gap weakens the repository boundary: without the private backend, real records must not be persisted; without live dispatch proof, no live investigative federation claim may be made.

## Registry checkpoint

After this validation change passes CI and is merged, the private Registry/Archive receives a minimal checkpoint containing the canonical ARCA SHA, roadmap version, validation CI reference, and repository-boundary summary — no case data, source corpus, raw artifacts or secrets.
