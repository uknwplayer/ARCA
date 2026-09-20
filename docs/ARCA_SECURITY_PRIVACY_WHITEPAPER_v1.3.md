# ARCA Security & Privacy White Paper v1.3

**Status:** consolidated architecture baseline  
**Date:** 17 September 2026  
**Supersedes:** `ARCA_SECURITY_PRIVACY_WHITEPAPER_v1.2.md`  
**Scope:** ARCA Core, Workbench, Acquisition/Custody, AIE, PNCP, Agent Gateway, Credential Vault, Capability Registry, Machine Bridge, Human Review, Privacy Classification, Publication Gate, Legal Basis Registry, Data Subject Requests, Redaction Export Receipts, Retention Engine, Security Incident Registry and RIPD Assistant

> ARCA is designed to investigate public-interest facts while minimizing unnecessary collection, limiting public exposure, preserving evidentiary integrity and making security/privacy claims auditable.

## 1. Core posture

ARCA follows a `collect less, expose less, retain only while justified, prove more` model.

The target posture is:

- no mandatory ARCA account for local/self-hosted use;
- no mandatory advertising or behavioral tracking;
- no central ARCA investigation cloud required;
- provider-independent AI connections;
- encrypted stored credentials behind a narrow broker;
- acquisition separated from inference;
- evidence-bearing acquisitions tied to provenance and custody;
- explicit uncertainty and visible gaps;
- no automatic promotion of signals into accusations;
- capability declaration separated from verification and authorization;
- human review for sensitive/review-bound actions;
- personal-data classification before public exposure;
- publication can be held, rejected or conditioned on redaction;
- challenged records can be held before republication;
- corrections preserve history instead of silently rewriting evidence;
- retention is purpose/obligation driven rather than indefinite by default;
- incident response has durable records and human-reviewed notification decisions;
- RIPD readiness is assessed without pretending an automated system can issue a legal opinion.

`Publicly accessible` does not mean `privacy-free`.

## 2. User privacy

ARCA prefers to avoid collecting user information rather than collect it and promise to protect it later.

A conforming deployment should avoid registration when identity is unnecessary, cross-site tracking, fingerprinting, behavioral advertising and unnecessary contact-data collection. Local/offline use should remain possible without a central ARCA database.

A hosted service must inventory what its server, CDN, WAF, proxy and logging stack actually process. No-account architecture alone does not prove zero personal-data processing.

## 3. Privacy of investigated persons

ARCA's normal acquisition model is lawful public-interest investigation, not unrestricted dossier building.

Preferred sources are official APIs/datasets, official publications/records and other lawful public sources where necessary. Unauthorized access, stolen credentials, unlawful private records and private communications are outside the default acquisition model.

Before personal information is exposed publicly, the workflow should be able to explain:

- the public-interest question supported by the information;
- why the field is necessary;
- whether less detail would preserve the evidentiary purpose;
- whether the source is authoritative/current;
- whether correction/dispute is pending;
- why continued retention is still justified.

## 4. Evidence, analysis and public representation

ARCA keeps these layers distinct:

