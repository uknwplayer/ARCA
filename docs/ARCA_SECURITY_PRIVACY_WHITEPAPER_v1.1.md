# ARCA Security & Privacy White Paper v1.1

**Status:** architecture and public-interest security baseline  
**Date:** 17 September 2026  
**Supersedes:** `ARCA_SECURITY_PRIVACY_WHITEPAPER_v1.md` as the latest consolidated statement  
**Scope:** ARCA Core, Workbench, Acquisition/Custody, AIE, PNCP, Agent Gateway, Credential Vault, Capability Registry, Machine Bridge, Human Review, Privacy Classification and Publication Gate

> ARCA is designed to make public-interest investigation more verifiable without turning public availability into unlimited personal-data collection. Security, privacy, provenance and human review are system properties, not optional interface text.

---

## 1. Executive summary

ARCA's preferred security model is to collect less, expose less and prove more.

The target posture is:

- no mandatory ARCA account for local/self-hosted use;
- no mandatory advertising or behavioral-tracking identifier;
- no requirement to upload investigations to a central ARCA cloud;
- provider-independent AI connections;
- encrypted credential storage behind a Credential Broker;
- acquisition separated from inference;
- source provenance and chain of custody for evidence-bearing acquisitions;
- explicit uncertainty and visible data gaps;
- no automatic conversion of analytical signals into accusations;
- human review for sensitive conclusions and review-bound actions;
- capability declaration separated from verification and authorization;
- personal-data classification before public exposure;
- a publication gate that can block, require redaction or reject normal public publication;
- public reports limited to information necessary for their public-interest purpose.

ARCA does not treat `publicly accessible` as equivalent to `privacy-free`.

---

## 2. User privacy

ARCA prefers architecture that avoids collecting user information instead of collecting it and promising to protect it later.

### 2.1 Default minimization goals

A conforming deployment should, where technically possible:

- avoid mandatory registration when identity is not necessary;
- avoid cross-site tracking and fingerprinting;
- avoid behavioral advertising;
- avoid collecting contact information merely to run an investigation;
- keep investigation material local or on a host selected by the user;
- disable optional telemetry unless it has a defined purpose;
- bound operational logs by purpose and retention period.

### 2.2 Hosted infrastructure reality

No-account architecture does not prove zero personal-data processing. Web servers, CDNs, reverse proxies, WAFs and infrastructure may process IP addresses and access records.

A hosted ARCA service must inventory its actual data flow before claiming zero collection. If infrastructure processing exists, the operator should provide a concise and accurate notice rather than a false `we collect nothing` promise.

---

## 3. Privacy of investigated persons

ARCA exists to examine public-interest facts, not to assemble unrestricted personal dossiers.

### 3.1 Public-source boundary

Acquisition should prefer:

1. official APIs and datasets;
2. official publications and public records;
3. other lawful public sources when necessary.

Unauthorized access, stolen credentials, private communications and unlawfully obtained private records are outside the intended default acquisition model.

### 3.2 Public does not mean unlimited reuse

The LGPD states that processing personal data whose access is public must consider the purpose, good faith and public interest that justified its availability. ARCA therefore separates source accessibility from publication suitability.

A public source may still contain:

- unnecessary identifiers;
- sensitive personal data;
- information about children;
- precise location;
- stale or disputed material;
- information whose evidentiary value can be preserved with less public exposure.

### 3.3 Necessity filter

For material involving natural persons, ARCA should be able to answer:

- What public-interest question does this information support?
- Is the field necessary to answer it?
- Can the same evidentiary purpose be met with less detail?
- Is the source sufficiently authoritative?
- Is the information current and correctly attributed?

Interesting but unnecessary personal detail should not be published merely because it was easy to obtain.

---

## 4. Lawful flexibility and legal review

ARCA is not designed to impose restrictions beyond the law merely for appearances. Legitimate legal bases, exceptions and public-interest permissions may be used when they genuinely apply.

However, ambiguity or an exception must not be used as a hidden mechanism to bypass privacy controls.

The privacy classification model therefore supports an explicit legal-review state:

- `not-assessed`;
- `not-required`;
- `required`;
- `completed`.

When review is explicitly marked `required`, the automated Publication Gate cannot release the record until that review is completed.

