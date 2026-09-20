# ARCA Security Control Matrix + Self-Audit Dashboard v1

**Status:** backend foundation / frontend-ready contract  
**Date:** 17 September 2026  
**Frontend:** intentionally not implemented in this PR

## 1. Purpose

This layer converts ARCA's growing security/privacy architecture into a machine-readable control matrix and a stable dashboard model that a later Workbench/web/mobile interface can render without reimplementing security logic.

The system intentionally does **not** produce a legal-compliance score or certification.

```text
implemented controls + deployment assertions + roadmap state
                         ↓
                 Security Self-Audit
                         ↓
              tamper-evident audit record
                         ↓
                Dashboard View Model
                         ↓
            future frontend / interface
```

## 2. Why no compliance percentage

A numeric percentage such as `92% compliant` would create false precision. A control can be technically implemented while a particular deployment is still misconfigured or an actual processing activity remains legally inappropriate.

The backend therefore reports counts and per-control states rather than a single compliance score.

Every audit/dashboard explicitly records:

```json
{
  "legalComplianceConclusion": false,
  "automatedLegalConclusion": false,
  "complianceScoreProduced": false
}
```

## 3. Control states

- `pass` — the project baseline implements the cataloged technical control, or the deployment explicitly confirms the required assertion.
- `attention` — a deployment assertion was explicitly reported false.
- `deployment-required` — the software cannot determine the infrastructure condition and the operator has not supplied an assertion.
- `not-assessed` — reserved for future controls whose state cannot yet be evaluated.
- `not-implemented` — roadmap item that the current codebase does not provide.
- `not-applicable` — the control does not apply to the selected deployment profile.

`pass` means only that the cataloged technical condition is represented as implemented/confirmed. It is not a legal conclusion about a concrete use of ARCA.

## 4. Deployment profiles

### `local-offline`

No hosted infrastructure is assumed. Hosted TLS/privacy-notice/logging controls become not-applicable, while code-level controls remain visible.

### `self-hosted`

Infrastructure assertions become relevant, including TLS, access control, logging, backups, incident ownership and data-flow inventory.

### `public-hosted`

Adds public-facing requirements such as an accurate privacy/transparency notice and a functioning subject-rights/correction contact path.

## 5. Initial domains

The matrix currently groups controls under:

- credentials;
- network;
- execution;
- evidence/custody;
- privacy/publication;
- lifecycle/retention;
- incident response;
- governance/RIPD;
- deployment.

## 6. Initial catalog examples

Implemented baseline controls include:

- encrypted credential persistence;
- Credential Broker boundary;
- external-network default deny/allowlist;
- closed Machine Bridge action model;
- capability declaration separated from verification;
- acquisition/custody before inference where applicable;
- Privacy Classification;
- Publication Gate;
- subject-request publication hold;
- Redaction Export Receipt;
- Retention Engine;
- Security Incident Registry;
- RIPD Assistant.

Roadmap items remain visible instead of disappearing from the dashboard:

- OS-backed key storage;
- ephemeral/use-once credentials;
- actual document redaction engine;
- authorized deletion executor;
- deletion proof.

## 7. Deployment assertions

A later frontend may ask the operator questions such as:

```text
TLS enabled?                         YES / NO / UNKNOWN
Infrastructure data inventory done? YES / NO / UNKNOWN
Log retention documented?           YES / NO / UNKNOWN
Privacy notice published?           YES / NO / UNKNOWN
Subject-rights contact available?   YES / NO / UNKNOWN
Incident owner assigned?            YES / NO / UNKNOWN
Access controls documented?         YES / NO / UNKNOWN
Backups protected/inventoried?      YES / NO / UNKNOWN
```

These are operator assertions, not facts the ARCA library can infer from arbitrary infrastructure.

## 8. Audit integrity

Formats:

- `arca-security-control-catalog-v1`
- `arca-security-self-audit-v1`
- `arca-security-dashboard-v1`

Catalog, self-audit and dashboard records carry SHA-256 integrity hashes over canonicalized content.

