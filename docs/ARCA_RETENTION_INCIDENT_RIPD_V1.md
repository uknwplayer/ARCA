# ARCA Retention, Incident Response & RIPD Assistant v1

**Status:** backend foundation  
**Date:** 17 September 2026  
**Scope:** data lifecycle, security incidents and privacy-impact assessment  
**Frontend:** not included

## 1. Purpose

This layer extends ARCA's privacy architecture from publication-time controls to the full data lifecycle:

```text
collect / acquire
      ↓
process / investigate
      ↓
retain only while justified
      ↓
review / anonymize / delete-eligible
```

and, independently:

```text
security incident
      ↓
record immediately
      ↓
human risk review
      ↓
communication decision
      ↓
mitigation + durable incident record
```

A third component provides a conservative RIPD readiness assessment for processing operations that may create high privacy risk.

## 2. Legal baseline

Technical rules were checked against the current official Brazilian baseline:

- LGPD, arts. 15 and 16: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD FAQ on retention/deletion: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- Resolução CD/ANPD nº 15/2024 (communication of security incidents): https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-15-de-24-de-abril-de-2024
- ANPD security-incident channel: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
- ANPD RIPD guidance: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd
- ANPD Regulatory Agenda 2025–2026: https://www.gov.br/anpd/pt-br/assuntos/regulacao/agenda-regulatoria-1

This module is not legal advice and does not replace deployment-specific legal review.

## 3. Retention Engine

Formats:

- `arca-retention-policy-v1`
- `arca-retention-assessment-v1`

The LGPD does not establish one universal retention period for every category of personal data. Retention depends on purpose and applicable obligations. The engine therefore does not ship a single global retention duration.

A policy records:

- data class;
- declared purpose;
- optional maximum retention window;
- optional review interval;
- optional legal-basis reference;
- documented conservation grounds;
- integrity hash.

Supported data classes include operational logs, temporary artifacts, user-provided data, investigation evidence, public exports, credential audit, subject requests and incident records.

### 3.1 Assessment outcomes

`assessRetention()` can return:

- `retain`;
- `review`;
- `anonymize`;
- `delete-eligible`;
- `legal-hold`.

`delete-eligible` is deliberately not `deleted`.

Every assessment states:

```json
{
  "automaticDeletionPerformed": false,
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

Actual deletion should be implemented later as a separately authorized action with its own review, audit and custody rules.

### 3.2 Article 16 conservation grounds

The engine can represent documented conservation grounds broadly corresponding to LGPD art. 16:

- legal/regulatory obligation;
- research;
- lawful transfer to a third party;
- exclusive controller use in anonymized form;
- another documented ground requiring review.

The presence of a string does not prove that the legal requirements are met. Except for the explicit anonymized-use path, a post-purpose conservation ground routes to review rather than silently authorizing indefinite retention.

### 3.3 Evidence protection

A legal hold or regulatory minimum floor takes priority over ordinary delete eligibility. This prevents lifecycle automation from destroying evidence, audit records or incident records that must still be preserved.

## 4. Security Incident Registry

Formats:

- `arca-security-incident-v1`
- `arca-security-incident-review-v1`

The registry captures the incident before deciding whether notification is legally required.

The incident record can include:

- date discovered;
- controller-knowledge timestamp;
- whether personal data is known to be affected;
- affected categories;
- estimated affected subjects;
- mitigation measures;
- integrity hash.

A newly created incident remains `communicationStatus: undetermined`.

## 5. ANPD notification baseline

Under the current Resolução CD/ANPD nº 15/2024, a controller must communicate an incident that may create relevant risk or harm when the required dimensions are met. The current communication window is three business days, subject to applicable specific rules and differentiated treatment where legally provided.

ARCA stores the regulatory window as:

`3-business-days-from-controller-knowledge-of-personal-data-impact`

The engine deliberately does **not** calculate a legal due date by itself because business-day computation may depend on holidays, jurisdiction and deployment-specific rules. A host/calendar layer must resolve the actual date.

A review requires explicit human confirmation of:

1. significant impact; and
2. at least one qualifying criterion.

Qualifying criteria represented in v1 are:

- sensitive personal data;
- children/adolescents/elderly;
- financial data;
- authentication data;
- legal/judicial/professional secrecy;
- large-scale data.

No incident receives a communication-required decision without human review.

## 6. Incident record retention

The current ANPD incident regulation requires records of security incidents, including incidents not communicated to the ANPD or data subjects, to be retained for at least five years from registration, unless a longer obligation applies.

`createSecurityIncident()` therefore emits `retentionNotBefore` five calendar years after `registeredAt`.

This is a minimum retention floor, not a command to destroy the record immediately when that date arrives.

## 7. RIPD Assistant

Format: `arca-ripd-assessment-v1`.

The ANPD currently recommends preparing a RIPD before beginning processing that may create high risk, and the LGPD allows the ANPD to require RIPD in defined contexts. The detailed regulatory framework remains dynamic.

The v1 assistant therefore produces one of:

- `routine-review`;
- `consider-ripd`;
- `prepare-ripd`.

It does **not** generate a formal RIPD and does not submit anything to the ANPD.

### 7.1 Explicit high-risk signals

The assistant works from explicit indicators instead of inferring sensitive facts from arbitrary free text:

- sensitive data;
- children/adolescents;
- large scale;
- systematic monitoring;
- automated adverse decisions;
- novel technology;
- precise location;
- financial/authentication data;
- data combination/profiling.

Any explicit high-risk signal yields `prepare-ripd` as a conservative workflow recommendation.

A legitimate-interest basis or identified risks without the explicit high-risk indicators yields at least `consider-ripd`.

### 7.2 Completeness gaps

The assessment exposes missing documentation instead of inventing it. It checks whether the record contains, at minimum:

- data categories;
- processing operations;
- subject groups;
- legal-basis references;
- safeguards;
- identified risks where high-risk signals exist.

The output can also store necessity, proportionality and residual-risk assessments supplied by the responsible human/process.

Every assessment states:

```json
{
  "formalRipdGenerated": false,
  "anpdSubmissionPerformed": false,
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

## 8. Relationship with existing privacy layers

```text
Legal Basis Registry
      ↓
processing purpose
      ↓
RIPD readiness assessment
      ↓
Acquisition / investigation
      ↓
Retention assessment throughout lifecycle
      ↓
Privacy Classification
      ↓
Data Subject Request hold, if any
      ↓
Publication Gate
      ↓
Redaction Export Receipt
```

Security incidents are a parallel control plane that can affect all of these stages.

## 9. Fail-closed properties

- no automatic data deletion;
- no automatic regulator notification;
- no automatic legal conclusion;
- no calculation of legal business-day deadlines without a calendar authority;
- incident notification decision requires human review;
- formal RIPD is not represented as generated when only an assessment exists;
- missing RIPD fields remain explicit gaps;
- retention policy and assessments carry integrity hashes.

## 10. Future extensions

Separate future work should include:

- authorized deletion/anonymization executor with proof of completion;
- storage-class-specific retention adapters;
- jurisdiction-aware business-day calendar resolver;
- incident event ledger and notification receipts;
- incident simulation/tabletop tests;
- formal RIPD document generator based on reviewed inputs;
- public/internal RIPD view separation;
- incident response contact/escalation configuration;
- deployment-specific retention templates;
- breach notification templates generated only after human approval.
