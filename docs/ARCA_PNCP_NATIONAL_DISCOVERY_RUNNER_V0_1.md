# PNCP National Discovery Runner V0.1

Status: **FOUNDATION**

## Result

This adapter connects each scheduler shard to the existing bounded PNCP discovery and acquisition/custody implementation.

For every UF shard it creates an isolated investigation/source context, invokes the allowlisted discovery plan, captures the response before parsing, and returns only the existing derived discovery result to the scheduler.

## Double network gate

A live runner cannot be constructed unless it receives explicit public-network authorization and the exact `PNCP_PUBLIC_GET_ONLY` confirmation. Even then, the scheduler independently requires the same authorization when the cycle starts.

Offline transports declare `networkEnabled: false` and can exercise the complete composition without external calls.

## Integral offline proof

The automated proof runs one synthetic page for every one of the 27 federative units through:

1. national plan;
2. scheduler;
3. discovery runner;
4. PNCP decoder;
5. acquisition and custody;
6. derived target extraction;
7. checkpoint completion.

The proof expects 27 successful shards, 27 custody manifests, zero failures and a completed national checkpoint. No synthetic observation is emitted to an investigator because the fixture classifier intentionally returns no actionable signal.

## Boundary

The checkpoint retains hashes and counts, not response content. Raw fixture bytes follow the same transient acquisition/custody route used by the connector and are kept outside the repository.
