# ARCA Security & Privacy White Paper v1.2

**Status:** consolidated architecture baseline  
**Date:** 17 September 2026  
**Supersedes:** `ARCA_SECURITY_PRIVACY_WHITEPAPER_v1.1.md`  
**Scope:** ARCA Core, Workbench, Acquisition/Custody, AIE, PNCP, Agent Gateway, Credential Vault, Capability Registry, Machine Bridge, Human Review, Privacy Classification, Publication Gate, Legal Basis Registry, Data Subject Requests and Redaction Export Receipts

> ARCA is designed to investigate public-interest facts without turning public availability into unrestricted personal surveillance. Security, privacy, provenance, minimization, review and correction are enforced as architecture where possible, not left only to interface text.

## 1. Security/privacy objective

ARCA follows a `collect less, expose less, prove more` posture:

- no mandatory ARCA account for local/self-hosted use;
- no mandatory advertising or behavioral-tracking identifier;
- no requirement to upload an investigation to a central ARCA service;
- provider-independent AI connections;
- encrypted credential persistence behind a narrow broker boundary;
- public-source acquisition separated from inference;
- exact provenance/custody for evidence-bearing acquisition;
- explicit uncertainty and visible gaps;
- no automatic conversion of signals into accusations;
- capability declaration separated from verification and authorization;
- human review for sensitive/review-bound actions;
- privacy classification before public exposure;
- publication can be held, rejected or conditioned on redaction;
- challenged records can be held before republication;
- corrections preserve history instead of silently rewriting evidence;
- export receipts prove redaction workflow without retaining removed values.

ARCA does not treat `publicly accessible` as `privacy-free`.

## 2. User privacy

The preferred product design avoids collecting user information that is not needed to perform the requested function.

A conforming deployment should avoid mandatory registration where unnecessary, behavioral advertising, cross-site tracking, fingerprinting and unnecessary contact-data collection. Local/offline operation should remain possible without a central ARCA investigation database.

A hosted deployment must still inventory what its server, CDN, WAF, proxy, hosting platform and logging stack process. No-account architecture alone does not prove zero personal-data processing.

## 3. Investigated-person privacy

ARCA's default acquisition model is lawful public-interest investigation, not unrestricted dossier building.

Preferred sources are official APIs/datasets, official publications/records and other lawful public sources where necessary. Unauthorized access, stolen credentials, unlawful private records and private communications are outside the normal acquisition model.

Before personal information is exposed publicly, the workflow should be able to explain:

- what public-interest question it supports;
- why the field is necessary;
- whether less detail would satisfy the evidentiary purpose;
- whether the source is authoritative/current;
- whether a challenge or correction is pending.

## 4. Evidence, inference and publication are different layers

