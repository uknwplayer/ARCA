# ARCA Creator Passkey Foundation V1

**Status:** backend cryptographic foundation / local enrollment next

## Purpose

Creator Passkey Foundation V1 provides the strong identity layer required before the Creator Console can ever be considered for remote access.

The design deliberately does **not** expose the Creator Console remotely in this version. It establishes WebAuthn/passkey verification, strong Creator sessions, step-up authentication, credential revocation and anti-replay controls first.

Target path:

```text
Creator
  -> WebAuthn/passkey ceremony
  -> verified Creator identity
  -> short Creator session
  -> Creator Control Plane scopes
  -> step-up for high-risk command
  -> normal ARCA authorization/review boundaries
```

A passkey proves Creator identity. It does not create shell access, direct Core mutation, direct `main` writes or Human Review bypass.

## Backend components

`CreatorPasskeyRegistry` stores public credential records under:

`ARCA_HOME/creator-control/passkeys/credentials/<credentialIdHash>.json`

The registry stores only verifier material and metadata needed to authenticate:

- credential ID / credential ID hash;
- public key as JWK and public-key hash;
- supported algorithm;
- AAGUID hash rather than raw AAGUID;
- authenticator signature counter;
- label, creation/usage timestamps and revocation state;
- tamper-evident `recordHash`.

No private key exists on the ARCA server. The authenticator/device keeps the private key.

## Supported WebAuthn algorithms

V1 accepts:

- ES256 / EC2 P-256;
- Ed25519 / EdDSA.

Registration currently accepts `attestation: none` / `fmt=none`. This intentionally avoids building a partial attestation trust-chain implementation and keeps the first trust model tied to possession of the locally enrolled authenticator.

## Registration security checks

Registration verifies:

- single-use, short-lived server challenge;
- `clientDataJSON.type = webauthn.create`;
- exact allowlisted Origin;
- `crossOrigin !== true`;
- exact SHA-256 RP ID hash in authenticator data;
- User Presence;
- User Verification by default;
- Attested Credential Data flag;
- credential ID consistency between browser response and authenticator data;
- supported COSE public-key type/algorithm;
- duplicate credential refusal.

The first browser enrollment ceremony is deliberately not wired into a remote endpoint yet.

## Authentication security checks

Authentication verifies:

- one-time challenge with purpose `authenticate` or `step-up`;
- `clientDataJSON.type = webauthn.get`;
- exact allowlisted Origin;
- exact RP ID hash;
- User Presence and User Verification;
- signature over `authenticatorData || SHA256(clientDataJSON)`;
- credential revocation state;
- monotonic authenticator sign counter when both stored and returned counters are non-zero;
- optimistic concurrency on credential update.

A consumed challenge cannot be reused.

## RP ID and Origin policy

The RP ID is explicit configuration and is never inferred from an arbitrary request.

Allowed Origins are explicit configuration. Plain HTTP is accepted only for loopback development origins (`localhost`, `127.0.0.1`, `::1`). Any non-loopback deployment must use HTTPS.

The future remote Creator Console must have a stable RP ID and trusted HTTPS/tunnel origin before WebAuthn is enabled there.

## Strong Creator sessions

`CreatorSessionStore.issueAuthenticatedSession(...)` can create a short session after a successful passkey assertion. Strong sessions may receive the Creator scopes granted by host policy.

This differs from `local-bootstrap`:

- `local-bootstrap` remains permanently limited to `creator.chat` + `creator.read`;
- it cannot be promoted to strong authentication;
- it cannot perform review/elevated/high-risk Creator operations.

## Step-up

High-risk Creator Control Plane commands already require explicit confirmation plus recent `stepUpAt`.

`CreatorSessionStore.markStepUp(...)` now records a fresh step-up only when:

- the active session itself was created by `webauthn` or `hardware-key` authentication;
- the verifying credential hash matches the credential that established the session.

A different passkey cannot silently step up an existing session in V1.

## Revocation

A credential can be revoked durably with a reason and optimistic-concurrency `expectedRecordHash`.

Revoked credentials:

- disappear from new `allowCredentials` authentication options;
- fail authentication even if an old browser request still references them.

Deletion is not used as revocation because preserving the public verifier record and revocation history is useful for auditability.

## Serialization boundary

The registry returns WebAuthn option values such as challenges and credential IDs in base64url form. A browser adapter must decode binary WebAuthn fields into `Uint8Array` before invoking `navigator.credentials.create()` or `navigator.credentials.get()`, then encode binary response fields back to base64url for the backend.

This browser adapter is the next implementation step; it is intentionally separate from the cryptographic verifier.

## Security boundary

Passkey Foundation V1 does not add:

- a public Creator URL;
- a remote bind;
- TLS termination;
- tunnel configuration;
- private-key storage;
- recovery master password;
- shell execution;
- direct `main` writes;
- Human Review bypass;
- automatic Core mutation.

The URL is not a secret. Security comes from WebAuthn identity proof, scoped sessions, step-up, Creator Action Registry policy and auditability.

## Next steps

1. add a **local first-passkey enrollment ceremony** guarded by the existing one-time local bootstrap plus explicit physical/local confirmation;
2. add browser WebAuthn serialization helpers and local Creator Console passkey login/step-up routes;
3. surface credential inventory/revocation in a Creator-only local security view;
4. test authenticator edge cases and browser interoperability;
5. only then design remote Creator Console deployment behind a stable HTTPS origin or trusted tunnel;
6. keep remote access disabled until the strong-auth path is exercised end-to-end.
