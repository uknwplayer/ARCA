# ARCA M4b — Portal Related Documents Controlled Capture Design

Status: **DESIGN AND IMPLEMENTATION PLAN APPROVED IN CHAT; CODE AWAITING CREATOR REVIEW**
Date: **2026-09-22**
Scope: **offline implementation and CI only; no Portal request is authorized**

## Intent and success

Implement the offline-tested preparation for one future, explicitly authorized Portal da Transparência API request. The request will retrieve documents related to one previously selected expense document and preserve the exact response in encrypted private custody. M4b succeeds when the public code has a strict, documented contract; fake-fetch tests prove the request and failure boundaries; custody and sanitized proof are independently verified; and CI passes without contacting the Portal.

M4b does not perform a live request, interpret a relationship as wrongdoing, promote data into an investigation, correlate it with PNCP, publish source bytes, or authorize access to any protected information.

## Source-of-truth API contract

The current official OpenAPI document is `https://api.portaldatransparencia.gov.br/v3/api-docs`, served by the official API host. On 2026-09-22 it declared OpenAPI `3.0.1` and the following operation:

| Property | Official contract |
|---|---|
| Method and path | `GET /api-de-dados/despesas/documentos-relacionados` |
| Required query | `codigoDocumento` — document code composed of Unidade Gestora + Gestão + document number |
| Required query | `fase` — integer; `1` empenho, `2` liquidação, `3` pagamento |
| API key | `chave-api-dados` header, defined as an API-key security scheme |
| Success body | JSON array of `DocumentoRelacionadoDTO` |
| DTO properties | `data`, `fase`, `documento`, `documentoResumido`, `especie`, `orgaoSuperior`, `orgaoVinculado`, `unidadeGestora`, `elementoDespesa`, `favorecido`, `valor` (OpenAPI declares these as strings) |
| Declared errors | `400`, `401`, `500` |
| Pagination | Not declared for this operation |

For this use case, `fase` must be exactly `3`. The implementation must not substitute `/despesas/documentos`, `/documentos/{codigo}`, a download CSV, or the M1 fixture adapter. Those are distinct contracts. The Portal's API-access page explains obtaining a token and service request limits; those limits are not a reason for ARCA to retry.

The OpenAPI does not declare a maximum response size, maximum number of related records, stable nullability/required-field set for the DTO, or pagination for this endpoint. Those are ARCA safety policies below, not official API guarantees. Contract changes require a reviewed version update.

## Manifest compatibility and versioning

M4a introduced `arca.m4-controlled-scope.v0.1`. Its Portal branch records a document hash and `page:1`, although the verified related-documents operation has no page parameter. M4b must not silently reinterpret an existing v0.1 manifest.

Add a new `arca.m4-controlled-scope.v0.2` representation for new scopes:

- PNCP inputs retain their existing meaning and deterministic scope/budget fields;
- Portal scope records `endpointId: "PORTAL_EXPENSE_RELATED_DOCUMENTS"`, `phaseCode: 3`, and `documentCodeSha256`;
- Portal scope has no `page` field;
- Portal budgets explicitly record `maxRequests: 1`, `maxRecords: 25`, `maxBytes: 65536`, `timeoutMs: 30000`, and `retries: 0`;
- exact confirmation remains source-specific and does not itself authorize network access;
- the manifest continues to declare `networkAuthorizedForThisManifest: false` and `publicationAttempted: false`;
- raw document code and token never appear in serialized manifest fields, proof, logs, workflow inputs, or public artifacts; only the document-code digest is included in the scope hash input.

V0.1 PNCP manifests and durable receipts remain readable and unchanged. Tests must pin v0.1 compatibility and v0.2 determinism.

## Components and boundaries

### 1. Scope builder

Extend or version `src/investigation/m4-controlled-scope.mjs`. It accepts only exact keys, applies bounded conservative validation to the Portal document code (the OpenAPI gives its composition but no regex), fixes endpoint and phase, and hashes the code. It validates the single-request/record/byte/time budgets. It does not accept a token, arbitrary URL, caller-selected phase, pagination, retries, or a network-authorized flag.

### 2. Portal transport