```text
remote/public source
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

Redacting a public representation must not silently rewrite the original evidence record.

## 5. Credential security

Persisted connection credentials use AES-256-GCM in the current Vault implementation. The master secret is separated from the stored credential material.

The Credential Broker confines plaintext exposure to the transport boundary where authentication is actually required. Agent, Core, Registry, jobs, ordinary results and audit logs do not need the raw credential.

There is no normal `show saved key` operation; replacement is rotation.

The precise claim is bounded exposure, encrypted persistence and secret-free logging — not the impossible claim that an actively used API credential can never exist in process memory.

## 6. Machine Bridge and execution security

- actions come from a closed registry rather than arbitrary network-provided shell text;
- jobs are capability-gated;
- claims/leases prevent uncontrolled concurrent execution;
- external-agent networking is disabled by default and origin constrained when enabled;
- plain HTTP is restricted to loopback in the Agent Gateway client;
- redirects are refused by that client;
- networked PNCP acquisition is separate from offline/planning actions;
- evidence-bearing acquisition should use persistent custody, not ephemeral worker files as canonical evidence.

## 7. Capability trust

Capability Passports distinguish what a participant declares from what ARCA has verified. A participant cannot self-promote itself to `verified`.

Conformance Probes use synthetic, side-effect-free test vectors and do not persist raw participant output. Capability compatibility does not grant authorization.

The Capability Planner reports compatibility/gaps but does not execute, authorize or replace policy/human review.

## 8. Privacy Classification

Implemented classes:

- `public`;
- `personal`;
- `sensitive`;
- `high-risk`;
- `restricted`;
- `redact-before-publication`.

The classifier uses explicit indicators and produces a SHA-256 classification hash. The Publication Gate refuses a classification whose integrity hash has been changed.

Sensitive/high-risk examples include sensitive-data categories, children/adolescents, precise private location and adverse inferences requiring stronger review.

## 9. Publication Gate

Technical outcomes:

- `publish`;
- `publish-with-redaction`;
- `hold`;
- `reject`.

The gate checks purpose, necessity, source verification, human review, legal-review state, public-interest rationale, minimization/redaction and active data-subject challenges.

It never performs publication itself and explicitly records:

```json
{
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false,
  "publicationPerformed": false
}
```

Secrets/credentials and private communications are rejected from the normal public-publication route. Disputed/outdated records are held for review.

## 10. Lawful flexibility without evasion

ARCA should not invent restrictions that the law does not require. Genuine legal bases, public-interest permissions and lawful exceptions may be used where their requirements actually apply.

However, an ambiguity, exception or procedural gap must not become a hidden bypass around privacy controls.

This boundary is now supported by a Legal Basis Registry rather than by hard-coded automated legal conclusions.

## 11. Legal Basis Registry

The registry records the basis **claimed** for a processing activity and its review history.

It can represent legal-basis families corresponding broadly to LGPD Articles 7 and 11, but choosing a code does not prove that all requirements of that basis are met.

Records begin as `draft`. Human review can mark them `active` or `rejected`; later records can be `superseded` or `withdrawn`.

Each revision links to the prior revision hash. Every record says:

```json
{
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

The purpose is accountability: future auditors should be able to answer `what basis did this deployment rely on, who reviewed it, when, and what replaced it?`.

## 12. Data Subject Requests and corrections

The Data Subject Request Registry supports correction, dispute, access, restriction, deletion, opposition and automated-decision-review categories.

It is deliberately data-minimal:

- opaque `subjectRef` rather than requiring name/CPF in the registry;
- no raw identity document stored by the registry;
- request content is not authorized for public disclosure;
- hash-chained request events;
- additive resolution history.

An active correction/dispute or similar request can place a record on publication hold. Opening a request does not prove the requester is correct; it stops silent republication while the claim is checked.

The LGPD gives data subjects rights including correction of incomplete, inaccurate or outdated data, and ANPD guidance states that requests should first be presented to the controller. Rights are not necessarily absolute in every factual/legal situation, so ARCA records reasons and review rather than automatically deleting valid evidence. 

## 13. Redaction Export Receipts

A redaction receipt can be produced only from a valid `publish` or `publish-with-redaction` Publication Gate decision.

The receipt binds:

- decision hash;
- classification hash;
- input artifact SHA-256;
- output artifact SHA-256;
- field paths redacted;
- reasons/replacement markers;
- exporter ID and timestamp;
- receipt hash.

A receipt cannot be produced from a `hold` or `reject` decision, and it refuses an export that omitted a redaction required by the publication decision.

The receipt does **not** store removed values or per-value hashes. Hashing a removed low-entropy personal value can itself leak information through candidate comparison. Artifact-level hashes provide integrity without creating that secondary disclosure.

## 14. Corrections versus evidence preservation

Correction of a public report and destruction of historical evidence are different operations.

ARCA should preserve the original lawful evidence and its custody record where retention remains justified, while allowing corrected public representations and explicit supersession history.

A mature correction chain should be:

```text
challenge
  ↓
publication hold
  ↓
source re-check
  ↓
human decision
  ↓
corrected/superseding representation
  ↓
new publication decision + receipt
```

## 15. Human review

No AI model should be able to create an adverse allegation and publish it automatically.

ARCA already has a durable Human Review Queue/Workbench Inbox. Privacy controls add further review requirements for high-risk publication, legal-review holds and disputed records.

## 16. Deployment profiles

### Local/offline

Preferred for maximum user privacy: no central ARCA account/database required; data stays local unless the user chooses external services.

### Self-hosted/team

The operator controls logs, backups, retention, access policy and host security. ARCA cannot truthfully guarantee privacy properties of infrastructure it does not control.

### Public hosted

Requires infrastructure inventory, bounded logging/retention, TLS, hardened key management, incident response, accurate privacy/transparency notice, subject-rights contact path and a tested redaction/publication pipeline.

## 17. Current controls versus roadmap

Implemented backend foundations now include:

- canonical Core authority boundary;
- custody/provenance controls;
- Human Review Queue/Inbox;
- closed Machine Bridge action model;
- Capability Registry/Probes/Planner;
- Credential Vault/Broker;
- Privacy Classification;
- Publication Gate;
- required legal-review hold;
- active subject-request publication hold;
- Legal Basis Registry with review history;
- Data Subject Request Registry with hash-chained events;
- Redaction Export Receipt.

Still separate roadmap work:

- OS-backed key storage;
- ephemeral `use once / do not save` credentials;
- automatic PII discovery with conservative human verification;
- actual document-format redaction engine;
- public subject-rights portal;
- secure identity-verification adapter;
- retention/deletion engine;
- incident/breach runbook;
- deployment-specific legal-basis templates;
- RIPD/DPIA assistance;
- privacy-preserving operational metrics if metrics are enabled.

## 18. Auditability hierarchy

For security/privacy claims, ARCA prefers:

1. executable tests;
2. code-enforced invariants;
3. schemas/validation;
4. auditable hashes/records;
5. specifications;
6. interface text.

Interface claims alone are not security controls.

## 19. Brazilian legal context

This white paper is technical architecture, not legal advice.

Official baseline references:

- LGPD — Lei nº 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD — Titular de Dados: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados
- ANPD — Perguntas Frequentes: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- ANPD — Fluxo da petição do titular: https://www.gov.br/anpd/pt-br/fluxo-da-peticao-do-titular
- Marco Civil da Internet — Lei nº 12.965/2014: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm

The ANPD regulatory agenda for 2025–2026 showed regulation of data-subject rights still in progress in the status updated 16 July 2026. Public deployment should re-check current regulation instead of assuming today's procedural details are permanent.

## 20. Public commitment

ARCA should hold as little unnecessary user data as practical, expose investigated persons only to sourced/necessary/proportionate public-interest information, make challenges reviewable and keep security/privacy claims inspectable.

The intended standard is not `trust ARCA`.

It is: **make the system's security, privacy, provenance, review and correction claims testable enough that users and affected persons do not have to rely on blind trust.**
