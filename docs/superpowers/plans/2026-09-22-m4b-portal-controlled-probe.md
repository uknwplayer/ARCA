# M4b Portal Controlled Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a one-request, offline-tested Portal capture that durably encrypts raw bytes before issuing a sanitized receipt, while leaving actual live execution gated on a future concrete authorization.

**Architecture:** The transport accepts only a frozen M4a Portal scope and private document/token inputs; its only endpoint is the official `empenhos-impactados` GET with `codigoDocumento`, `fase=3`, `pagina=1` and header `chave-api-dados`. A runner performs private-vault preflight, captures bounded bytes, seals the temporary directory and persists the receipt; a manually dispatched workflow remains unavailable until a separately reviewed, concrete live scope is authorized. No financial parser is introduced.

**Tech Stack:** Node.js >=22.18, ESM, `node:test`, Fetch streams, existing AES-256-GCM envelope and GitHub private custody backend.

**Spec:** `docs/superpowers/specs/2026-09-22-m4b-portal-contract-design.md` and approved M4 design `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md`.

## Global Constraints

- One explicitly selected document, page 1, phase 3 (payment), GET, zero retry, 30-second maximum timeout and 64 KiB maximum response.
- No real GET in development, tests or CI. Do not deploy or dispatch live workflow as a consequence of this plan.
- Token stays private in `chave-api-dados`; never in URL, logs, public artifacts or caught errors.
- Preflight a private durable vault and a 24-character-minimum passphrase **before** any source GET.
- Capture bytes before interpreting; no M1 CSV parser, investigation ingress, correlation, classifier or publication.
- PNCP remains nationally scoped, no default municipality/UF; Edge Steward PR #78 remains frozen.
- `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`, numbered checkpoint and detailed roadmap change with code and CI.

## Review Focus

1. Wrong/forked host, redirect or extra query key: fail before a second request and avoid leaking token to another origin.
2. Streaming response without Content-Length exceeding 64 KiB: cancel and fail without storing truncated success.
3. Invalid Content-Length or 200 with unexpected media type: reject; distinguish 400/401/429/500 without logging body.
4. Vault preflight or persist failure: fail closed; no success receipt and no analysis/publication.
5. Repeated workflow invocation: exact same scope must bind receipt and vault content, with zero implicit retries and no raw data in public outputs.

---

### Task 1: Strict offline Portal transport

**Files:** Create `src/investigation/portal-controlled-transport.mjs`, `tests/portal-controlled-transport.test.mjs`.

**Interface:** `capturePortalPayment({manifest,documentCode,token,fetchImpl,timeoutMs}) -> Promise<{status,body:Buffer,bodyHash,contentType}>`. `manifest` comes from `buildM4ControlledScope` and must say `PORTAL`, `phase:"PAYMENT"`, `page:1`, `networkAuthorizedForThisManifest:false`, `publicationAttempted:false`, and match SHA-256 of `documentCode`. Only the separate runner's explicit authorization gate permits calling this transport; the transport never decides that flag alone.

- [ ] RED: create a valid manifest using `buildM4ControlledScope({source:"PORTAL",confirmation:"PORTAL_DOCUMENT_GET_ONLY",revision:"a".repeat(40),documentCode:"SYNTHETIC-001",maxBytes:65536,timeoutMs:30000})`. Call `capturePortalPayment` with injected fake fetch and assert one GET to `https://api.portaldatransparencia.gov.br/api-de-dados/despesas/empenhos-impactados?codigoDocumento=SYNTHETIC-001&fase=3&pagina=1`, `chave-api-dados` header, `redirect:"error"`, no token in URL, `bodyHash` SHA-256 of exact bytes. Run `node --test tests/portal-controlled-transport.test.mjs`; expected fail (module absent).
- [ ] GREEN: implement exact manifest/hash validation, token validation before fetch, URL construction with fixed `URL`/`searchParams`, AbortController 30-second maximum, `redirect:"error"`, no dynamic host/path. Read `response.body` via reader into bounded chunks; reject `content-length` invalid/overbudget, cumulative bytes > manifest.budgets.maxBytes, non-JSON media type on 200, redirects, 400/401/429/500 and all non-200 status with constant error codes; never include response text or token in errors. Return raw bytes plus hash; never parse financial fields. Run focused test; expected pass.
- [ ] RED→GREEN for adversarial cases: missing token, wrong document hash, wrong source/phase/page/budget, network flag altered, oversized stream without length, invalid/oversized Content-Length, redirect, status 400/401/429/500, timeout and network exception; assert zero or one fetch as applicable and no token in error. Run focused test; expected 0 failures. Run `npm test` and `npm run check:public`; report every failure separately.
- [ ] Commit transport and tests.

### Task 2: Durable runner with fake source and vault

