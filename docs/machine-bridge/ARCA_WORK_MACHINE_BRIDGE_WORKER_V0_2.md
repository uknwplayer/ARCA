# ARCA Work Machine Bridge Worker V0.2

**Status:** bounded remote-worker foundation  
**Depends on:** ARCA Execution Endpoint V0.1  
**GitHub Actions:** not required

## Purpose

Promote the successful Work dispatch experiment into canonical ARCA code without promoting its unsafe assumptions.

The live experiment proved that a GitHub PR event can wake ChatGPT Work, that Work can verify a detached Ed25519 job envelope, select a capable worker, execute the allowlisted `worker.ping` action and return one structured terminal result.

V0.2 turns that mechanism into a Machine Bridge adapter.

```text
Machine Bridge V3 job
        |
        v
WorkMachineBridgeRemoteWorker
        |
        +--> build bounded Work payload
        +--> closed signer callback
        +--> verify against explicit trusted fingerprint
        +--> persist signed envelope on isolated PR branch
        +--> ExecutionEndpointRegistry.wake()
                         |
                         v
                ChatGPT Work event trigger
                         |
                         v
                ARCA-WORK-RESULT-V1
                         |
                         v
               correlation + safety verify
```

## Security corrections made during promotion

The experimental verifier accepted any internally self-consistent Ed25519 public key. That was sufficient for a mechanics experiment but is not a production trust boundary.

Canonical V0.2 therefore **requires an explicit trusted signer fingerprint**. A mathematically valid signature from an unknown key fails closed.

The canonical result verifier also requires the Work result to repeat the exact:

- `payloadSha256`;
- signer `keyFingerprint`;
- `jobId`;
- `requestId`.

This binds the terminal result to the signed input envelope. The result must also carry a monotonic lifecycle and explicit no-main/no-merge/no-arbitrary-shell safety assertions.

A GitHub comment remains transport evidence, not a cryptographic Work identity. V0.2 does not claim otherwise.

## Action boundary

V0.2 canonical allowlist contains only:

`worker.ping`

That action is deliberately safe to repeat. Until ARCA has a durable exclusive Work claim with stronger worker identity, non-idempotent actions, repository mutation, arbitrary shell and code mutation remain forbidden.

## Replay / uncertainty

If a signed job envelope already exists for a `jobId`:

- if one verified terminal result already exists, it is returned;
- if no verified terminal exists, the state becomes `pending-or-ambiguous-existing`;
- ARCA does **not** automatically wake Work again.

Therefore timeout or missing result never becomes proof of non-execution.

## Failover

The payload can carry an ordered `preferredWorkerIds` list plus `allowFailover`. Worker selection remains capability-gated.

The isolated experiment has already demonstrated:

`work:primary unavailable -> work:standby selected -> completed`

with `signatureVerified:true`, matching payload hash/fingerprint and no main mutation/merge/arbitrary shell.

V0.2 records that behavior as a supported selection contract, but does not treat a Work-reported claim as a globally atomic claim.

## Signing boundary

The canonical module accepts a closed signer callback:

```text
signer.publicKeySpki
signer.keyFingerprint
signer.sign(bytes)
```

It does not read raw private-key environment variables and does not commit key material. V0.2 includes `createVaultWorkDispatchSignerBroker()`, which binds this interface to the existing encrypted Credential Vault. The private key is decrypted only inside `vault.withCredential()`, the broker exposes no `keyRef` or private-key field, and signer/key mismatch fails with a sanitized error.

## Work event-trigger contract

The Work-side event task should:

1. react only to the configured isolated PR;
2. ignore job-file commits until a new wake token is present;
3. derive the Machine Bridge `jobId` from the wake `taskRef`;
4. fetch `experiments/work-wakeup/jobs/<jobId>.json`;
5. verify the detached Ed25519 envelope against the configured trusted signer fingerprint;
6. reject expired, untrusted, unsupported or unsafe jobs;
7. check for an existing terminal result before execution;
8. execute only an allowlisted action;
9. emit at most one `ARCA-WORK-RESULT-V1` terminal comment;
10. never merge, mutate `main`, change repository settings or infer code authority.

`wake != claim != execution != authority` remains invariant.


## Machine-readable contracts

V0.2 publishes:

- `schemas/arca-work-job-v1.schema.json` for the signed dispatch envelope;
- `schemas/arca-work-result-v1.schema.json` for terminal Work result comments.

These schemas are transport contracts. Runtime verification remains stricter than schema validation because it also verifies Ed25519 signature, explicit signer trust, expiry, correlation hashes, lifecycle and safety invariants.
