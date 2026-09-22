# M4 Preflight and Custody Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a fail-closed, offline-verifiable M4 scope manifest and extend the encrypted durable custody receipt for a future Portal payment probe, without enabling live Portal transport.

**Architecture:** A pure manifest module validates exact one-source scope, budgets and authorization before a future network client can be built. The existing encrypted GitHub private custody backend admits a second *explicit* proof schema while preserving old PNCP receipt bytes and hashes. No workflow, transport or real source GET is introduced in this plan because the full Swagger contract and concrete document have not been validated.

**Tech Stack:** Node.js >=22.18, `node:test`, ESM, existing SHA-256 and private custody modules.

**Spec:** `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` (the preflight/custody subset; Portal HTTP and workflow remain later tasks after official contract verification).

## Global Constraints

- No default UF, municipality, document code or secret.
- One source and one page per scope; no retry, publication, correlation or classifier.
- No live network call from the new module.
- Existing PNCP durable receipts and M0–M3 outputs must remain unchanged.
- Every material step updates CURRENT, a numbered checkpoint and roadmap, with CI on Node 22.18.

## Review Focus

1. Forged source or endpoint: reject before generating a manifest.
2. Invalid/oversized budgets: reject, including negative, fractional and missing values.
3. Token in manifest: reject unexpected keys; never include credentials in output or digest.
4. Portal proof accepted without safety fields: reject at custody receipt validation.
5. Existing PNCP receipt digests: preserve exact old semantics and prove by a deterministic regression test.

---

### Task 1: Pure M4 scope manifest

**Files:** Create `src/investigation/m4-controlled-scope.mjs`, `tests/m4-controlled-scope.test.mjs`.

**Interfaces:** Export `buildM4ControlledScope({source,confirmation,revision,uf,date,modalityId,documentCode,maxBytes,timeoutMs})`. It returns a frozen object with `schema`, one `source`, `scope`, `budgets`, `networkAuthorizedForThisManifest:false`, `publicationAttempted:false` and `scopeSha256`. For PNCP, require exactly `PNCP_PUBLIC_GET_ONLY`, explicit UF/date/modality and fixed budgets. For Portal, require exactly `PORTAL_DOCUMENT_GET_ONLY`, a bounded alphanumeric document code and fixed phase/page without asserting the unverified API response schema. Reject unexpected keys.

- [x] Write a test for valid PNCP/Portal manifests, absent confirmation, extra credential, bad UF and budget; run `node --test tests/m4-controlled-scope.test.mjs` and observe failure because module is absent.
- [x] Implement strict schema validation and hashing using `createHash`, rejecting any input not explicitly accepted.
- [x] Run focused tests and verify 0 failures; commit scope module and tests.

### Task 2: Extend durable receipt to one named Portal proof

**Files:** Modify `src/machine-bridge/durable-private-custody.mjs`, `tests/durable-private-custody.test.mjs`.

**Interfaces:** Accept `arca.portal-controlled-live-probe.v0.1` in `buildDurableCustodyReceipt` only with all existing safety and envelope bindings; include `proofSchema` for Portal receipt while PNCP receipt shape stays byte-for-byte unchanged. Do not create a Portal proof producer or permit network in this task.

- [x] Add tests first: Portal proof accepted with `proofSchema`; missing safety fields rejected; PNCP receipt matches a hash captured from the baseline run. Run test and confirm the Portal case fails for the absent schema support.
- [x] Implement minimal allowlist and source-specific receipt property; retain all checks for resultHash, encryption and scope binding.
- [x] Run focused tests, `npm run validate:multisource-correlated`, `npm run check:public`; commit.

### Task 3: Document handoff and CI

**Files:** Add `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_010.md`, update `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`, `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`, CI workflow only if focused tests are not covered by `npm test`.

- [ ] Record exact implemented subset, test evidence, blocked items and next official-contract step; do not mark M4 live complete.
- [ ] Run `npm test` on Node 22.18 CI, Python suite, M0–M3 validators and `check:public`; report any local Node 24 discrepancy separately.
- [ ] Open PR, wait for CI green, merge; verify post-merge CI; close checkpoint with actual run IDs if needed.

## Deferred, explicitly outside this plan

Verify official Swagger path/parameters/response with a trusted source, add a bounded Portal HTTP GET with fake transport tests, integrate capture→seal→persist and manual workflow, obtain a concrete code/token in private channels and explicit authorization for a single live call. These belong to the next implementation plan after the contract is verified; no live request is authorized here.
