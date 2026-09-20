# ARCA Security & Privacy White Paper v1

**Status:** architecture and public-interest security baseline  
**Date:** 17 September 2026  
**Scope:** ARCA Core, Workbench, Acquisition/Custody, AIE, PNCP, Agent Gateway, Credential Vault, Capability Registry, Machine Bridge and Human Review

> ARCA is designed to make public-interest investigation more verifiable without turning public availability into unlimited personal-data collection. Security, privacy, provenance and human review are system properties, not optional interface text.

---

## 1. Executive summary

ARCA is intended to operate with the smallest practical amount of user data and with strict controls over data about investigated persons.

The target product posture is:

- no mandatory ARCA account for local/self-hosted use;
- no mandatory analytics or advertising identifier;
- no requirement to send an investigation to a central ARCA cloud;
- provider-independent AI connections;
- credentials encrypted at rest and isolated behind a Credential Broker;
- public-source acquisition separated from inference;
- exact provenance and custody for evidence-bearing acquisitions;
- explicit uncertainty and visible data gaps;
- no automatic conversion of an analytical signal into an accusation;
- human review before sensitive conclusions or canonical promotion;
- capability advertisement separated from capability verification and authorization;
- publication should expose only information necessary for the public-interest purpose.

ARCA does **not** treat “publicly accessible” as meaning “privacy-free”. Public personal data remains subject to purpose, necessity, proportionality, quality and other applicable safeguards.

---

## 2. Privacy premise: collect less, prove more

ARCA prefers architecture that avoids collecting user data instead of collecting it and promising to protect it later.

### 2.1 User-side minimization target

A conforming public product SHOULD, by default:

- avoid mandatory registration when the requested function does not require identity;
- avoid behavioral advertising;
- avoid cross-site tracking;
- avoid fingerprinting;
- avoid collecting contact information merely to use the investigation engine;
- keep investigation material local or in a user-selected host whenever feasible;
- disable optional telemetry until it is explicitly defined and justified;
- make any operational logs bounded, purpose-specific and retention-limited.

This is a product target. A concrete hosted deployment must still verify what its web server, reverse proxy, CDN, WAF, analytics stack and infrastructure actually record.

### 2.2 Privacy notice versus “no privacy policy”

The absence of accounts does not by itself prove the absence of personal-data processing. IP addresses, access logs and electronic interaction records can be personal data depending on the context. A deployment therefore MUST inventory its real processing before claiming that it collects no user data.

A local/offline distribution may have virtually no ARCA-side user-data collection. A public hosted deployment may still need a concise privacy notice explaining infrastructure logs or other unavoidable processing. ARCA should minimize the need for such a notice, not make an unverifiable promise that one can never be necessary.

---

## 3. Investigated-person privacy

ARCA exists to examine public-interest facts, not to build unrestricted personal dossiers.

### 3.1 Public-source boundary

Investigative acquisition SHOULD prefer:

1. official APIs and official public datasets;
2. official publications and public records;
3. other lawful public sources when official sources are insufficient.

Private credentials, unlawfully obtained data, non-public financial records, private communications and unauthorized access are outside the intended acquisition model.

### 3.2 Necessity filter

Before personal data is promoted into an investigation or publication, the system should be able to answer:

- What public-interest question does this field help answer?
- Is the field necessary or merely interesting?
- Can the same evidentiary purpose be met with less personal detail?
- Is the source authoritative enough for the proposed use?
- Is the information current and correctly attributed?

Irrelevant personal details SHOULD be excluded even when they are technically public.

### 3.3 Sensitive and high-risk information

Sensitive personal data and information that can create disproportionate harm require a stricter publication boundary. Examples include health, biometrics, precise private location, private family details and data involving children or adolescents.

ARCA SHOULD distinguish:

- evidence necessary for a lawful/public-interest analysis;
- restricted investigation context;
- information safe to include in a public report.

The public-report layer should support redaction/suppression without destroying the underlying provenance record where retention is justified.

### 3.4 No guilt inference from association

A relationship in a public record is not automatically evidence of wrongdoing. Shared addresses, family names, corporate relationships, campaign links, supplier relationships or repeated participation may generate a question or hypothesis, but not an accusation by themselves.

ARCA's analytical outputs must preserve this distinction:

```text
observation -> analytical signal -> hypothesis -> competing explanations -> evidence review -> human conclusion
```

