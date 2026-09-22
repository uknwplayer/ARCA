# ARCA M4b Portal Related Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline-tested, one-request Portal related-documents capture path that seals original response bytes and stores encrypted evidence in private durable custody, without executing a live request during implementation or CI.

**Architecture:** Keep the existing M4a v0.1 scope builder and proof behavior stable. Add v0.2 scope and Portal transport contracts, then compose them in a capture runner that preflights private custody, bounds and seals original bytes, validates only from the reopened envelope, and emits a sanitized proof. Add a manually dispatchable workflow with private credentials and explicit confirmation, but do not run it as part of implementation.

**Tech Stack:** Node.js 22.18 ESM, `node:test`, built-in `fetch`/Web Streams/AbortController, existing AES-256-GCM custody envelope and GitHub private-custody backend, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-22-m4b-portal-related-documents-design.md`

## Global Constraints

- Official operation is `GET https://api.portaldatransparencia.gov.br/api-de-dados/despesas/documentos-relacionados` with `codigoDocumento` and `fase=3`.
- Send the API key only in the `chave-api-dados` header; never place the token or raw document code in logs, proof, artifacts, or workflow inputs.
- Portal request budget is exactly `maxRequests: 1`, `maxRecords: 25`, `maxBytes: 65536`, `timeoutMs: 30000`, and `retries: 0`.
- Use `redirect: "error"`; accept no alternate host, path, caller-selected phase, pagination, extra query parameter, retry, classification, ingress, correlation, or publication.
- Encrypt and durably verify the original bytes before success; parse only from the locally reopened encrypted envelope; remove plaintext staging on every exit path.
- CI and tests use only synthetic identifiers, fake fetch, temporary directories, and fake custody responses; they never call the Portal.
- Preserve readable M4a v0.1 manifests, PNCP behavior, and existing durable receipt semantics; new Portal scopes use `arca.m4-controlled-scope.v0.2`.
- No live workflow dispatch or Portal data GET is authorized by this plan, its implementation, a PR, merge, or workflow availability.

## Review Focus

1. **Exactly 65,536 bytes vs. 65,537 bytes:** the first may proceed to validation; the second must abort during streaming and never be accepted as complete. Pin in Task 2.
2. **DTO optionality and drift:** OpenAPI does not declare a stable required-field/nullability set; permit omitted known properties, reject unknown properties and present non-string values. Pin in Task 4.
3. **Invalid UTF-8 and malformed JSON after capture:** preserve only the sealed original and a failed validation status, never an empty/valid result. Pin in Task 4.
4. **Secrets and identifiers in diagnostics:** token and raw code must not appear in thrown errors, logs, summaries, proof, or artifact names. Pin in Tasks 2, 4, and 5.
5. **Partial or repeated custody writes:** never report success until durable receipt verification passes; repeated content-addressed storage remains idempotent. Pin in Task 3 and Task 4.

---

### Task 1: Add the v0.2 scope without changing v0.1

**Files:**
- Modify: `src/investigation/m4-controlled-scope.mjs`
- Modify: `tests/m4-controlled-scope.test.mjs`

**Interfaces:**
- Preserve `buildM4ControlledScope(input)` and `M4_CONTROLLED_SCOPE_SCHEMA` as the current v0.1 contract.
- Add `M4_CONTROLLED_SCOPE_V02_SCHEMA = "arca.m4-controlled-scope.v0.2"` and `buildM4ControlledScopeV02(input)`.
- `buildM4ControlledScopeV02` accepts the same strict source inputs as v0.1. For PNCP it preserves the existing scope and budget values; for Portal it returns `scope: {endpointId: "PORTAL_EXPENSE_RELATED_DOCUMENTS", phaseCode: 3, documentCodeSha256}` with no raw code or `page` field, and the fixed Portal budgets from Global Constraints. Neither function accepts credentials or network authorization.

- [ ] **Step 1: Add failing compatibility and v0.2 tests.** Keep existing v0.1 assertions; add a digest fixture for the legacy PNCP result and these Portal assertions:

```js
const v02 = buildM4ControlledScopeV02(portal());
assert.equal(v02.schema, "arca.m4-controlled-scope.v0.2");
assert.deepEqual(v02.scope, {
  endpointId: "PORTAL_EXPENSE_RELATED_DOCUMENTS",
  phaseCode: 3,
  documentCodeSha256: createHash("sha256").update(portal().documentCode).digest("hex")
});
assert.deepEqual(v02.budgets, {
  maxRequests: 1, maxRecords: 25, maxBytes: 65536, timeoutMs: 30000, retries: 0
});
assert.equal(JSON.stringify(v02).includes(portal().documentCode), false);
```

- [ ] **Step 2: Run the focused test and verify it fails only because the v0.2 export is absent.**

Run: `node --test tests/m4-controlled-scope.test.mjs`

Expected: the new v0.2 import/test fails; all current v0.1 behavior remains represented by passing legacy cases.

- [ ] **Step 3: Implement the separate v0.2 builder.** Reuse exact-key, revision, confirmation, document-code and hashing helpers where semantics match. Add a conservative bounded document-code check without claiming an undocumented regex. Keep the v0.1 builder output bytes and hash unchanged.

- [ ] **Step 4: Run focused scope tests and verify both versions.**

Run: `node --test tests/m4-controlled-scope.test.mjs`

Expected: v0.1 regression fixture and all v0.2 Portal/PNCP tests pass; malformed code, extra keys, token fields, invalid revision, wrong confirmation, and nondeterministic serialization are rejected or pinned.

- [ ] **Step 5: Commit the scope versioning change.**

```bash
git add src/investigation/m4-controlled-scope.mjs tests/m4-controlled-scope.test.mjs
git commit -m "feat: add M4 scope v0.2 for Portal documents"
```

### Task 2: Implement bounded Portal transport

**Files:**
- Create: `src/investigation/portal-related-documents-transport.mjs`
- Create: `tests/portal-related-documents-transport.test.mjs`

**Interfaces:**
- Export `createPortalRelatedDocumentsTransport({fetchImpl, apiKey, timeoutMs = 30000, maxBytes = 65536})`.
- The returned `fetchRelatedDocuments({documentCode})` makes at most one request and returns `{status, contentType, bodyBytes, responseBytesSha256}` only for an HTTP-success response. It returns raw bytes, not parsed records; orchestration seals them before parsing.
- Reject invalid options before fetch. Fixed origin/path/query and API header are module-owned, not caller-controlled.

- [ ] **Step 1: Write fake-fetch contract tests.** Assert exact HTTPS origin/path, only `codigoDocumento` and `fase=3`, method `GET`, header `chave-api-dados`, `redirect: "error"`, and that the token/code do not appear in errors or diagnostics. Also test missing token, changed host/path attempts, HTTP errors, and rejected redirects.

- [ ] **Step 2: Add a streaming byte-bound test.** Fake a `ReadableStream` and assert exactly 65,536 bytes are returned, while byte 65,537 aborts/cancels the reader and rejects with a fixed error code without calling `.text()` or `.json()`.

- [ ] **Step 3: Run transport tests and verify the new module is absent.**

Run: `node --test tests/portal-related-documents-transport.test.mjs`

Expected: tests fail because the transport export/file does not exist.

- [ ] **Step 4: Implement single-origin streaming transport.** Construct the URL from the fixed host/path and the two allowed query parameters; set the API key only in `chave-api-dados`; use one abort controller, timeout no greater than 30,000 ms, `redirect: "error"`, and no retry. Read chunks incrementally, cancel and reject on overflow, hash bytes as captured, and return raw bytes without parsing or logging the URL.

- [ ] **Step 5: Run transport tests.**

Run: `node --test tests/portal-related-documents-transport.test.mjs`

Expected: exact request contract, byte boundary, timeout, cancellation, status handling, and secret-redaction cases pass using fake fetch only.

- [ ] **Step 6: Commit the transport and tests.**

```bash
git add src/investigation/portal-related-documents-transport.mjs tests/portal-related-documents-transport.test.mjs
git commit -m "feat: add bounded Portal related-documents transport"
```

### Task 3: Extend durable custody for the M4b proof schema

**Files:**
- Modify: `src/machine-bridge/durable-private-custody.mjs`
- Modify: `tests/durable-private-custody.test.mjs`

