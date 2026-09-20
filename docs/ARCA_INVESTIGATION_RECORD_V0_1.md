# ARCA Investigation Record V0.1

Status: PROPOSED — Roadmap 14/16

Defines the canonical **private case record envelope** while keeping its schema/validator public.

A record links: case candidate identity, claims/evidence assessments, source locators, red-flag matches, timeline/relations, adversarial challenges, review events, and an append-only revision chain.

The record stores derived knowledge and reproducibility locators, not raw media/documents. It must preserve contradictory/refuting evidence and historical assessments rather than overwriting them.

## Storage boundary
The schema, code and synthetic tests are public ARCA. **Real Investigation Records must use a designated private investigative backend.** The private Registry is not that backend. Public GitHub repositories are explicitly invalid backends. Secrets/raw artifacts belong in neither.

V0.1 does not create a private repository automatically. Backend provisioning is an operational deployment choice; the public contract prevents accidental public persistence.
