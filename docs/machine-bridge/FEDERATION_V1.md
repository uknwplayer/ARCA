# Machine Bridge Federation V1

## Status

Foundation implementation for explicit-trust federation between independent GitHub Mesh mailbox domains.

Federation V1 does **not** create an open public network. A peer is usable only when its operator/repository, node identity and transport descriptor are configured and verified explicitly.

## Goal

The earlier Mesh mailbox proof used one repository-backed rendezvous domain. Federation V1 allows a local Mesh relay to attach a peer whose durable mailbox lives in another repository/ref with its own repository credential.

Example:

```text
Operator A
  source / local state
  operator-a/mesh-state
        |
        | explicit federated peer config
        | trusted Ed25519 identity for worker-b
        v
Operator B
  operator-b/mesh-state
  arca-runtime
        |
        v
  worker-b
```

The Mesh envelope format, request correlation, hop receipts and endpoint contract do not change.

## Component

`GitHubMeshFederationPeerResolver`

The resolver receives a GitHub Mesh mailbox that is already configured for the remote repository domain.

Before exposing that node as a routable Mesh peer it requires:

1. mailbox identity policy `require-trusted`;
2. a fresh signed node advertisement;
3. signer verification through the local explicit `MeshIdentityTrustStore`;
4. exact node ID binding;
5. exact GitHub transport binding:
   - repository;
   - ref;
   - mailbox root;
6. optional expected key fingerprint pinning.

The resulting peer contains immutable federation evidence identifying:

- remote repository/ref/root;
- node ID;
- Ed25519 identity ID/fingerprint;
- signed advertisement hash;
- heartbeat timestamp.

## Trust model

Federation V1 is allowlist-oriented.

There is no:

- global discovery;
- gossip;
- DHT;
- automatic trust-on-first-use;
- implicit trust based on repository ownership;
- capability-to-authorization conversion.

A signed advertisement proves who signed the advertisement. It becomes a routable federated peer only when that signer is already trusted locally and the signed transport descriptor matches the operator-configured remote mailbox.

Capability advertisements are routing compatibility information, not authorization.

## Credential boundary

Each GitHub mailbox transport receives its own repository credential out-of-band.

Credentials:

- are not part of the Mesh envelope;
- are not part of signed advertisements;
- are not stored in queues/results;
- are not included in federation evidence.

A federation link can therefore use a credential scoped to the remote rendezvous repository without reusing the local repository credential.

## Cross-repository proof

The automated Federation V1 fixture creates two independent repository stores:

```text
operator-a/mesh-state  <- token A only
operator-b/mesh-state  <- token B only
```

It proves:

- local and remote durable stores are distinct;
- the local credential is never accepted by the remote store;
- the remote credential is never accepted by the local store;
- credentials are absent from durable state;
- the request is persisted only in the remote mailbox;
- the remote signed endpoint advertisement is identity-verified;
- the signed repository/ref/root descriptor is bound before routing;
- signed hop receipts remain valid across the federation boundary;
- the terminal result returns with the original request/job correlation.

Additional fail-closed tests prove that:

- an otherwise valid remote node is unavailable when its identity is not explicitly trusted;
- a trusted signed advertisement copied from another repository domain is rejected because the signed transport descriptor no longer matches the configured federation target.

## Security properties

Federation V1 does not add arbitrary execution.

The downstream endpoint remains constrained by the existing:

- Machine Bridge Action Registry;
- capability checks;
- claims/leases;
- request correlation;
- Human Review / autonomy rules where applicable.

Federation does not authorize source mutation, public-network acquisition or Creator access.

## Operational topology

A deployment may construct one resolver per explicitly configured peer domain.

Example conceptual configuration:

```text
local relay
  peers:
    - nodeId: worker-b
      transport: github-mailbox
      repository: operator-b/mesh-state
      ref: arca-runtime
      identityFingerprint: <pinned fingerprint>
```

The repository/token selection is host policy. It is not read from the incoming job or reasoning/model output.

## Current limit

The repository connector used during this development session does not expose creation of a second GitHub repository, so the cross-repository proof in this milestone uses two isolated GitHub API/store fixtures rather than mutating an unrelated user repository.

The protocol boundary is nevertheless real in code: repository, ref, identity and credential are separate inputs, and the test rejects cross-domain descriptor substitution.

A later live probe should use two dedicated repositories or two independent hosts whose credentials are scoped independently.

## Next iteration

Federation V1.1 should add a durable, operator-managed federation peer catalog with:

- explicit peer enrollment;
- identity rotation workflow;
- health/heartbeat state;
- bounded failure/backoff;
- no automatic trust expansion.

Only after independent-operator live proof should the project consider multi-peer selection or broader discovery.
