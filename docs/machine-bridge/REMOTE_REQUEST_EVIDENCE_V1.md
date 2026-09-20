# Remote Request Evidence V1

## Purpose

Cross-Peer Request Ownership V1 proves what the local relay knows:

- which peer owns a request;
- whether dispatch started;
- whether completion was observed;
- whether the outcome is uncertain.

It does not prove what the remote peer itself observed.

Remote Request Evidence V1 adds signed, trust-validated remote statements for:

- `accepted`;
- `rejected`;
- `completed`.

These statements are evidence only. They do not create trust, authorization or automatic failover.

## Signature domain

Remote evidence uses the Mesh signed-statement domain:

```text
arca.mesh.request-evidence.v1
```

The statement signer must be the same Ed25519 identity as `evidence.nodeId`.

Verification requires the local `MeshIdentityTrustStore`.

## Evidence fingerprint

Every evidence statement is bound to:

- nodeId;
- requestId;
- jobId;
- payloadHash;
- ownerBindingHash.

This prevents a valid statement for one request/binding from being replayed as proof for another.

## Remote decision model

The remote ledger uses one create-only file:

```text
<nodeId>/<requestId>/decision.json
```

It contains exactly one signed decision:

- `accepted`; or
- `rejected`.

Acceptance and rejection are mutually exclusive.

A second concurrent process cannot legitimately create the opposite decision after the first decision wins.

## Completion model

After `accepted`, the remote ledger may create:

```text
<nodeId>/<requestId>/completion.json
```

Completion contains:

- resultHash;
- acceptedStatementHash.

Therefore completion is cryptographically bound to the exact acceptance statement.

A rejected request cannot create completion evidence.

## Rejection categories

Only bounded categories are persisted:

- invalid-request;
- policy;
- capability;
- unavailable;
- not-accepted;
- unknown.

Raw error text is not persisted.

## Evidence storage adapters

### Filesystem

`createFileRemoteRequestEvidenceStorage()`

Uses create-only file semantics.

### GitHub Mesh mailbox

`createGitHubRemoteRequestEvidenceStorage()`

Stores evidence beneath the configured Mesh mailbox root:

```text
request-evidence/<nodeId>/<requestId>/decision.json
request-evidence/<nodeId>/<requestId>/completion.json
```

The GitHub adapter uses create-only Content API semantics. Credentials remain inside the existing mailbox/transport boundary.

## Independent reader

`readRemoteRequestEvidence()` does not require the remote private key.

The observing operator provides:

- remote storage adapter;
- expected nodeId;
- requestId;
- local trust store;
- verification time.

The reader validates:

- Mesh signature;
- current trusted identity;
- request correlation;
- completion -> acceptance binding.

## Local ownership observer

`observeRemoteRequestEvidence()` binds a remote signed statement to the local Cross-Peer Request Ownership record.

It requires:

- selectedNodeId == signer/nodeId;
- requestId match;
- jobId match;
- payloadHash match;
- ownerBindingHash match.

### accepted

Confirms that the selected remote owner signed acceptance.

The local ownership state remains in-flight/reserved according to its own dispatch evidence.

### completed

Records only the signed `resultHash` into local ownership completion evidence.

Semantic result content is not copied into the ownership ledger.

### rejected

Returns a verified rejection observation.

V1 still reports:

```text
automaticFailoverAllowed = false
```

A rejection statement is useful evidence, but automatic cross-peer failover is intentionally deferred to a later policy/protocol milestone.

## Why absence still proves nothing

No remote statement may be available because:

- the remote host never received the request;
- it received the request and crashed before writing acceptance;
- GitHub/storage publication failed;
- network access failed;
- the statement exists but the observer cannot currently read it.

Therefore:

```text
no evidence != evidence of no execution
```

Missing evidence does not authorize failover.

## Bounded validity

Signed Mesh statements have bounded validity windows.

V1 uses the existing Mesh maximum of 24 hours for newly-issued request evidence by default.

Durable files remain audit artifacts, but live routing decisions must use currently trust-valid statements.

This prevents an indefinitely old statement from silently becoming current operational authority.

## Security properties

Remote Request Evidence V1:

- uses Ed25519 Mesh identity;
- requires trust-store verification;
- binds evidence to local ownership hash;
- stores hashes rather than semantic request/result bodies;
- persists no credentials or private keys;
- persists no raw error text;
- makes acceptance/rejection mutually exclusive;
- makes completion dependent on acceptance;
- detects tampering;
- rejects evidence from the wrong peer;
- rejects evidence from a rotated/non-current key;
- does not create authorization;
- does not change health;
- does not change peer enrollment;
- does not discover peers;
- does not enable automatic failover.

## Runtime integration boundary

The current legacy mailbox processor does not yet have a standardized private-key loader.

V1 therefore does not add a raw private-key environment variable.

Evidence issuance is wired through an explicit signer object, matching the existing signed Mesh runtime pattern.

A later deployment integration should obtain the signer through a secure key boundary, not by persisting private-key material in Git state or ordinary runtime config.

## Tests

V1 tests cover:

- signed accepted evidence;
- trust validation;
- idempotent acceptance;
- concurrent accept vs reject;
- completion requires acceptance;
- completion binds acceptedStatementHash;
- rejected request cannot complete;
- rotated/untrusted key rejection;
- signed-payload tamper detection;
- durable-file tamper detection;
- local ownership binding;
- completion reconciliation by resultHash only;
- rejection does not authorize automatic failover;
- wrong-node/wrong-binding rejection;
- GitHub create-only storage semantics;
- independent public reader;
- absence of semantic request/result content in evidence storage.

## Next milestone

After V1 is merged, the strongest next external proof remains:

**live two-operator federation**

with:

- separate repositories/hosts;
- separate credentials;
- separate Ed25519 identities;
- explicit mutual trust;
- owner binding;
- signed remote acceptance/completion evidence;
- no semantic plaintext leakage;
- no duplicate dispatch.

Only after that proof should a policy for safe re-assignment after cryptographically explicit rejection be designed.