### 3.5 Data gaps remain gaps

Missing values must not be filled with plausible guesses and presented as facts. ARCA uses explicit gaps/warnings rather than fabricated completeness.

This protects both investigative accuracy and the rights of people described by the system.

---

## 4. Security architecture already implemented

### 4.1 Canonical Core authority

Agents do not receive unrestricted authority to mutate canonical ARCA state. Agent outputs are proposals/results subject to validation and review boundaries.

### 4.2 Human Review Queue

Sensitive/reviewable Machine Bridge results can be materialized into a durable Human Review Queue and surfaced in the Workbench Inbox. Decisions are explicit and auditable.

### 4.3 Closed Action Registry

Machine Bridge workers execute registered actions. Network-supplied strings are not silently converted into arbitrary shell commands.

### 4.4 Capability and authorization separation

Capability matching does not grant permission. The Capability Registry records what a participant declares or has demonstrated; policy remains a separate authority.

### 4.5 Credential Vault

Persisted connection secrets are encrypted using AES-256-GCM. The master secret is kept outside the persisted credential record.

### 4.6 Credential Broker

The Agent/Core/Registry do not need raw API credentials. The Broker decrypts just-in-time at the transport boundary and presents the credential to the external provider.

There is deliberately no normal “show saved key” operation. Replacement is rotation.

### 4.7 Secret-free audit

Credential operations can be audited through hashes and chained events without placing the credential plaintext into audit records.

### 4.8 Network policy

External agent networking is disabled by default. Remote origins require host allowlisting. Plain HTTP is restricted to loopback. Redirects are rejected by the Agent Gateway client.

PNCP network actions are separate from planning actions and require explicit capability/configuration gates.

### 4.9 Acquisition before inference

For controlled public-network acquisition, original response bytes are captured into custody before parsing/analysis. Hashes and provenance references allow later verification.

### 4.10 Durable custody

Evidence-bearing acquisition is not supposed to rely on ephemeral worker storage as the canonical custody location.

### 4.11 Integrity controls

ARCA already uses SHA-256 in multiple integrity boundaries, append-only/chained event structures, optimistic concurrency, record hashes and tamper detection where applicable.

### 4.12 Repository privacy gate

The repository includes checks intended to prevent accidental redistribution of prohibited development/test personal material. Public examples should use synthetic fixtures unless real public material is intentionally reviewed for publication.

---

## 5. Capability privacy and trust

The Capability Registry introduces a privacy-preserving “Capability Passport”.

A passport records:

- participant ID;
- participant type;
- provider/model identifiers when appropriate;
- non-secret labels;
- capability contracts;
- verification status;
- fingerprints;
- verification timestamps.

It MUST NOT contain passwords, API keys, bearer tokens, OAuth tokens or credential references.

A participant cannot mark itself as trusted merely by claiming a capability. Self-advertised capabilities begin as `declared`. A separate ARCA conformance verification is needed for `verified`.

Verification records are hash-chained and can reference a SHA-256 evidence artifact without storing sensitive test content in the ledger itself.

---

## 6. User credential threat boundary

The security claim is deliberately precise.

ARCA can guarantee by design that a stored credential need not be exposed to the Agent, Core, Registry, jobs, ordinary results or audit log.

ARCA cannot honestly guarantee that a credential used to authenticate to an API never exists in process memory. At the moment of an authenticated request, some trusted transport component must present it to the provider.

The design therefore minimizes exposure:

```text
encrypted credential
        |
        v
Credential Vault
        |
        v
just-in-time decryption
        |
        v
Credential Broker / transport boundary
        |
        v
TLS request to provider
```

The security objective is bounded exposure, non-persistence in plaintext, no accidental logging and verifiable isolation from unrelated components.

---

## 7. Data lifecycle

### 7.1 Collection

Collect only material needed for a declared investigative purpose and supported by an authorized/public source route.

### 7.2 Acquisition

Preserve source locator, timestamps, access declaration and integrity information. Evidence-bearing network data should enter custody before interpretation.

### 7.3 Processing

Separate raw source material from normalization, analytical findings, hypotheses and human conclusions.

### 7.4 Review

Human review is mandatory where the workflow marks the result as review-required. Analytical automation does not silently become a final legal/factual judgment.

### 7.5 Publication