**Interfaces:**
- Add an allowlisted M4b proof schema `arca.portal-related-documents-controlled-probe.v0.2` while retaining existing PNCP and Portal v0.1 validation paths unchanged.
- M4b proof separates `probeStatus` (`CAPTURING`, `SUCCEEDED`, or `FAILED`), `captureStatus` (`CAPTURED_AND_SEALED`), and `validationStatus` (`PENDING`, `VALIDATED`, or `FAILED`). Persist an initial sanitized capture proof with `PENDING` before parsing; after validation, persist a second immutable sanitized status proof bound to the same envelope. A failed validation remains failed evidence, never a valid Portal result.
- Extend `createGitHubPrivateCustodyBackend({repository, branch, token, fetchImpl})` so `persist({envelope, proof})` stores the Portal-v0.2 initial capture proof atomically with its encrypted envelope and receipt. Add `persistStatusProof({envelope, proof}) -> {status, proofHash, vaultCommitSha}` for the final validation status. Store Portal-v0.2 proofs under content-addressed paths so pending and final states do not overwrite each other or alter legacy receipt paths.

- [ ] **Step 1: Add failing receipt tests for v0.2 pending, success, and failed validation.** Require the same envelope bindings, private custody, human-review and no-classifier/no-ingress/no-publication fields. Assert `proofSchema` records v0.2, the final proof binds to the same envelope hash, and malformed response status stays failed. Keep PNCP and Portal v0.1 expected receipt JSON/hash fixtures unchanged.

- [ ] **Step 2: Run focused custody tests and verify the v0.2 proof is rejected.**

Run: `node --test tests/durable-private-custody.test.mjs`

Expected: the new v0.2 cases fail at the proof-schema allowlist; legacy cases pass.

- [ ] **Step 3: Add only the v0.2 proof allowlist, status-proof persistence, and validation rules.** Preserve old schema-specific predicates, receipt shape, and paths. For v0.2 require `networkUsed: true`, encrypted envelope, `plaintextPublished: false`, `captureStatus: "CAPTURED_AND_SEALED"`, safe validation/probe enums, human review true, anomaly-not-irregularity true, and classifier/ingress/adverse-publication false. Store the initial capture proof in the same Git commit as the envelope and receipt, with its SHA-256 recorded in the v0.2 receipt. Add an append-only content-addressed validation-proof write that verifies the target remains private and verifies the stored blob hash; never overwrite pending evidence.

- [ ] **Step 4: Run focused custody tests including idempotence, status transitions, and legacy hashes.**

Run: `node --test tests/durable-private-custody.test.mjs`

Expected: new valid and failed-validation receipts pass; safety violations fail; deterministic legacy hashes remain identical.

- [ ] **Step 5: Commit the custody compatibility change.**

```bash
git add src/machine-bridge/durable-private-custody.mjs tests/durable-private-custody.test.mjs
git commit -m "feat: bind M4b Portal proofs to durable custody"
```

### Task 4: Compose capture, seal, validation, and sanitized proof

**Files:**
- Create: `scripts/arca-portal-related-documents-live-probe.mjs`
- Create: `tests/portal-controlled-live-probe.test.mjs`
- Use: `src/machine-bridge/encrypted-custody-envelope.mjs` exports `sealCustodyDirectory` and `openCustodyEnvelope`; reuse them without changing the envelope format.

**Interfaces:**
- Export `runPortalRelatedDocumentsProbe({env, fetchImpl, durableCustodyBackend, outputDir})` for fake-fetch tests and CLI use.
- Consume `durableCustodyBackend.persistStatusProof({envelope, proof})` after parsing; it writes the final `VALIDATED` or `FAILED` status proof append-only and returns a hash and verified vault commit reference.
- Validate confirmation, v0.2 scope, exact revision, private credentials, byte/record budgets, and `durableCustodyBackend.preflight()` before invoking Portal transport.
- On capture: stage only original response bytes with mode `0600`; seal them with `sealCustodyDirectory`; persist envelope plus sanitized proof; require `STORED` or `ALREADY_STORED` and a verified receipt; reopen the local envelope with `openCustodyEnvelope`; then decode UTF-8, parse JSON, and validate the DTO shape from those reopened bytes.
- The M4b proof contains hashes, byte count, HTTP status class, contract identifier, bounded record count only when validated, custody receipt hash, and safety flags. It contains no raw code, names, body, token, or full URL.