Tampering after generation is therefore detectable by the provided verifier functions.

## 9. Frontend contract

`buildSecurityDashboardModel()` returns UI-oriented data instead of HTML.

The model contains:

```text
format
sourceAuditHash
deploymentProfile
summaryCards[]
sections[]
filters
  statuses[]
  severities[]
  domains[]
disclaimers[]
legalComplianceConclusion=false
complianceScoreProduced=false
generatedAt
dashboardHash
```

### Summary cards

Initial cards:

- controls confirmed;
- attention required;
- deployment-dependent controls;
- roadmap/not-implemented controls.

The frontend should display counts without calculating its own compliance percentage.

### Sections

Each section has:

```json
{
  "id": "privacy",
  "label": "Privacidade e publicacao",
  "controls": [
    {
      "id": "privacy.publication-gate",
      "title": "Publication Gate",
      "description": "...",
      "status": "pass",
      "severity": "critical",
      "reason": "implemented-and-covered-by-project-evidence",
      "evidence": ["..."]
    }
  ]
}
```

The interface can therefore render cards, tables, filters or details without deciding control status itself.

## 10. Frontend design rules for later implementation

A future interface SHOULD:

- show the selected deployment profile prominently;
- distinguish project controls from deployment assertions;
- show `UNKNOWN`/`deployment-required` rather than defaulting unanswered questions to pass;
- allow opening evidence references;
- show roadmap gaps visibly;
- surface critical/high unresolved controls first;
- show the audit timestamp/hash;
- permit re-running the assessment after deployment settings change;
- explain that technical status is not a legal certificate.

It SHOULD NOT:

- hide failed/not-implemented controls;
- show a single green compliance badge for the whole system;
- infer legal compliance from the number of passing controls;
- permit the UI to override backend control status without a new auditable assessment.

## 11. Relationship to current Brazilian regulatory baseline

The matrix is designed around security/accountability principles in the LGPD and the current ANPD architecture already referenced by the Security & Privacy White Paper.

The ANPD's 2025–2026 regulatory agenda continues to list minimum technical/administrative security standards as regulatory work in progress. Therefore ARCA must not freeze an invented universal checklist and call it regulator-certified.

RIPD guidance likewise states that the regulatory environment is dynamic and additional parameters can be established later.

Official references checked for this design:

- ANPD Agenda Regulatoria: https://www.gov.br/anpd/pt-br/assuntos/regulacao/agenda-regulatoria-1
- ANPD RIPD guidance: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd
- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm

## 12. Evidence semantics

The current baseline catalog contains repository evidence references for implemented controls. This means the project knows where the implementation/tests are located.

It does not mean every deployment automatically ran every test at the time a dashboard is viewed. CI/run attestations can later be attached as a stronger evidence type.

A future v2 can distinguish evidence classes such as:

- source-code invariant;
- executable test;
- latest CI attestation;
- deployment assertion;
- external audit;
- signed release provenance.

## 13. Future interface concept

A possible UI structure is:

```text
SECURITY & PRIVACY

Deployment: PUBLIC HOSTED
Audit: 17/09/2026 13:xx BRT

[ Confirmed ] [ Attention ] [ Deployment ] [ Roadmap ]

Critical / High attention
-----------------------------------
TLS                         PASS
Privacy notice              ATTENTION
Subject-rights contact      NEEDS CONFIGURATION
OS-backed key storage       NOT IMPLEMENTED

Domains
-----------------------------------
Credentials
Network
Execution
Evidence & Custody
Privacy & Publication
Lifecycle
Incidents
Governance
Deployment
```

The future frontend is presentation only. The backend remains authoritative for catalog/audit/dashboard construction.

## 14. Next hardening

Useful next steps include:

- CI attestation ingestion into control evidence;
- signed release/build provenance;
- control history/diff between audits;
- deployment profiles saved without collecting unnecessary user identity;
- exportable self-audit report;
- optional mapping from controls to legal/regulatory references without pretending that mapping is a legal conclusion;
- Workbench/API endpoint exposing the dashboard model.
