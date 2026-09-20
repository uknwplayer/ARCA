# ARCA Autonomous Case Generation V0.1

Status: PROPOSED — Roadmap 11/16

Creates **investigative case candidates** from bounded public-data red-flag matches. A candidate is a queue item for verification, not an accusation or finding.

Generation requires at least one validated red-flag match, provenance, verification questions and a declared public-interest scope. Duplicate fingerprints are idempotently suppressed.

Generated candidates start `UNRESOLVED` and `PRIVATE_REVIEW`. They cannot be automatically published, cannot trigger private-data acquisition, and cannot change Evidence Taxonomy state without evidence assessment.

Public ARCA stores generator code/schema/tests. Generated real-world candidates belong only in private investigative storage.
