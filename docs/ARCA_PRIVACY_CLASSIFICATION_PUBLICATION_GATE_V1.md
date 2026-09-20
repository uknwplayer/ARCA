# ARCA Privacy Classification + Publication Gate v1

**Status:** backend foundation  
**Date:** 17 September 2026  
**Scope:** public-interest investigations, reports and future public export  
**Frontend:** not included

## 1. Purpose

ARCA separates the right to investigate lawful public-interest material from the decision to expose every collected field publicly.

The v1 privacy layer introduces two auditable stages:

```text
source / evidence / finding
        ↓
Privacy Classification
        ↓
Publication Gate
        ↓
PUBLISH | PUBLISH WITH REDACTION | HOLD | REJECT
```

The Publication Gate does not itself publish content and does not provide legal advice. It records whether a record has satisfied minimum technical/privacy conditions for a future exporter or public-report layer.

## 2. Legal design premise

The technical policy is intentionally conservative and based on current Brazilian data-protection principles.

The LGPD defines personal data and sensitive personal data and requires good faith together with purpose, adequacy, necessity, data quality, transparency, security, prevention, non-discrimination and accountability. The law also states that processing personal data whose access is public must consider the purpose, good faith and public interest that justified its availability.

Official references used by this design:

- Lei nº 13.709/2018 (LGPD), especially arts. 5, 6, 7, 10 and 11: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD FAQ: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- Marco Civil da Internet, Lei nº 12.965/2014: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm

This specification is a technical control baseline, not a substitute for case-specific legal advice.

## 3. Lawful flexibility without evasion

ARCA may use lawful exceptions, legal bases and legitimate public-interest possibilities where they genuinely apply. The system must not convert ambiguity, an exception or a procedural gap into a mechanism for evading privacy safeguards.

The architecture therefore supports an explicit `legalReviewState`:

- `not-assessed`
- `not-required`
- `required`
- `completed`

When a record is explicitly marked `required`, the automated publication gate cannot bypass that requirement. Human/legal review must be completed before the gate may release it on that dimension.

## 4. Privacy classes

Format: `arca-privacy-classification-v1`.

Classes:

### `public`

Non-personal or low-risk material appropriate for public-interest use, normally supported by lawful/public sources.

A public source does not automatically make data about a natural person class `public`.

### `personal`

Information related to an identified or identifiable natural person that does not fall into a stricter class under the current indicators.

### `sensitive`

Used when indicators point to categories such as health/biometric data or categories corresponding to LGPD sensitive-data concepts, including political/religious/union/sexual categories.

### `high-risk`

Material with an elevated harm profile even where a single LGPD-sensitive category is not the only concern, for example:

- children/adolescents;
- precise private location;
- adverse accusation/inference requiring stronger review.

### `restricted`

Material that should not enter the normal public-report path, including credentials/secrets and private communications in the v1 policy.

### `redact-before-publication`

Personal material for which the evidentiary/public-interest purpose can be met while suppressing an unnecessary identifier or detail.

## 5. Classification indicators

The v1 classifier accepts explicit indicators rather than trying to infer sensitive facts from free text.

Indicators include:

- direct identifier;
- financial identifier;
- precise private location;
- health or biometric data;
- political/religious/union/sexual sensitive category;
- child/adolescent involvement;
- private communication;
- secret/credential;
- accusation/adverse inference;
- public accessibility of source;
- official source;
- public-interest necessity;
- minimization available;
- disputed/outdated material.

This keeps the classifier auditable and avoids silently deciding sensitive legal/factual questions through an opaque model.

## 6. Integrity

Every classification includes `classificationHash` (SHA-256 over canonicalized classification data).

`verifyPrivacyClassification()` detects post-classification modification.

The Publication Gate refuses a classification whose hash no longer matches.

## 7. Publication Gate inputs

Format: `arca-publication-decision-v1`.

The gate evaluates explicit facts/confirmations:

