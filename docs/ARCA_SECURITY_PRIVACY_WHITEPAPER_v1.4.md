# ARCA Security & Privacy White Paper v1.4

**Status:** consolidated architecture baseline  
**Date:** 17 September 2026  
**Supersedes:** `ARCA_SECURITY_PRIVACY_WHITEPAPER_v1.3.md`  
**Scope:** ARCA Core, Workbench, Acquisition/Custody, AIE, PNCP, Agent Gateway, Credential Vault, Capability Registry, Machine Bridge, Human Review, Privacy Classification, Publication Gate, Legal Basis Registry, Data Subject Requests, Redaction Export Receipts, Retention Engine, Security Incident Registry, RIPD Assistant and Security Control Matrix/Self-Audit Dashboard

> ARCA is designed to investigate public-interest facts while minimizing unnecessary collection, limiting public exposure, preserving evidentiary integrity and making security/privacy claims inspectable.

## 1. Core posture

ARCA follows a `collect less, expose less, retain only while justified, prove more` model.

The intended posture includes:

- no mandatory ARCA account for local/self-hosted use;
- no mandatory advertising or behavioral tracking;
- no required central ARCA investigation cloud;
- provider-independent AI connections;
- encrypted credential persistence behind a narrow broker boundary;
- acquisition separated from inference;
- evidence-bearing acquisitions tied to provenance and custody;
- explicit uncertainty and visible gaps;
- no automatic promotion of analytical signals into accusations;
- capability declaration separated from verification and authorization;
- human review for sensitive/review-bound actions;
- privacy classification before public exposure;
- publication may be held, rejected or conditioned on redaction;
- challenged records can be held before republication;
- corrections preserve history rather than silently rewriting evidence;
- retention is purpose/obligation driven rather than indefinite by default;
- security incidents receive durable records and human-reviewed communication decisions;
- RIPD readiness can be assessed without automated legal advice;
- the system exposes its own security/privacy gaps instead of hiding them behind a global green badge.

`Publicly accessible` does not mean `privacy-free`.

## 2. User privacy

ARCA prefers to avoid collecting user information that is not necessary to perform the requested function.

A conforming deployment should avoid unnecessary registration, fingerprinting, cross-site tracking, behavioral advertising and unnecessary contact-data collection. Local/offline operation should remain possible without a central ARCA database.

A hosted service must inventory what its web server, CDN, reverse proxy, WAF, hosting provider, logs, cookies and third-party services actually process. No-account architecture alone does not prove zero personal-data processing.

## 3. Privacy of investigated persons

ARCA's normal acquisition model is lawful public-interest investigation rather than unrestricted dossier building.

Preferred sources are official APIs/datasets, official publications/records and other lawful public sources when necessary. Unauthorized access, stolen credentials, unlawful private records and private communications are outside the intended default acquisition model.

Before personal information is publicly exposed, the workflow should be able to explain:

- what public-interest question the field supports;
- why the field is necessary;
- whether less detail would preserve evidentiary value;
- whether the source is authoritative/current;
- whether a correction/dispute is pending;
- why continuing retention is justified.

## 4. Evidence, analysis and publication are separate

```text
source
  ↓
controlled acquisition
  ↓
SHA-256 / custody / provenance
  ↓
normalization
  ↓
analysis / competing hypotheses
  ↓
human review
  ↓
privacy classification
  ↓
publication gate
  ↓
redacted public representation
```

A public redaction must not silently rewrite the original lawful evidence/custody record.

## 5. Credential security

Persisted credentials use AES-256-GCM in the current Credential Vault implementation. The master secret is separated from stored credential material.

The Credential Broker limits plaintext exposure to the transport boundary where authentication is required. Agent, Core, Registry, ordinary jobs/results and audit trails do not need the raw credential.

There is no normal `show saved key` operation; replacement uses rotation.

ARCA claims encrypted persistence, bounded exposure and secret-free logging — not the impossible claim that an actively used API credential can never exist in process memory.

Current roadmap gaps remain visible:

- OS-backed key storage such as Android Keystore/TPM/Secure Enclave/secret manager;
- ephemeral `use once / do not save` credentials.

## 6. Machine Bridge and execution security

- actions come from a closed Action Registry rather than arbitrary network-provided shell text;
- jobs are capability-gated;
- claims/leases control concurrent execution;
- external-agent networking is disabled by default and constrained when enabled;
- plain HTTP is restricted to loopback in the Agent Gateway client;
- redirects are refused by that client;
- networked PNCP acquisition is separated from offline/planning actions;
- evidence-bearing network acquisition should use persistent custody rather than ephemeral worker files as canonical evidence.