Future publication/export tooling SHOULD apply a separate publication filter for necessity, sensitive data, private identifiers and unsupported allegations.

### 7.6 Retention and deletion

Retention must be purpose-driven and deployment-specific. Future hosted profiles should define retention ceilings for operational logs, temporary artifacts and user-provided material. Deletion of evidence under lawful retention must not be confused with redaction of a public report.

---

## 8. Deployment profiles

### Profile A — Local/offline

Preferred privacy posture for users who do not need shared hosting.

- no ARCA account required;
- data stays on the user's device unless the user connects an external provider/source;
- no central ARCA investigation database required;
- local credentials remain under the user's host security boundary.

### Profile B — Self-hosted/team

The operator controls infrastructure and becomes responsible for its actual logs, backups, access control and retention.

ARCA should provide secure defaults, but deployment policy belongs to the operator.

### Profile C — Public hosted service

A hosted public service needs additional controls:

- infrastructure data inventory;
- documented log/retention policy;
- TLS and hardened secrets management;
- abuse/rate controls that do not require unnecessary profiling;
- public contact/correction channel;
- incident-response procedure;
- transparency notice reflecting actual processing;
- publication/redaction gate.

A hosted service should not claim “we collect nothing” unless this has been technically verified across the entire infrastructure stack.

---

## 9. Transparency for investigated persons

A mature public ARCA deployment should make it possible to understand why information appears in a report.

Recommended properties:

- each material factual assertion links back to source/provenance;
- source date and retrieval date are visible where material;
- inferred/analytical material is visibly distinguished from source facts;
- uncertainty and missing information remain visible;
- corrections do not silently rewrite history: corrected versions retain an audit trail;
- a person or entity described by a published report can point to an error or outdated source for human review;
- a challenged item can be marked disputed/reviewing without automatically deleting valid public evidence.

This is both a privacy safeguard and an evidentiary-quality safeguard.

---

## 10. Security and privacy controls still recommended

The following are not all implemented yet and should be treated as roadmap items:

- OS-backed master-key storage (Android Keystore, TPM, Secure Enclave, secret manager);
- ephemeral “use once, do not save” API credentials;
- formal data-classification labels for public/restricted/sensitive investigation material;
- publication redaction/suppression engine;
- privacy-impact self-audit for hosted deployments;
- configurable retention ceilings;
- incident-response and breach-notification runbook;
- capability conformance probe library;
- capability expiry and periodic re-verification;
- subject correction/dispute workflow for public reports;
- privacy-preserving operational metrics, if metrics are ever enabled;
- export manifest that lists removed/redacted fields without revealing their sensitive contents.

Roadmap items must not be advertised as implemented controls until code/tests prove them.

---

## 11. Auditability

Security claims should be testable.

ARCA's preferred evidence hierarchy for a security/privacy claim is:

1. executable test;
2. code-enforced invariant;
3. schema/validation boundary;
4. auditable record/hash;
5. specification/documentation;
6. interface copy.

A statement in the UI alone is not a security control.

---

## 12. Brazilian data-protection context

This document is a technical architecture statement, not a legal opinion.

Current official Brazilian guidance confirms that the LGPD applies to personal data whose access is public or which was made manifestly public, while preserving general principles and data-subject rights. The LGPD also establishes principles including purpose, adequacy and necessity.

Official references consulted for this v1:

- LGPD, Lei nº 13.709/2018 (texto compilado): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD — Perguntas Frequentes: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- ANPD — Aviso de Privacidade (example of electronic interaction/IP disclosure): https://www.gov.br/anpd/pt-br/acesso-a-informacao/aviso-de-privacidade
- ANPD — Radar Tecnológico / IA generativa (public/web-scraped data and LGPD principles): https://www.gov.br/anpd/pt-br/centrais-de-conteudo/documentos-tecnicos-orientativos/radar_tecnologico_ia_generativa_anpd.pdf

Legal requirements must be reassessed for the final deployment model, jurisdiction, operator and actual data flows.

---

## 13. Public commitment

ARCA should prefer an architecture in which the operator has less data to protect, the user has less data to surrender and an investigated person is exposed only to information that is relevant, sourced, reviewable and proportionate to the public-interest purpose.

The intended standard is not “trust ARCA”. It is: **make ARCA's security, provenance and privacy claims inspectable enough that users do not have to rely on blind trust.**