- purpose confirmed;
- necessity confirmed;
- source verified;
- human review completed where required;
- legal review completed where explicitly required;
- public-interest rationale for high-risk/sensitive material;
- explicit redactions where minimization is available.

The gate does **not** infer that a processing activity is lawful merely because these booleans are true. They are auditable workflow assertions made by the surrounding system/human process.

## 8. Gate outcomes

### `publish`

The record passed the v1 technical publication checks without requiring v1 redaction.

### `publish-with-redaction`

Publication is conditionally acceptable only if the listed redactions are actually applied by the future exporter/publication layer.

### `hold`

Publication is blocked pending missing purpose/necessity/source verification, review, redaction, dispute resolution, public-interest rationale or another v1 requirement.

### `reject`

The normal public publication route is refused. In v1, secrets/credentials and private communications are rejected rather than merely redacted by default.

## 9. High-risk rule

Sensitive/high-risk material requires:

1. a non-empty public-interest rationale; and
2. completed human review.

This requirement is independent from whether the source was public.

## 10. Minimization/redaction

Where `canMinimize=true` or the class is `redact-before-publication`, the gate requires explicit redaction metadata.

Example:

```json
{
  "field": "cpf",
  "reason": "identifier not necessary for procurement finding",
  "replacement": "[REDACTED]"
}
```

The gate does not mutate original evidence. Redaction applies to a future publication representation, preserving custody/provenance separately.

## 11. Disputes and outdated data

A record flagged `disputedOrOutdated` is held rather than silently published through the normal route.

The intended later workflow is:

```text
challenge / stale signal
      ↓
hold
      ↓
human source re-check
      ↓
correction / confirmation
      ↓
new auditable publication decision
```

Corrections should not destroy the historical evidence/audit trail.

## 12. Secrets and private communications

The v1 gate rejects normal public publication when classification indicates:

- API keys, passwords, bearer tokens or credentials; or
- private communications.

This does not make a legal determination about every possible exceptional use. It establishes a safe product default. A future exceptional workflow would require a separate policy/profile and must not silently weaken this default.

## 13. Publication decision audit

Every decision includes:

- publication ID;
- record ID;
- classification hash;
- action;
- reasons;
- redactions;
- review confirmations;
- public-interest rationale;
- timestamp;
- `decisionHash`.

It also explicitly records:

```json
{
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false,
  "publicationPerformed": false
}
```

The gate is therefore a policy/audit boundary, not a publisher or automated lawyer.

## 14. Relationship with custody

Raw evidence/custody and public presentation are separate layers.

```text
Raw evidence + SHA-256 + provenance
              ↓
      investigation context
              ↓
      privacy classification
              ↓
       publication decision
              ↓
      redacted public view
```

Redacting a public output must not rewrite the original custodied source.

## 15. Relationship with AI

An AI may help identify fields that might need classification, but v1 does not allow an AI's unsupported free-text judgment to override these controls.

No model can simply return `safe_to_publish=true` and bypass:

- classification integrity;
- purpose/necessity checks;
- source verification;
- required human/legal review;
- redaction requirements.

## 16. Tests

The v1 test suite covers:

- public non-personal classification;
- personal/minimizable classification;
- restricted secrets/private communications;
- sensitive/high-risk rationale and human-review requirements;
- explicit legal-review boundary;
- redaction requirement;
- missing purpose/necessity/source verification;
- disputed/outdated holds;
- tamper detection.

## 17. Not yet implemented

This foundation intentionally does not yet include:

- a public exporter that applies redactions to arbitrary document formats;
- automated PII discovery across arbitrary files;
- data-subject dispute/correction portal;
- retention/deletion engine;
- per-deployment LGPD legal-basis registry;
- automated DPIA/RIPD generator;
- special publication profiles for journalism/research or other legally distinct contexts.

Those should be separate, testable layers rather than hidden exceptions in this gate.