## 7. Capability trust

Capability Passports distinguish participant declarations from ARCA verification. Participants cannot self-promote capabilities to `verified`.

Conformance Probes use synthetic, side-effect-free vectors and avoid persisting raw participant output. Compatibility does not grant authorization.

The Capability Planner identifies candidates and gaps but does not execute, authorize or replace policy/human review.

## 8. Privacy Classification and Publication Gate

Implemented privacy classes:

- `public`;
- `personal`;
- `sensitive`;
- `high-risk`;
- `restricted`;
- `redact-before-publication`.

Publication outcomes:

- `publish`;
- `publish-with-redaction`;
- `hold`;
- `reject`.

The gate checks purpose, necessity, source verification, required human/legal review, public-interest rationale, minimization/redaction and active data-subject challenges.

Secrets/credentials and private communications are rejected from the normal public-publication route. Disputed/outdated records are held for review.

The gate does not itself publish.

## 9. Legal Basis Registry

The registry records the legal basis **claimed** for a processing activity and its review history.

Records begin as draft and can later become active, rejected, superseded or withdrawn. Revisions are hash-linked.

Selecting a legal-basis code does not prove that the underlying factual/legal requirements are satisfied. The registry records:

```json
{
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

## 10. Data-subject requests and correction

The Data Subject Request Registry supports correction, dispute, access, restriction, deletion, opposition and automated-decision-review categories.

It minimizes identity handling through opaque subject references and does not store raw identity documents in this layer.

Active correction/dispute-like requests can hold a record before new publication. A request does not prove the requester's position; it prevents silent republication while the issue is checked.

## 11. Redaction Export Receipts

A receipt can be created only from a valid publish/publish-with-redaction decision.

It binds decision/classification hashes, input/output artifact hashes, redacted field paths, reasons, exporter ID and timestamp.

Removed values and their individual hashes are not stored, reducing the chance of re-identification through candidate comparison.

The actual arbitrary-document redaction engine remains roadmap work.

## 12. Retention Engine

ARCA represents retention as policy + assessment rather than one universal period.

Possible results:

- `retain`;
- `review`;
- `anonymize`;
- `delete-eligible`;
- `legal-hold`.

`delete-eligible` is a recommendation state, not an executed deletion.

Legal holds and minimum regulatory floors override normal eligibility. A future deletion/anonymization executor must remain separate, authorized and auditable.

## 13. Security Incident Registry

Incidents are recorded before communication necessity is decided.

The current Brazilian baseline represented by the module includes the ordinary three-business-day ANPD communication window for relevant incidents and a minimum incident-record retention floor of five years, subject to the actual applicable rule and calendar.

ARCA does not invent a legal due date without an authoritative business-day resolver.

Human review is required before v1 records that communication is required. The module does not send regulator/data-subject notifications automatically.

## 14. RIPD Assistant

The RIPD Assistant is a risk/readiness documentation layer, not an automated lawyer.

It uses explicit high-risk indicators and documentation gaps to return:

- `routine-review`;
- `consider-ripd`;
- `prepare-ripd`.

It does not claim that a formal RIPD was generated, legally required or submitted to ANPD.

## 15. Security Control Matrix

ARCA now exposes a machine-readable catalog of security/privacy controls.

The catalog includes controls that are:

- implemented in the project baseline;
- dependent on the actual deployment;
- explicitly not implemented and still in roadmap.

Each control can include:

- stable ID;
- domain;
- title/description;
- severity;
- baseline class;
- repository evidence references;
- deployment assertion key where applicable.

The goal is to make security gaps visible rather than leave them in prose or developer memory.

## 16. Security Self-Audit

The self-audit currently supports deployment profiles:

- `local-offline`;
- `self-hosted`;
- `public-hosted`.

Per-control states:

- `pass`;
- `attention`;
- `deployment-required`;
- `not-assessed`;
- `not-implemented`;
- `not-applicable`.

The audit deliberately does **not** generate a percentage or global legal-compliance score.

Every audit states:

```json
{
  "legalComplianceConclusion": false,
  "automatedLegalConclusion": false,
  "complianceScoreProduced": false
}
```

A `pass` means the cataloged technical baseline is implemented/evidenced or the deployment assertion was confirmed. It does not certify that every concrete use is lawful.

## 17. Deployment assertions

Software cannot truthfully infer every property of arbitrary hosting infrastructure.

For self-hosted/public deployments the audit can require explicit operator assertions for matters such as:

- TLS;
- infrastructure data-flow inventory;
- log-retention documentation;
- privacy notice when applicable;
- subject-rights/correction contact path;
- incident-response ownership;
- access control;
- backup protection.

Unknown/unanswered assertions remain visible rather than defaulting to pass.

## 18. Frontend-ready Security Dashboard Model

The backend now generates a UI-oriented dashboard object containing:

- summary cards;
- sections grouped by domain;
- filters by status/severity/domain;
- evidence references;
- deployment profile;
- audit/hash linkage;
- disclaimers;
- integrity hash.

The future interface is intended to render this data without recalculating security status.

A later UI should show controls such as:

```text
SECURITY & PRIVACY

