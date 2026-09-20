# ARCA Case Learning Pipeline V0.1

Status: PROPOSED — Roadmap 5/16

## Purpose
Convert a documented public case into reusable defensive knowledge without converting allegations into facts or copying raw source files.

Pipeline:
`SOURCE LOCATORS -> CLAIM EXTRACTION -> EVIDENCE ASSESSMENT -> PATTERN ABSTRACTION -> CTG VALIDATION -> CORPUS CANDIDATE -> HUMAN REVIEW -> ADMIT/REJECT`

## Invariants
- Input is source locators plus derived observations, never a repository copy of the raw artifact.
- Every extracted material claim receives an Evidence Taxonomy assessment.
- Named case entities are removed from the public abstraction unless identity is itself indispensable provenance; case-specific investigative state remains private.
- A pattern candidate must map to CTG traces, source classes and verification questions.
- Admission to the public corpus is a reviewed action; workers cannot self-promote candidates.
- Contradictory/refuting material is retained and can stop admission.
- Learning is defensive: procedural evasion instructions are excluded.

## Public/private boundary
Public ARCA contains this pipeline, schemas, validators and admitted abstract patterns. Private investigative storage contains case-specific extraction/assessments and concrete source locators during review. Raw files and secrets are stored in neither repository.