The gate also records:

```json
{
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

This makes the boundary inspectable: ARCA can enforce workflow requirements without pretending to replace a lawyer or court.

---

## 5. Credential security

### 5.1 Credential Vault

Persisted API credentials use AES-256-GCM encryption. The master secret is separated from the stored credential record.

### 5.2 Credential Broker

The Agent, Core, Registry, jobs, ordinary results and audit records do not need access to the raw credential. Decryption occurs just-in-time inside the transport boundary needed to authenticate to the provider.

### 5.3 No normal reveal operation

The intended product does not include a normal `show saved key` function. Replacement uses rotation.

### 5.4 Secret-free audit

Store, rotate, use and delete events can be audited through hashes/chained records without storing the secret plaintext in the audit trail.

### 5.5 Precise claim

ARCA does not claim that an API credential literally never exists in process memory. A trusted component must present it to the provider when authenticating. The security objective is minimized exposure, encrypted persistence, no unrelated component access and no secret logging.

---

## 6. Network and execution security

- External-agent networking is disabled by default.
- Remote origins require allowlisting.
- Plain HTTP is restricted to loopback in the Agent Gateway client.
- Redirects are rejected by that client.
- Machine Bridge workers execute closed registered actions instead of arbitrary network-supplied shell text.
- Public-network PNCP actions are separated from offline/planning actions and require explicit capability/configuration gates.
- Evidence-bearing public acquisition should use persistent custody rather than ephemeral worker storage as its canonical record.

---

## 7. Evidence, custody and inference separation

ARCA treats acquisition and interpretation as different stages.

For controlled public-network acquisition:

```text
remote response
      ↓
exact bytes captured
      ↓
SHA-256 / custody / provenance
      ↓
parse / normalization
      ↓