```text
source
  ↓
exact acquisition
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

Public redaction must not silently rewrite the original evidence record.

## 5. Credential security

Persisted connection credentials use AES-256-GCM in the current Vault implementation. The master secret is separated from stored credential material.

The Credential Broker limits plaintext exposure to the transport boundary where authentication is actually required. Agent, Core, Registry, ordinary jobs/results and audit records do not need the raw credential.

There is no normal `show saved key` operation; replacement uses rotation.

ARCA claims bounded exposure, encrypted persistence and secret-free logging — not the impossible claim that an actively used API credential never exists in process memory.

## 6. Machine Bridge and execution security

- actions come from a closed registry rather than arbitrary network-provided shell text;
- jobs are capability-gated;
- claims/leases control concurrent execution;
- external-agent networking is disabled by default and origin constrained when enabled;
- plain HTTP is restricted to loopback in the Agent Gateway client;
- redirects are refused by that client;
- networked PNCP acquisition is separate from offline/planning actions;
- evidence-bearing acquisition should use persistent custody rather than ephemeral worker files as canonical evidence.

## 7. Capability trust

Capability Passports distinguish what a participant declares from what ARCA has verified. Participants cannot self-promote capabilities to `verified`.

Conformance Probes use synthetic, side-effect-free vectors and do not persist raw participant output. Compatibility does not grant authorization.

The Capability Planner reports candidates and gaps but does not execute, authorize or replace human/policy review.

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

The gate checks purpose, necessity, source verification, human review, legal-review state, public-interest rationale, minimization/redaction and active data-subject challenges. It never performs publication itself.

Secrets/credentials and private communications are rejected from the normal public-publication route. Disputed/outdated records are held for review.

## 9. Legal Basis Registry

The registry records the basis **claimed** for a processing activity and its human-review history.

Records begin as draft and can later become active, rejected, superseded or withdrawn. Revisions are hash-linked.

The registry does not determine legal validity and explicitly records:

```json
{
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

## 10. Data-subject requests and corrections

The Data Subject Request Registry supports correction, dispute, access, restriction, deletion, opposition and automated-decision-review categories.

It is intentionally data-minimal:

- opaque `subjectRef` rather than mandatory CPF/name;
- no raw identity document stored by this layer;
- request content not authorized for public disclosure;
- hash-chained events;
- additive resolution history.

An active correction/dispute can place a record on publication hold. Opening a request does not prove the requester correct; it prevents silent republication while the issue is checked.

## 11. Redaction Export Receipts

A receipt can be created only from a valid publish/publish-with-redaction decision.

It binds decision/classification hashes, input/output artifact SHA-256 values, redacted field paths, reasons, exporter ID and timestamp.

Removed values and per-value hashes are not stored. This avoids creating a secondary disclosure channel for low-entropy personal values.

## 12. Retention Engine

The LGPD does not prescribe one universal retention period. Under arts. 15 and 16, treatment ends when purpose/necessity or the applicable period ends, subject to legally permitted conservation grounds.

ARCA therefore represents retention as policy + assessment rather than a universal number of days.

Possible assessment outcomes:

- `retain`;
- `review`;
- `anonymize`;
- `delete-eligible`;
- `legal-hold`.

`delete-eligible` never means automatically deleted. The v1 engine explicitly records:

```json
{
  "automaticDeletionPerformed": false,
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

A future deletion/anonymization executor must be a separate authorized, auditable component.

### 12.1 Conservation

The engine can record conservation grounds corresponding broadly to legal/regulatory obligation, research, lawful third-party transfer and exclusive-controller anonymized use, plus another documented ground requiring review.

The existence of a recorded ground does not itself prove legal sufficiency.

### 12.2 Evidence and holds

Legal holds and minimum regulatory floors override normal delete eligibility. This protects evidence, audit material and incident records against accidental lifecycle destruction.

## 13. Security Incident Registry

A security incident is registered before notification necessity is determined.

The record captures timestamps, affected-data information, estimated scope, mitigation, integrity hash and a regulatory minimum-retention floor.

New incident records begin with notification status `undetermined`.

### 13.1 Current ANPD communication baseline

Resolução CD/ANPD nº 15/2024 currently requires communication to ANPD and affected data subjects when an incident can cause relevant risk or harm under the rule's cumulative criteria. The ordinary window is three business days from controller knowledge that personal data was affected, subject to applicable specific/differentiated rules.

ARCA stores the window symbolically and does not calculate a legal deadline without an authoritative business-day calendar.

Human review must confirm significant impact and at least one qualifying category before v1 records `communicationRequired=true`.

### 13.2 Minimum incident record retention

Current ANPD rules require incident records — including non-notified incidents — to be maintained for at least five years from registration, unless a longer obligation applies.

The incident module therefore emits `retentionNotBefore` five calendar years after registration. This is a minimum floor, not an automatic deletion date.

## 14. RIPD Assistant

The RIPD Assistant is a readiness/risk documentation layer, not an automated lawyer.

The current ANPD guidance recommends preparing a RIPD before processing that may create high risk, while detailed RIPD regulation remains dynamic.

The assistant returns:

- `routine-review`;
- `consider-ripd`;
- `prepare-ripd`.

It operates from explicit indicators such as sensitive data, children/adolescents, large scale, systematic monitoring, adverse automated decisions, novel technology, precise location, financial/authentication data and data combination/profiling.

It also exposes missing documentation rather than fabricating completeness.

Every assessment records:

```json
{
  "formalRipdGenerated": false,
  "anpdSubmissionPerformed": false,
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

## 15. Security incident runbook baseline

A conforming deployment should use this sequence:

```text
DETECT
  ↓
CONTAIN
  ↓
PRESERVE EVIDENCE
  ↓
REGISTER INCIDENT
  ↓
ASSESS PERSONAL-DATA IMPACT
  ↓
HUMAN RISK REVIEW
  ↓
RESOLVE NOTIFICATION WINDOW
  ↓
NOTIFY WHEN REQUIRED
  ↓
MITIGATE / RECOVER
  ↓
POST-INCIDENT REVIEW
  ↓
RETAIN INCIDENT RECORD
```

Notification content and sending remain outside the automated v1 module.

## 16. Corrections versus evidence preservation

Correction of a public report and destruction of historical evidence are distinct actions.

Where retention is justified, ARCA should preserve original lawful evidence/custody while allowing corrected public representations and explicit supersession history.

## 17. Deployment profiles

### Local/offline

Preferred for maximum user privacy. No central ARCA account/database is required; data remains local unless external services are chosen.

### Self-hosted/team

The operator controls logs, backups, retention, access policy and host security. ARCA cannot guarantee properties of infrastructure it does not control.

### Public hosted

Requires infrastructure inventory, bounded logs/retention, TLS, hardened key management, incident response, accurate privacy/transparency notice, subject-rights contact path and tested redaction/publication controls.

## 18. Current backend controls

Implemented foundations include:

- canonical Core authority boundary;
- acquisition/custody/provenance;
- Human Review Queue/Inbox;
- closed Machine Bridge action model;
- Capability Registry/Probes/Planner;
- Credential Vault/Broker;
- Privacy Classification;
- Publication Gate;
- Legal Basis Registry;
- Data Subject Request Registry;
- Redaction Export Receipt;
- Retention Policy/Assessment engine;
- Security Incident Registry + human-reviewed notification assessment;
- RIPD readiness assessment.

## 19. Roadmap

Still separate work:

- OS-backed key storage;
- ephemeral `use once / do not save` credentials;
- actual PII discovery/redaction engine;
- public subject-rights portal;
- secure identity-verification adapter;
- authorized deletion/anonymization executor;
- jurisdiction-aware business-day calendar resolver;
- incident notification receipts/templates;
- incident tabletop/simulation tests;
- formal reviewed RIPD generator;
- public/internal RIPD views;
- privacy-preserving operational metrics if ever enabled.

## 20. Auditability hierarchy

ARCA prefers security/privacy claims backed by:

1. executable tests;
2. code-enforced invariants;
3. schemas/validation;
4. auditable hashes/records;
5. specifications;
6. interface text.

Interface statements alone are not security controls.

## 21. Brazilian legal/regulatory baseline

This document is technical architecture, not legal advice.

Official references checked for v1.3:

- LGPD — Lei nº 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD FAQ: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- Resolução CD/ANPD nº 15/2024: https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-15-de-24-de-abril-de-2024
- ANPD Comunicação de Incidente: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
- ANPD RIPD guidance: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd
- ANPD Agenda Regulatória: https://www.gov.br/anpd/pt-br/assuntos/regulacao/agenda-regulatoria-1
- Marco Civil da Internet: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm

As of the ANPD agenda update dated 16 July 2026, detailed regulation concerning RIPD remained in progress. Deployments must re-check current rules instead of assuming this baseline is permanent.

## 22. Public commitment

ARCA should hold as little unnecessary user data as practical, expose investigated persons only to sourced/necessary/proportionate public-interest information, retain personal data only while justified, respond to incidents transparently and keep privacy/security claims inspectable.

The standard is not `trust ARCA`.

It is: **make security, privacy, provenance, lifecycle, incident-response and correction claims testable enough that users and affected persons do not have to rely on blind trust.**