Deployment: PUBLIC HOSTED

Confirmed       15
Attention        1
Deployment       2
Roadmap           5

Critical / high items
--------------------------------
Credential encryption           PASS
Publication Gate                PASS
TLS                             PASS
Privacy notice                  ATTENTION
OS-backed key storage           NOT IMPLEMENTED
```

This presentation is illustrative. Actual status comes from the backend assessment.

## 19. No global green badge

A single `COMPLIANT` badge would blur important distinctions:

- code capability versus runtime configuration;
- technical control versus legal basis;
- project baseline versus deployment reality;
- existence of a feature versus correct use in a specific investigation.

ARCA therefore prefers explicit control states and evidence over a global certification claim.

## 20. Current control gaps intentionally visible

Examples currently kept visible as `not-implemented`/roadmap include:

- OS-backed master-key storage;
- ephemeral credential mode;
- arbitrary-document redaction engine;
- authorized deletion executor;
- deletion proof.

Deployment-dependent controls also remain visible until the operator confirms them.

## 21. Auditability hierarchy

ARCA prefers security/privacy claims backed by:

1. executable tests;
2. code-enforced invariants;
3. schemas/validation;
4. auditable hashes/records;
5. source/repository evidence references;
6. specifications;
7. interface text.

A future enhancement should attach CI attestations and signed-release provenance directly to control evidence.

## 22. Brazilian legal/regulatory baseline

This white paper is technical architecture, not legal advice.

Official references checked for the current baseline include:

- LGPD — Lei nº 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD Agenda Regulatoria: https://www.gov.br/anpd/pt-br/assuntos/regulacao/agenda-regulatoria-1
- ANPD RIPD guidance: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd
- Resolução CD/ANPD nº 15/2024: https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-15-de-24-de-abril-de-2024
- ANPD incident guidance: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
- Marco Civil da Internet: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm

The ANPD's current 2025–2026 agenda continues to show minimum technical/administrative security standards as regulatory work in progress, and RIPD guidance explicitly notes that the normative environment remains dynamic. ARCA should therefore update mappings as rules evolve rather than claim regulator certification from today's checklist.

## 23. Deployment profiles

### Local/offline

Preferred for maximum user privacy. No central ARCA account/database is required and hosted infrastructure controls can be marked not applicable.

### Self-hosted/team

The operator controls logs, backups, retention, access policy, TLS and host security. ARCA exposes these as deployment assertions rather than pretending it can inspect any host automatically.

### Public hosted

Requires a stronger operational baseline: real infrastructure inventory, TLS, bounded logging/retention, incident response, accurate transparency/privacy notice when personal-data processing occurs, subject-rights contact path and tested publication/redaction controls.

## 24. Roadmap

Next hardening areas include:

- CI attestation ingestion into control evidence;
- signed/reproducible release provenance;
- control-history/diff between audits;
- Workbench/API exposure of the dashboard model;
- OS-backed key providers;
- ephemeral credentials;
- actual document redaction engine;
- safe deletion/anonymization executor + deletion proof;
- incident communication receipts/templates;
- formal reviewed RIPD generator;
- privacy-preserving operational metrics if ever enabled.

## 25. Public commitment

ARCA should hold as little unnecessary user data as practical, expose investigated persons only to sourced/necessary/proportionate public-interest information, retain data only while justified, respond to incidents transparently and expose its own security gaps honestly.

The standard is not `trust ARCA` and not `look for the green badge`.

It is: **make security, privacy, provenance, lifecycle, deployment assumptions and unresolved gaps inspectable enough that users and affected persons do not have to rely on blind trust.**
