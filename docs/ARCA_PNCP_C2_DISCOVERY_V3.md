# ARCA PNCP C2 — Bounded Discovery V3

## Objective

C2 adds a bounded discovery layer for public PNCP publication queries. It is designed to find procurement targets that can later be deepened through the controlled C1 detail connector without turning ARCA into an unrestricted crawler or remote shell.

The runtime remains provider-independent. Replit, GitHub Actions, Android, a VPS, a local machine or any other host may run a worker as long as that worker satisfies the Machine Bridge capability contract.

## Official public consultation boundary

Discovery uses the PNCP public consultation base:

- `https://pncp.gov.br/api/consulta`
- allowlisted endpoint: `/v1/contratacoes/publicacao`
- method: `GET`
- public access only
- no Authorization header
- redirects handled manually

The C1 detail/integration connector remains separate and uses `https://pncp.gov.br/api/pncp`.

## Bounded scope

Every discovery request must include:

- `dataInicial` and `dataFinal` in `AAAAMMDD` format;
- at least one limiting selector: CNPJ, IBGE municipality code or UF;
- one or more procurement modality identifiers.

The default discovery interval is limited to 31 inclusive days. Remote Machine Bridge actions apply stricter fixed ceilings before any network request:

- maximum 25 total pages;
- maximum 10 pages per modality;
- maximum 1,000 records;
- maximum page size 200.

A job may request lower limits but cannot raise these remote ceilings.

## Custody before parsing

For network discovery, each successful response is captured through the Acquisition layer before JSON decoding and analytical extraction. The custody layer records the original bytes and SHA-256 digest. Only after capture may the discovery engine parse the page and derive a target.

This invariant is deliberate:

`public response -> original-byte capture -> custody manifest -> parse -> target proposal`

Discovery does not mutate ARCA Core and does not establish guilt, fraud, corruption, crime or legal irregularity. All outputs remain review-bound.

## Machine Bridge actions

### `pncp.discovery-plan`

- registered by default;
- requires capability `pncp-plan`;
- never enables network;
- returns the normalized scope, fixed budgets and first-page request plan;
- returns `humanReviewRequired: true`.

This action is safe for the canonical GitHub Actions worker.

### `pncp.discovery-public`

- not registered by default;
- appears only when the host explicitly enables PNCP public network support;
- requires capability `pncp-public-network`;
- requires job-level `authorizePublicNetwork: true`;
- requires `investigationId` and `sourceId`;
- requires host-supplied custody and staging storage;
- does not allow the job to override PNCP origin, HTTP method or custody paths.

## Provider-independent worker policy

ARCA does not require a permanent daemon, Replit, VPS or any specific hosting provider. A user may operate only the canonical GitHub worker for planning, deterministic analysis and repository work, or may attach another worker when persistent network acquisition/custody is needed.

The scheduling contract is capability-based, for example:

```json
{
  "action": "pncp.discovery-public",
  "requires": ["pncp-public-network"]
}
```

A worker that does not advertise the capability simply cannot claim the job.

The canonical hosted GitHub Actions worker intentionally does not advertise `pncp-public-network` because its local filesystem is ephemeral. A future remote durable-custody adapter may allow hosted ephemeral workers to perform acquisition safely without weakening the custody invariant.

## C2 output

The discovery result contains:

- normalized scope;
- bounded execution statistics;
- deduplicated procurement targets identified by CNPJ/year/sequential number;
- per-page source URL, status, byte length and SHA-256;
- custody acquisition references;
- explicit invariants including custody-before-parsing and no Core mutation;
- `humanReviewRequired: true`.

Records that do not contain enough information to produce a deepen-able target are ignored rather than assigned invented identifiers.

## Next gate

The next safe step is a controlled discovery-to-detail pipeline:

`C2 target discovery -> C1 detail acquisition -> custody verification -> AIE offline analysis -> human review`

No analytical signal is authoritative by itself.