**Files:** Create `src/investigation/portal-controlled-runner.mjs`, `tests/portal-controlled-runner.test.mjs`; reuse `sealCustodyDirectory` and `createGitHubPrivateCustodyBackend` without changing PNCP receipt shape.

**Interface:** `runPortalControlledProbe({manifest,documentCode,token,passphrase,repository,revision,confirmation,vault,fetchImpl,clock}) -> Promise<{receiptHash,envelopeHash,resultHash,status:"STORED_PRIVATE"}>`. Require `confirmation === "PORTAL_DOCUMENT_GET_ONLY"`, exact manifest revision, strong passphrase, `vault.preflight()` reporting `{ready:true,private:true}`, and `vault.persist({envelope,proof})`. The runner must accept only manifests whose SHA-256 matches its exact canonical body, not just field values; call the transport only after preflight.

- [ ] RED: with fake fetch and fake private vault, assert order `preflight → source GET → persist`, decrypt the envelope via `openCustodyEnvelope` and assert captured exact raw bytes in a private file, URL/document only within encryption, and sanitized return with no token/document/raw payload. Run `node --test tests/portal-controlled-runner.test.mjs`; expected fail (module absent).
- [ ] GREEN: create private temporary root (0700) and `response.bin` (0600) plus scope metadata in that root; seal with `sealCustodyDirectory({root,passphrase,repository,revision,scopeHash:manifest.scopeSha256})`; construct `proof` schema `arca.portal-controlled-live-probe.v0.1` with `status:"CAPTURED_AND_SEALED"`, `networkUsed:true`, `custody.encrypted:true`, `plaintextPublished:false`, envelope hash/content/payload/file bindings, `humanReviewRequired:true`, `anomalyIsNotIrregularity:true`, `classifierEmittedSignals:false`, `investigationIngressUsed:false`, `automaticAdversePublication:false`; persist and accept only `STORED` or `ALREADY_STORED` with matching receipt hash. Always remove temporary root in `finally`. Return only hashes/status. Run focused test; expected pass.
- [ ] RED→GREEN: preflight false, missing token/passphrase, manifest mutation/hash mismatch, fetch failure, persist rejection, vault returning incomplete receipt and plaintext cleanup. Assert no GET on failed preflight, no success on failed persist, no raw data in public output/errors, and PNCP receipt regression. Run focused tests, `npm test`, M0–M3 validators, `npm run check:public`; expected all gates green on Node 22.18 CI.
- [ ] Commit runner and tests.

### Task 3: Manual workflow, handoff and CI

**Files:** Create `.github/workflows/arca-portal-controlled-live-probe.yml` and `scripts/arca-portal-controlled-live-probe.mjs`; create next numbered checkpoint; update CURRENT and `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`.

**Interface:** Manual `workflow_dispatch` inputs `confirmation`, `document_code`, `manifest_sha256` (hash of the prepared scope); secrets `ARCA_PORTAL_API_TOKEN`, `ARCA_PORTAL_CUSTODY_PASSPHRASE`, `ARCA_CUSTODY_VAULT_REPOSITORY`, `ARCA_CUSTODY_VAULT_TOKEN`. The runner recomputes the manifest from exact input and `GITHUB_SHA`, compares hash, validates the vault and only then could access source. **Keep the workflow dispatch path explicitly disabled** until a separate live-authorization gate can bind an approved concrete manifest to the workflow inputs; do not add a user-triggerable path that could emit a GET merely by typing the confirmation.

- [ ] RED: add a test for the CLI/workflow boundary verifying that workflow_dispatch cannot reach `runPortalControlledProbe` without an independently approved manifest binding; exercise preflight with synthetic inputs and assert zero source calls. Run focused test; expected fail before guard exists.
- [ ] GREEN: add CLI mode that validates inputs and produces sanitized preflight report only; keep source call behind separate gate with no live-enabling value configured in the checked-in workflow. No `schedule`, `push` or `pull_request` trigger. Secrets are env-only; never echo them or upload plaintext. Run focused test and `npm run check:public`; expected pass.
- [ ] Run full Node 22.18 CI (`npm test`), Executor Mesh Python tests, investigative roadmap validator, `npm run validate:multisource`, `npm run validate:financial-correlation`, `npm run validate:multisource-correlated`, `npm run check:public` and `git diff --check`. Document precise SHA, PR and CI in CURRENT, numbered checkpoint and roadmap. Open PR, wait green, integrate and verify post-merge CI. Actual GET remains a separate explicitly authorized task.

## Deferred live execution

Choose a real document and custody destination privately, review code/CI and the exact manifest, obtain a specific authorization for one GET, then add or unlock a separate workflow approval gate. A successful offline plan does not imply permission to run live, and a 200 response does not imply an adverse conclusion.
