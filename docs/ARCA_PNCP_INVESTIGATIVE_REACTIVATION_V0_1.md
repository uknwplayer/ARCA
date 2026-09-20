# ARCA PNCP Investigative Reactivation V0.1

Status: PROPOSED

## Purpose

Reconnect the existing controlled PNCP connector to the V0.1 investigative source layer without weakening its acquisition or custody boundaries.

The existing `@arca/pncp-connector` remains the specialized procurement connector. The investigative source registry now identifies PNCP as an official public procurement source and can plan it through the Public Data Acquisition Layer.

## Current official boundary

- Portal: `https://pncp.gov.br`
- Production service base documented by PNCP: `https://pncp.gov.br/api/pncp`
- Public consultation is public; maintenance APIs require authorization.
- ARCA uses public GET consultation only for investigative acquisition.
- Existing connector allowlists and bounded discovery ceilings remain in force.

## Reactivation state

`PLANNING_AND_CONTRACTS_ACTIVE`

Canonical CI already runs the PNCP repository checks. This change additionally makes PNCP visible to the investigative acquisition registry and the cross-component controlled pilot.

`LIVE_PUBLIC_ACQUISITION_PENDING_PRIVATE_CUSTODY_BACKEND`

The canonical hosted worker must not be given `pncp-public-network` merely to claim reactivation. Real acquisition remains gated until a durable private investigative/custody backend is provisioned. Raw response bytes are not committed to public ARCA or the Registry.

## Storage

Public ARCA: connector code, source descriptor, schemas, bounded discovery logic, tests and documentation.

Private investigative store: retained case-specific derived observations and, where custody policy requires original acquired bytes, durable custody objects referenced by hash/locator.

Registry/Archive: checkpoint metadata only.

Secrets: neither repository.