analysis / hypothesis
```

This protects both evidentiary integrity and investigated persons: later claims can be traced back to the actual source instead of relying on model memory or reconstructed content.

---

## 8. Capability trust and privacy

The Capability Registry catalogs agents, workers, tools, connectors, models and services.

A participant may declare a capability, but cannot self-promote it to `verified`.

Capability Conformance Probes use synthetic, side-effect-free tests and do not persist raw participant output. Verification histories are hash-chained and avoid credential material.

Capability compatibility does not grant authorization.

---

## 9. Privacy Classification v1

ARCA now has an implemented backend classification layer.

Classes:

- `public`;
- `personal`;
- `sensitive`;
- `high-risk`;
- `restricted`;
- `redact-before-publication`.

The classifier uses explicit indicators rather than asking a model to make an opaque free-text privacy judgment.

Indicators include direct/financial identifiers, sensitive categories, children/adolescents, precise private location, private communications, credentials/secrets, adverse inference, source status, minimization possibility and dispute/outdated status.

Each classification has a SHA-256 `classificationHash` so post-classification mutation can be detected.

---

## 10. Publication Gate v1

A separate Publication Gate evaluates whether information may proceed to a future public export path.

Possible technical outcomes:

- `publish`;
- `publish-with-redaction`;
- `hold`;
- `reject`.

The gate checks explicit workflow assertions for:

- purpose;
- necessity;
- source verification;
- human review;
- required legal review;
- public-interest rationale for high-risk/sensitive material;
- redaction where minimization is possible.

### 10.1 High-risk rule

High-risk/sensitive material requires a public-interest rationale and human review before it can clear this technical gate.

### 10.2 Redaction rule

Where the same evidentiary purpose can be achieved with less personal detail, the gate can require explicit field-level redaction metadata.

Redaction affects the future public representation, not the original custodied evidence.

### 10.3 Secret/private communication rule

The v1 normal publication profile rejects credentials/secrets and private communications rather than silently attempting to publish them.

### 10.4 Disputed/outdated material

Material marked disputed or outdated is held for re-check rather than automatically published.

### 10.5 Tamper detection

The gate refuses a classification whose integrity hash no longer verifies. Each publication decision also carries its own `decisionHash` and a reference to the classification hash.

---

## 11. Human Review

Human review is not decorative.

Machine Bridge results marked review-required can enter a durable Human Review Queue and appear in the Workbench Inbox. Privacy/publication controls add another review boundary for sensitive or high-risk public exposure.

No single AI model is intended to have authority to both produce an adverse claim and publish it automatically.

---

## 12. Data lifecycle

### Collection

Collect only material tied to a declared investigative purpose and authorized/lawful source route.

### Acquisition

Preserve locator, retrieval context and integrity evidence; evidence-bearing network material should enter custody before interpretation.

### Processing

Keep raw source material distinct from normalized facts, analytical signals, hypotheses and conclusions.

### Classification

Classify privacy/publication risk before exposure.

### Review

Complete required human/legal review and resolve disputes where necessary.

### Publication

Expose only fields that pass the Publication Gate, applying required redactions.

### Retention/deletion

Retention remains deployment- and purpose-specific. A later retention engine should distinguish evidence retention from public-report suppression/redaction.

---

## 13. Transparency and correction

A mature public deployment should make it possible to understand why information appears in a report.

Recommended properties:

- factual assertions linked to provenance;
- source/retrieval dates when material;
- clear distinction between source fact and analysis;
- visible uncertainty/lacunas;
- corrections with version history rather than silent rewriting;
- channel for a described person/entity to flag errors or stale sources;
- challenged material can enter `hold/review` without automatically deleting valid evidence.

---

## 14. Deployment profiles

### Local/offline

- no ARCA account required;
- no central ARCA investigation database required;
- data remains local unless the user chooses external services;
- credentials stay in the user's host boundary.

### Self-hosted/team

The operator controls logs, backups, access policy, retention and host security. ARCA supplies secure primitives but cannot truthfully describe infrastructure it does not control.

### Public hosted service

A public host requires additional operational controls:

- real infrastructure data inventory;
- documented logging/retention;
- TLS and hardened key management;
- abuse controls with minimal profiling;
- incident-response procedure;
- correction/contact channel;
- accurate privacy/transparency notice;
- tested redaction/export path.

---

## 15. Current controls versus roadmap

### Implemented backend controls

- canonical Core authority boundary;
- Human Review Queue/Inbox;
- closed Machine Bridge Action Registry;
- capability verification separated from authorization;
- Credential Vault/Broker;
- secret-free credential audit;
- controlled external-agent networking;
- acquisition-before-inference/custody controls;
- privacy classification with integrity hash;
- publication decisions with integrity hash;
- high-risk public-interest/human-review gate;
- required legal-review hold;
- explicit redaction requirement;
- rejection of normal publication for secrets/private communications.

### Still recommended/not yet complete

- OS-backed master-key storage (Android Keystore, TPM, Secure Enclave or secret manager);
- ephemeral `use once / do not save` credentials;
- public exporter that actually applies redactions across document formats;
- automated privacy field discovery with conservative human verification;
- privacy-impact self-audit for hosted deployments;
- configurable retention ceilings;
- incident-response/breach runbook;
- subject dispute/correction workflow;
- privacy-preserving operational metrics if metrics are enabled;
- redaction manifest/export receipt;
- per-deployment legal-basis registry and RIPD/DPIA assistance.

Roadmap items must not be advertised as implemented until code/tests prove them.

---

## 16. Auditability hierarchy

ARCA prefers security/privacy claims backed by:

1. executable test;
2. code-enforced invariant;
3. schema/validation boundary;
4. auditable hash/record;
5. specification/documentation;
6. interface copy.

A sentence in the UI alone is not a security control.

---

## 17. Brazilian legal context

This white paper is a technical architecture statement, not legal advice.

Official references used for the current baseline:

- LGPD — Lei nº 13.709/2018 (texto compilado): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD — Perguntas Frequentes: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- ANPD — Aviso de Privacidade: https://www.gov.br/anpd/pt-br/acesso-a-informacao/aviso-de-privacidade
- Marco Civil da Internet — Lei nº 12.965/2014: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm

The final deployment must reassess requirements based on its operator, jurisdiction, infrastructure and actual data flows.

---

## 18. Public commitment

ARCA should prefer an architecture in which the operator holds less user data, the user surrenders less information and investigated persons are publicly exposed only to information that is relevant, sourced, reviewable and proportionate to the public-interest purpose.

The standard is not `trust ARCA`.

The intended standard is: **make ARCA's security, privacy and provenance claims inspectable enough that users and affected persons do not have to rely on blind trust.**