Add a narrow transport module dedicated to the verified operation. It constructs the URL from a fixed HTTPS origin and fixed path; only the two required query parameters are emitted. The API key is sent only in the `chave-api-dados` request header. Fetch must use `GET`, `redirect: "error"`, an abort timeout no greater than 30 seconds, one request, and zero retries.

The transport streams the body and aborts as soon as it exceeds 65,536 bytes; it must not call unbounded `response.text()` or `response.json()` before enforcing the byte ceiling. It validates HTTPS, exact host/path, status, content type, UTF-8 and JSON shape using fake-fetch tests. It must not record the complete URL because the document code is in its query string. Diagnostics use fixed error codes and a hash-only scope reference.

The token is read only from a private runtime secret and validated before any Portal request. Missing, malformed, or weak credential configuration fails before the Portal fetch. Token values may not enter errors, proofs, logs, URLs, temporary filenames, or artifacts.

### 3. Capture, encryption, and durable custody

Reuse `sealCustodyDirectory` and `createGitHubPrivateCustodyBackend` rather than inventing a second envelope or vault. Private-vault preflight must complete before the Portal request and confirm the configured target is private. Keep the Portal fetch and vault fetch distinguishable in tests and metrics: the budget of one request applies to the Portal origin, while the existing custody backend may perform its own bounded GitHub API operations.

The raw response bytes are staged with restrictive local permissions and sealed as the original bytes before JSON parsing, semantic normalization, or classification. Persist the encrypted envelope and sanitized capture proof to durable private custody, verify the stored receipt, then validate JSON/DTO shape from the locally reopened envelope. Remove plaintext staging in `finally` on success or failure. No step may report a valid capture while durable persistence is pending or failed. Tests cover failure before fetch, after fetch, during seal, during persistence, and during post-write verification.

The proof binds the exact manifest/scope hash, API contract identifier, HTTP status class, response byte count and hash, encrypted-envelope hash, durable receipt hash, and bounded record count when shape validation succeeds. It includes no raw document code, response body, person name, token, full request URL, or personal identifier. The proof states explicitly that classification, investigation ingress, correlation, publication, and automatic adverse action did not occur, and that human review remains required.

If body capture succeeded but JSON parsing or shape validation failed, retain only the encrypted original and a sanitized failure status in private custody; mark the probe failed, never turn it into an empty result or `NOT_OBSERVED` finding. The proof must distinguish `captureStatus: "CAPTURED_AND_SEALED"` from `validationStatus: "FAILED"`; it must not advertise a valid Portal result. If custody fails, do not emit a success proof and remove any plaintext staging.

### 4. Manual workflow

Add a `workflow_dispatch`-only workflow, with no schedule, push, pull-request, repository-dispatch, or automatic trigger. It will require:

- the exact explicit confirmation string for a Portal document-only GET;
- a manifest scope hash or revision tied to the reviewed code;
- Portal API token, custody passphrase, private-vault repository, and vault token from configured secrets;
- the document code from a private secret channel, never a visible workflow input, workflow summary, artifact name, or command line.

The workflow first validates all inputs and private-custody preflight material, then checks out the exact reviewed revision and runs the capture script. It uploads only the encrypted envelope and sanitized proof with bounded retention; publication-boundary checks remain active. Workflow creation or merge does not itself authorize execution. No live workflow run is part of M4b implementation or CI.

The workflow must distinguish missing authorization, invalid credentials, throttling, server failure, timeout, response-size overflow, JSON/schema drift, and custody failure. It never retries. `401` is an authorization failure, `400` is a request/contract failure, `429` is rate limiting, and `5xx`/timeout are source availability failures; none is evidence of absent payment or misconduct.

## Data flow

`approved source code + synthetic test input`
→ build v0.2 scope and hash the document code
→ preflight private vault
→ (future, only after separate explicit Creator authorization) one GET to the fixed Portal operation
→ cap and hash response bytes
→ seal original bytes
→ persist encrypted envelope and sanitized receipt to private vault
→ verify durable receipt
→ emit sanitized proof; no classifier, ingress, correlation, or publication.

In M4b CI, fake fetch replaces the Portal request and proves the construction and bounds. CI must not contact the Portal, require a real token, or execute the live workflow.

