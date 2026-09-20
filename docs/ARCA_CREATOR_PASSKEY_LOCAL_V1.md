# ARCA Creator Passkey Local V1

**Status:** local-only Creator Console integration

## Purpose

This milestone connects the WebAuthn verifier from Creator Passkey Foundation V1 to the local Creator Console without opening any remote listener.

The supported local lifecycle is:

```text
local bootstrap
  -> explicit first-passkey enrollment
  -> passkey login
  -> strong Creator session
  -> optional WebAuthn step-up
  -> Creator Control Plane
```

The bootstrap remains low privilege throughout the process. Registering a passkey does not upgrade the bootstrap session or add scopes to it.

## Browser origin

Passkey ceremonies use:

- RP ID: `localhost`;
- browser Origin: `http://localhost:<creator-port>`;
- Creator server bind: still loopback-only.

The launcher therefore prints a dedicated localhost URL for the browser in addition to the concrete loopback bind address.

Requests to passkey ceremony endpoints through `127.0.0.1` or `::1` are refused with `PASSKEY_LOCALHOST_REQUIRED`. This avoids presenting a browser ceremony under an Origin that cannot satisfy the configured `localhost` RP ID relationship.

## First-passkey enrollment

The first credential is a bootstrap ceremony, not a general credential-management API.

Requirements:

- active `local-bootstrap` Creator session;
- no passkey record may already exist, including revoked historical records;
- `X-ARCA-Creator-Passkey: 1`;
- `X-ARCA-Creator-Passkey-Enroll: first`;
- explicit `confirmFirstEnrollment=true` in both option and verification requests;
- same-origin/Host checks already enforced by Creator Console;
- WebAuthn registration verification from Passkey Foundation V1.

Once any passkey record exists, a later local-bootstrap session cannot enroll another credential. This prevents the low-privilege bootstrap path from becoming an account-management backdoor.

V1 intentionally does not implement additional-passkey enrollment yet. That operation should require an already strong Creator session and separate policy.

## Passkey login

Authentication options are available only on the localhost Creator surface and only when at least one active passkey exists.

A successful assertion produces a new short Creator session with:

- `authMethod=webauthn`;
- strong-session marker in the browser state model;
- Creator scopes granted by the existing strong-session host policy;
- no `stepUpAt` initially.

The previous bootstrap session does not become strong. The browser replaces its session token only after successful WebAuthn verification.

## Step-up

A strong session can request a separate WebAuthn ceremony with purpose `step-up`.

After signature verification, `CreatorSessionStore.markStepUp(...)` additionally requires the verifying `credentialIdHash` to match the credential that established the current session.

This prevents a different credential from silently elevating an existing session in V1.

High-risk Creator commands still need their normal explicit `confirmationId`. Step-up is necessary but not sufficient.

## Browser serialization

`creator.js` performs the WebAuthn binary/JSON boundary explicitly:

- server base64url challenge -> `Uint8Array`;
- server base64url user/credential IDs -> `Uint8Array`;
- `navigator.credentials.create()` registration response -> base64url JSON fields;
- `navigator.credentials.get()` assertion response -> base64url JSON fields.

The server does not accept private keys and the browser never receives server-side credential verifier internals beyond normal WebAuthn options.

## Creator Console state

`/api/state` now reports a bounded security summary:

- current session authentication method;
- whether session is strong;
- latest `stepUpAt` when present;
- total/active passkey count;
- whether first-passkey enrollment is currently permitted.

It does not return passkey public keys, raw audit payloads, bearer token values or private authenticator data.

## UI behavior

The local browser surface exposes:

- passkey login before bootstrap unlock;
- first-passkey enrollment only when a bootstrap session is active and no credential exists;
- explicit local enrollment checkbox;
- bootstrap-to-strong session replacement after a passkey exists;
- WebAuthn step-up for strong sessions;
- session strength/passkey count/step-up state.

If the browser is not on `localhost`, the UI explains that passkeys require the launcher-provided localhost URL.

## Security boundary

This milestone still does **not** add:

- non-loopback bind;
- HTTPS termination;
- public routing;
- tunnel configuration;
- recovery master password;
- arbitrary credential enrollment from bootstrap after the first credential;
- shell access;
- direct Core mutation;
- direct `main` writes;
- Human Review bypass.

A local malicious process is outside the trust assumptions of a purely loopback web UI and remains a deployment threat. Remote exposure therefore stays disabled until strong authentication is combined with a trusted HTTPS origin/tunnel and deployment controls.

## Next steps

1. add strong-session passkey inventory and controlled additional credential enrollment/revocation;
2. add explicit auth-event auditing separate from chat/command payload audit;
3. test real Android/Desktop browser authenticators in addition to synthetic cryptographic fixtures;
4. add rate/abuse controls before any remote-facing authentication endpoint;
5. design remote Creator deployment only after the local strong-auth path has been exercised end-to-end.
