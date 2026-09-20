# ARCA Legacy Core Consolidation Audit V0.1

Status: REVIEWED CONSOLIDATION BASELINE  
Date: 2026-09-20

## Decision

The current public ARCA remains the canonical core. A third clean-room repository is not required.

A tree-level comparison against the retained legacy private core found:

- 661 files in the legacy snapshot;
- 568 paths already represented in canonical ARCA (85.9%);
- 546 files byte-identical (82.6% of the entire legacy snapshot);
- 22 shared paths intentionally divergent;
- 93 legacy-only paths.

The result changes the migration question: most legacy implementation is already present. The remaining work is selective consolidation, not reconstruction.

## Shared but divergent files

The 22 divergent shared paths fall into current CI/publication policy, package metadata, sanitized documentation, generalized federation/node configuration, repository checks, and their tests.

The canonical public variants are retained. They remove owner/repository-specific bindings, make allowed repositories explicit inputs, support the public distribution profile, and incorporate the current Executor Mesh / investigative architecture. Legacy variants must not overwrite them.

## Legacy-only classification

The 93 legacy-only paths divide into four classes:

| Class | Count | Disposition |
|---|---:|---|
| Operational/workflow definitions | 18 | REFATOR / REHOME; never bulk-copy |
| Project-history/checkpoint material | 29 | ARCHIVE; not core runtime |
| Historical remote-job state | 37 | ARCHIVE IN PLACE / checkpoint references; not public runtime |
| Historical remote-mesh state | 7 | ARCHIVE IN PLACE / checkpoint references; not public runtime |
| Legacy trust identity material | 1 | PRIVATE ONLY; never public pattern content |
| Environment-specific metadata | 1 | OBSOLETE; do not migrate |

Total: 93.

## Functional recovery

The excluded workflow family does not mean its underlying capability disappeared. Canonical ARCA already contains the public implementation/tests for Machine Bridge, A2A discovery and resolution, federation contracts, node introduction, Mega Brain dispatch adapter, PNCP and related bounded validation logic.

The legacy workflows are therefore treated as operational wrappers. Each wrapper must be assessed against the current trust, publication, secret, Mesh and executor boundaries before it can return.

### Recovery priority

1. local/read-only validation wrappers that add no new authority;
2. A2A discovery and public reachability orchestration;
3. node/federation introduction validation;
4. Mega Brain validation;
5. Machine Bridge operational dispatch reconciled with current Executor Mesh;
6. signed cross-repository federation operations in a private operational domain;
7. optional status/reporting automation outside the core authority path.

No legacy workflow receives authority merely because it previously existed.

## Canonical boundaries

### Public ARCA
Generic code, schemas, tests, safe validation, protocol documentation, public-source connectors, Executor Mesh, investigative control plane and reviewed capability adapters.

### Private operational/investigative domains
Private identities, signed federation operational state, concrete case records, case-specific locators and other state whose publication would violate the current boundary.

### Registry/Archive
Checkpoint and migration/audit metadata. It is not an executor and not an investigative database.

### Legacy source
Retained read-only until consolidation is proven complete. It is a recovery source, not a second canonical core.

## Freeze gate

The legacy core should be marked frozen only after:

1. this audit is integrated;
2. all 18 operational wrappers have an explicit disposition;
3. private identity/state has a durable private home or documented archival location;
4. required history is referenced by Registry;
5. canonical CI proves the recovered public capabilities;
6. a final legacy SHA is recorded privately.

Deletion is not part of this plan.
