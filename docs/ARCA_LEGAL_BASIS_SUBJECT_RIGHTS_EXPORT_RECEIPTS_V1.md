# ARCA Legal Basis Registry + Data Subject Requests + Export Receipts v1

**Status:** backend foundation  
**Date:** 17 September 2026  
**Scope:** privacy governance, investigated-person rights, publication control and redacted export audit

## 1. Purpose

This layer extends ARCA's Privacy Classification and Publication Gate with three auditable controls:

1. **Legal Basis Registry** — records the legal basis claimed for a processing activity and its human review state without pretending that ARCA has issued legal advice.
2. **Data Subject Request Registry** — records correction, dispute and other rights requests using minimal identifiers and a hash-chained event trail.
3. **Redaction Export Receipt** — proves which publication decision and artifact hashes were used and which fields were redacted, without retaining removed values.

The intended sequence is:

```text
processing activity
      ↓
claimed legal basis
      ↓
human/legal review where required
      ↓
Privacy Classification
      ↓
Publication Gate
      ↓
subject request hold, if active
      ↓
redaction/export
      ↓
Export Receipt
```

## 2. Legal Basis Registry

Format: `arca-legal-basis-record-v1`.

The registry deliberately describes a **claim plus review history**, not an automated legal conclusion.

Each record contains:

- `basisId`;
- `processingActivityId`;
- declared purpose;
- general-data basis code;
- separate sensitive-data basis code when applicable;
- legal reference supplied by the operator/reviewer;
- rationale and public-interest rationale;
- source references;
- status;
- reviewer and review timestamp;
- previous-record hash;
- current SHA-256 record hash.

Every record states:

```json
{
  "legalAdviceProvided": false,
  "automatedLegalConclusion": false
}
```

### 2.1 Status

- `draft` — registered but not accepted as the deployment's active basis;
- `active` — human review accepted the record;
- `rejected` — review did not accept the basis claim;
- `superseded` — replaced by a later basis/policy;
- `withdrawn` — intentionally retired.

The review history is hash-linked so later mutation can be detected.

### 2.2 Basis codes

The registry contains structured codes corresponding broadly to legal-basis families in the LGPD, such as consent, legal/regulatory obligation, public policy/public authority, exercise of rights, research, protection of life, health, legitimate interest and credit protection.

A code is a catalog label only. Selecting one does **not** establish that its legal requirements are satisfied in a concrete case.

Sensitive-data grounds are tracked separately because LGPD Article 11 has a distinct regime.

## 3. Data Subject Request Registry

Format: `arca-data-subject-request-v1`.

Supported request categories in v1:

- `correction`;
- `dispute`;
- `access`;
- `restriction`;
- `deletion`;
- `opposition`;
- `automated-decision-review`.

The registry uses an opaque `subjectRef` instead of requiring a person's name/CPF in the workflow record. A deployment may use a separate secure identity-verification mechanism, but the v1 registry explicitly reports:

```json
{
  "rawIdentityDocumentStored": false,
  "publicDisclosureAllowed": false
}
```

### 3.1 Request lifecycle

```text
open
 ↓
reviewing
 ↓
resolved | rejected | withdrawn
```

Events are hash chained. Resolution does not erase the original request or its audit history.

### 3.2 Publication hold

An active correction/dispute/restriction/deletion/opposition/automated-decision-review request associated with a record can produce an `active-data-subject-request` hold in the Publication Gate.

This is intentionally cautious: opening a request does not prove the requester is correct, but it prevents the system from silently making a new public release while the challenged item is under review.

Resolving the request removes that automatic hold; a new publication decision is still required.

## 4. Correction is not evidence destruction

ARCA separates:

- original source evidence and custody;
- normalized/investigative representations;
- public-report representations.

If a public report contains an incorrect or stale field, correcting the report should not silently rewrite or destroy the historical source acquisition. The correction trail should make clear:

- what was challenged;
- what source was re-checked;
- what outcome was reached;
- which later representation replaced the earlier one.

This supports both data-subject rights and evidentiary integrity.

## 5. Redaction Export Receipt

Format: `arca-redaction-export-receipt-v1`.

A receipt can be created only from a valid Publication Gate decision whose action is:

- `publish`; or
- `publish-with-redaction`.

`hold` and `reject` decisions cannot produce an export receipt.

For redacted publication, every redaction required by the Publication Gate must appear in the applied-redaction list.

The receipt includes:

- export ID;
- publication ID;
- Publication Gate decision hash;
- privacy-classification hash;
- SHA-256 of the input artifact;
- SHA-256 of the output artifact;
- field paths that were redacted;
- redaction reasons/replacements;
- exporter identifier;
- timestamp;
- receipt hash.

## 6. Why removed values are not hashed

The receipt intentionally states:

```json
{
  "removedValuesStored": false,
  "removedValueHashesStored": false
}
```

A hash of a low-entropy removed value (for example a known identifier drawn from a small candidate set) can sometimes be guessed by hashing candidates and comparing them. Therefore ARCA's receipt proves the artifact transition and redaction metadata without creating a secondary fingerprint of the removed personal value.

The original custodied artifact may retain its own artifact-level SHA-256; that is different from hashing each removed field value.

## 7. Publication Gate integration

Publication Decision v1 now records `activeSubjectRequest`.

When true, the gate returns `hold` with reason:

```text
active-data-subject-request
```

This does not mean every request must ultimately be granted. It means the public-release pipeline must stop long enough for the challenged data to be reviewed.

## 8. Legal design boundary

ARCA may help operators organize facts required for compliance, but it must not silently decide that a legal basis, exception or refusal is correct.

The Legal Basis Registry therefore supports audit and review rather than automated legal certification.

Similarly, a data-subject request can end in outcomes such as correction, partial correction, no change, restriction, deletion, retention with reason or rejection. The outcome must be attributable to a human/deployment process.

## 9. Current Brazilian context

Official references consulted for this v1:

- LGPD — Lei nº 13.709/2018, especially arts. 7, 11, 18, 19 and 20: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD — Titular de Dados: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados
- ANPD — Perguntas Frequentes: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- ANPD — Fluxo da petição do titular: https://www.gov.br/anpd/pt-br/fluxo-da-peticao-do-titular
- ANPD — Denúncia / Petição de Titular referente à LGPD: https://www.gov.br/anpd/pt-br/canais_atendimento/cidadao-titular-de-dados/denuncia-peticao-de-titular-referente-lgpd

The ANPD's 2025–2026 regulatory agenda lists regulation of data-subject rights as work still in progress in its status updated 16 July 2026. Deployments should therefore avoid hard-coding assumptions about every future procedural deadline and should re-check current regulation before public launch.

## 10. Security/privacy properties

The v1 implementation is designed so that:

- a legal-basis label cannot masquerade as automated legal advice;
- legal-basis revisions are tamper evident;
- subject-rights records use opaque references instead of requiring public identifiers;
- raw identity documents are not stored by this registry;
- subject requests are not public-report content;
- active challenges stop new publication through the normal gate;
- export receipts do not contain removed personal values;
- export receipts do not contain per-value hashes of removed personal data;
- held/rejected decisions cannot be converted into valid export receipts;
- publication/correction history is additive rather than silently rewritten.

## 11. Not yet implemented

This backend foundation does not yet provide:

- a public-facing subject-rights portal;
- identity-verification UI/service;
- automatic email/contact handling;
- automatic legal-basis selection;
- automatic decision on whether a data-subject request must legally be granted;
- document-format redaction engine;
- retention/deletion scheduler;
- deployment-specific deadlines or controller/operator assignments;
- RIPD/DPIA generator.

Those should remain distinct, reviewable layers.