- [ ] **Step 1: Add failing orchestration tests for zero-request preflight failures.** Inject fetch and custody spies; assert fetch is never called when confirmation, token, passphrase, scope, repository configuration, or private-custody preflight is invalid.

- [ ] **Step 2: Add failing byte-integrity and DTO tests.** Seal synthetic bytes and verify the reopened payload exactly matches them before parse. Allow omitted declared DTO properties; reject non-object records, unknown keys, present non-string values, non-array bodies, more than 25 records, invalid UTF-8, and malformed JSON. Assert each rejection emits a distinct sanitized failure class for HTTP 400/401/429/5xx, timeout, byte overflow, invalid content type, UTF-8/JSON failure, DTO drift, and custody failure.

- [ ] **Step 3: Add failing custody and secret-boundary tests.** Simulate seal failure, initial persist failure, bad receipt, post-write verification failure, and final status-proof persist failure. Assert no success proof is emitted, plaintext staging is removed in `finally`, and neither token nor raw code occurs in captured logs/errors/proofs/artifact filenames. Require the persisted initial proof to be `probeStatus: "CAPTURING"` and `validationStatus: "PENDING"`; after JSON/schema failure, require the appended final proof to be `captureStatus: "CAPTURED_AND_SEALED"`, `probeStatus: "FAILED"`, and `validationStatus: "FAILED"`.

- [ ] **Step 4: Run the new test file to confirm the runner is absent.**

Run: `node --test tests/portal-controlled-live-probe.test.mjs`

Expected: tests fail because the runner export/file does not exist.

- [ ] **Step 5: Implement the runner as a strict state sequence.** Preflight all configuration and private-vault state; issue one GET; stage/hash/seal; persist the sanitized `PENDING` capture proof and encrypted envelope; verify the receipt; reopen local sealed bytes; only then decode and validate; append a content-addressed final validation proof and verify it before emitting success. Use an outer `try/finally` for temporary root cleanup and fixed failure codes for every operational outcome. Never instantiate a classifier, ingress, correlation, or publisher.

- [ ] **Step 6: Run orchestration, transport, scope, and custody tests together.**

Run: `node --test tests/m4-controlled-scope.test.mjs tests/portal-related-documents-transport.test.mjs tests/portal-controlled-live-probe.test.mjs tests/durable-private-custody.test.mjs`

Expected: all synthetic success/failure cases pass; no test makes a real network request.

- [ ] **Step 7: Commit the capture runner and tests.**

```bash
git add scripts/arca-portal-related-documents-live-probe.mjs tests/portal-controlled-live-probe.test.mjs
git commit -m "feat: capture and seal Portal related documents"
```

### Task 5: Add a manual-only workflow that is not run

**Files:**
- Create: `.github/workflows/arca-portal-related-documents-live-probe.yml`
- Create: `tests/portal-manual-workflow.test.mjs`

**Interfaces:**
- Workflow trigger is `workflow_dispatch` only, with a required exact confirmation and reviewed scope hash as visible inputs. Do not expose the document code or credentials as inputs.
- Read document code, Portal API key, custody passphrase, private vault repository, and vault token only from configured GitHub secrets; pass secrets through step environment, never command-line arguments.
- Check out the dispatch's exact reviewed revision, run offline preflight and private-vault preflight before the capture step, upload only encrypted envelope and sanitized proof with bounded retention, and use a run-ID-only artifact name.

- [ ] **Step 1: Write workflow guardrail tests.** Read the YAML as text and assert it declares only `workflow_dispatch`, has no schedule/push/pull-request/repository-dispatch triggers, does not interpolate the document code in inputs/run-name/artifact name/summary, uses secret environment variables, checks out without persisted credentials, and uploads only the two approved files.

- [ ] **Step 2: Run the workflow test and verify it fails because the workflow is absent.**

Run: `node --test tests/portal-manual-workflow.test.mjs`

Expected: it fails on the missing workflow file.

- [ ] **Step 3: Create the manual-only workflow with safe ordering.** Install Node 22.18, run `npm ci`, validate exact confirmation/scope hash and all secret presence, preflight private custody, then invoke the runner. Keep `workflow_dispatch` the sole trigger, permissions read-only except narrowly scoped custody handled by its configured token, no live job in CI, and no automatic rerun/retry.