## Error and safety behavior

Fail closed before a Portal request on invalid or ambiguous scope, missing confirmation, missing/invalid token, unavailable custody configuration, non-private vault target, invalid private-vault preflight, invalid URL construction, or an attempted extra request.

After a request begins, do not retry or follow redirects. Classify operational outcomes as sanitized source/capture failures, not adverse evidence. Reject HTTP errors, non-JSON content, invalid UTF-8/JSON, non-array success bodies, response size above 64 KiB, more than 25 related records, unexpected record types, and incompatible DTO shape. Do not truncate an oversized response and call it complete.

No output from M4b may:

- classify an anomaly or imply an irregularity;
- create or update an investigation;
- correlate the Portal response with PNCP;
- enter public or case repositories in plaintext;
- identify a target in public workflow metadata;
- authorize any further request or source.

`PUBLIC_TRAIL_END` and adverse analysis remain downstream concepts; a failed/empty API response is not itself proof that a public trail ended or that a payment did not occur.

## Test and acceptance requirements

Tests use only synthetic codes, synthetic responses, fake fetch, temporary directories and fake private-vault API responses.

Required cases include:

1. v0.2 Portal scope fixes the endpoint and phase 3, hashes the document code, omits page, and is deterministic; document-code validation is bounded and conservative because the OpenAPI documents the identifier's composition but no regex;
2. v0.1 PNCP scope and receipts remain compatible;
3. no request occurs for missing confirmation, token, vault secret, invalid scope, or failed private-vault preflight;
4. positive fake-fetch path makes exactly one Portal request with exact origin/path/query/header/method and no token in URL/output;
5. a second Portal request, redirect, alternate host, alternate path, extra query, caller-controlled phase, or retry fails closed;
6. 65,536-byte body is accepted subject to shape; 65,537 bytes aborts while streaming and is not parsed as complete;
7. timeout is at most 30 seconds and deterministic under fake timers/abort signal;
8. 400, 401, 429, 5xx, network failure, invalid content type, invalid UTF-8/JSON, non-array JSON, 26 records, and schema drift each produce a distinct sanitized failure class;
9. API-key material and raw document code never appear in logs, proof, artifact names, exception messages, or public outputs;
10. original response bytes are sealed before normalization, durable receipt is verified before success, and plaintext staging is cleaned on all paths;
11. durable custody failures never produce `CAPTURED_AND_SEALED` success proof;
12. classifier, investigation ingress, correlation and publication remain disabled;
13. full repository tests, M0–M3 offline gates, roadmap validator, public check, publication boundary and Node 22.18 CI all pass.

## Gates and non-authorization

This design permits only writing a separate implementation plan after the Creator approves this written specification. Once that plan is approved and M4b code/CI reviewed, a separate concrete manifest must be prepared with the exact target code supplied through a private channel, scope hash, revision, operator, time window and budgets. The Creator must then explicitly authorize that exact single Portal GET. A general “prossiga,” approval of this specification, PR approval, merge, configured token, or workflow availability is not live-request authorization.

M4b implementation acceptance and live authorization are separate gates. This spec authorizes **zero** live Portal requests.

## Official sources and verification snapshot

- Official API OpenAPI: https://api.portaldatransparencia.gov.br/v3/api-docs — consulted 2026-09-22; OpenAPI 3.0.1; operation and schema recorded above.
- Official API access and token information: https://portaldatransparencia.gov.br/api-de-dados — consult for current token procedure and rate limits; consulted 2026-09-22.
- Official expense downloads and available payment/impact files: https://portaldatransparencia.gov.br/download-de-dados/despesas — separate CSV interface, not this API response; consulted 2026-09-22.
- Existing M4 architecture and safety rules: `docs/ARCA_M4_CONTROLLED_LIVE_DESIGN.md` and `docs/checkpoints/ARCA_HANDOFF_CHECKPOINT_2026-09-22_011.md`.

The official OpenAPI document can change independently. Before implementation or any live authorization, re-read it and compare operation path, auth scheme, parameters, response schema and errors. A mismatch blocks the work pending a reviewed spec revision.