- [ ] **Step 4: Run workflow guardrail and full offline tests.**

Run: `node --test tests/portal-manual-workflow.test.mjs && npm test`

Expected: workflow guardrails and unit suite pass without dispatching the workflow or contacting Portal.

- [ ] **Step 5: Commit the workflow and guardrail tests.**

```bash
git add .github/workflows/arca-portal-related-documents-live-probe.yml tests/portal-manual-workflow.test.mjs
git commit -m "ci: add manually dispatched Portal capture workflow"
```

### Task 6: Update project handoff, roadmap, and offline acceptance

**Files:**
- Create: `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_013.md`
- Modify: `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md`
- Modify: `docs/ARCA_ROADMAP_DETALHADO_CURRENT.md`
- Modify: `.github/workflows/arca-ci.yml` only if its existing `npm test` and repository gates do not cover the new tests.

**Interfaces:**
- Checkpoint records M4b implementation state, exact test/validator outcomes, branch/commit/PR identifiers only when they exist, and the continuing no-live-request gate.
- Roadmap/current checkpoint point to the new immutable checkpoint and preserve live authorization as a distinct later gate.

- [ ] **Step 1: Add checkpoint and roadmap updates after implementation tests pass.** Record exact official endpoint contract, synthetic-only testing, v0.1 compatibility, failure limitations, no workflow dispatch, and the remaining separate Creator authorization requirement.

- [ ] **Step 2: Run every required offline gate.**

Run: `npm test && PYTHONPATH=. python -m unittest discover -s tests/executor_mesh -v && PYTHONPATH=. python scripts/validate-investigative-roadmap.py && npm run validate:multisource && npm run validate:financial-correlation && npm run validate:multisource-correlated && npm run check:public && git diff --check`

Expected: all gates pass under Node 22.18. If local Node 24 reproduces the documented `creator-passkey-console.test.mjs` `UND_ERR_SOCKET`, record it as an environment discrepancy and require canonical Node 22.18 CI before calling the implementation verified.

- [ ] **Step 3: Review the final diff against the approved spec.** Confirm the only additions are the v0.2 scope, bounded transport, custody integration, synthetic tests, unexecuted manual workflow, and handoff documentation; confirm no token, real document code, live request, workflow run, merge, or public plaintext artifact was introduced.

- [ ] **Step 4: Commit the checkpoint and roadmap handoff.**

```bash
git add docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_013.md docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_CURRENT.md docs/ARCA_ROADMAP_DETALHADO_CURRENT.md
git commit -m "docs: record M4b implementation handoff"
```

- [ ] **Step 5: Stop for Creator review.** Present the branch and local verification summary. Do not dispatch the workflow, perform a live Portal GET, push/open a PR, or merge without the user's separate direction for that next action.

---

## Self-review

- **Spec coverage:** v0.2 scope and v0.1 compatibility are Task 1; exact route, header, one request, stream cap, abort, and fake fetch are Task 2; durable private custody and proof semantics are Task 3; seal-before-parse, byte integrity, DTO validation, safe failure states, and cleanup are Task 4; manual-only workflow and secret routing are Task 5; CI, safety gates, checkpoint, and roadmap are Task 6. No live Portal call is included.
- **Placeholder scan:** no `TODO`, `TBD`, “implement later,” or unspecified test placeholders. Each code-producing task names concrete files, exported interfaces, commands, and expected outcomes.
- **Interface consistency:** `buildM4ControlledScopeV02` feeds the runner; the transport accepts `{documentCode}` and yields raw bytes; the runner consumes `durableCustodyBackend.preflight()`, `.persist({envelope, proof})`, and the v0.2 append-only status-proof method; pending/final proof enums match Task 3's receipt validator.
- **Review focus:** all five identified failure classes are pinned to tests in Tasks 2–5. DTO optionality follows the spec's warning that OpenAPI does not declare a required-property set.
- **Scope check:** transport, capture runner, custody, and workflow form one dependent delivery chain; splitting them into independently shippable plans would leave no usable, testable M4b path, so one plan is appropriate.

## Execution boundary

This plan is documentation only. It does not authorize implementation. After the user reviews and approves this plan, code changes still proceed on the isolated branch with tests first and human review gates. A live Portal request remains a separate, later authorization tied to the reviewed final code and exact manifest.
