# ARCA Creator Control Plane V0

**Status:** backend policy foundation / browser console design

## Purpose

The Creator Control Plane (CCP) is the private control surface for the ARCA creator/operator to communicate directly with `arca-primary` without depending on ChatGPT or any specific AI product UI.

The intended user experience is a small web/PWA console that can be opened from a browser or mobile device and exposes two surfaces:

- **Creator Chat** — natural-language request/response with `arca-primary`, correlated through the existing Machine Bridge `requestId` path;
- **Creator Console** — structured status, review, proposal, network-authorization, agent-management and emergency-freeze operations.

The console is not a hidden backdoor and does not grant arbitrary shell/root authority.

## Security model

A secret URL is not an authentication mechanism. The route may be unadvertised for convenience, but security MUST remain intact even if the exact URL is public.

The recommended root of trust is asymmetric and phishing-resistant:

1. WebAuthn/passkey or a physical hardware authenticator for normal Creator login;
2. short-lived Creator sessions, maximum one hour;
3. recent step-up authentication for high-risk operations;
4. an offline recovery credential used only for narrow recovery/read/freeze actions;
5. no static bearer token, API key or master secret embedded in the URL, browser bundle, repository, logs or localStorage.

On supported mobile devices, a hardware-backed passkey can provide the normal login path. A removable hardware key can be an additional or backup authenticator.

The host that terminates WebAuthn is responsible for validating the cryptographic assertion. ARCA Core receives only an authenticated session descriptor/fingerprint, never the private key.

## Root authority versus root execution

`Creator` is a policy role, not unrestricted machine root.

Creator authority can approve or initiate operations that already exist in a closed registry, but it does not create a generic `shell.execute`, arbitrary filesystem write, arbitrary network egress or direct `main` mutation capability.

The V0 Creator Action Registry is:

- `chat.send` -> `creator.chat` -> low risk;
- `state.read` -> `creator.read` -> low risk;
- `review.decide` -> `creator.review` -> elevated risk;
- `change.propose` -> `creator.propose-change` -> elevated risk;
- `network.authorize` -> `creator.authorize-network` -> high risk;
- `agents.manage` -> `creator.manage-agents` -> high risk;
- `system.freeze` -> `creator.freeze` -> high risk.

Unknown commands fail closed.

## High-risk gates

High-risk operations require all of:

- the matching Creator scope;
- an active short-lived session;
- recent step-up authentication;
- an explicit confirmation identifier;
- audit recording.

The browser should render the concrete action before confirmation. Natural-language text alone must not be treated as implicit confirmation of a high-risk operation.

## Recovery credential

Recovery is deliberately weaker in breadth even if it is stronger in identity assurance.

A recovery-authenticated session may read system state and freeze the control plane, but it cannot manage agents, authorize new network access or perform ordinary chat/proposal work. Recovery exists to regain or contain access, not to bypass normal controls.

The recovery credential should be stored offline. It should not be copied into a note app, source repository, environment file or browser storage.

## Creator Chat flow

Expected flow:

```text
Browser/PWA
  -> WebAuthn challenge
  -> short-lived Creator session
  -> chat.send
  -> arca-primary
  -> Capability Planner / Machine Bridge / Mesh as needed
  -> correlated result by requestId
  -> Creator Chat
```

Closing the browser must not cancel a durable request. The console can reconnect and recover the result using `requestId`.

## Creator Console flow

The console should expose structured operations instead of a raw terminal, for example:

```text
STATUS
CHECKPOINT
ACTIVE JOBS
HUMAN REVIEW QUEUE
PROPOSE CHANGE
RUN SAFE CHECKS
AUTHORIZE NETWORK (step-up)
MANAGE AGENT (step-up)
FREEZE CONTROL PLANE (step-up)
```

A future local developer profile may expose additional tools, but arbitrary shell should remain a separate host capability and never be implied by Creator identity alone.

## Session contract

The backend foundation uses `arca-creator-session-v1` with:

- opaque `sessionId`;
- opaque creator `subject`;
- explicit scopes;
- auth method (`webauthn`, `hardware-key` or `recovery`);
- SHA-256 credential identifier fingerprint only;
- `issuedAt`, `expiresAt` and optional `stepUpAt`.

Raw authentication secrets are rejected.

## Audit trail

Creator decisions produce `arca-creator-audit-v1` events chained by SHA-256. The audit event stores a digest of command payload instead of the raw payload, reducing accidental persistence of private chat/context.

Audit integrity is evidence of sequence/tamper detection, not a substitute for external timestamping or signed identity. Future versions may sign events and periodically anchor an aggregate Merkle root.

## Deployment profiles

### Local-only

Safest initial profile. The console listens on loopback or a private device-local channel and is reachable only from the device running ARCA.

### Private remote access

Recommended for mobile access when the ARCA host runs elsewhere. Put the console behind an authenticated private tunnel/VPN. WebAuthn remains required even inside the private network.

### Public HTTPS endpoint

Possible, but highest exposure. Requires TLS, WebAuthn, strict origin policy, CSRF protection, rate limiting, lockout/backoff, secure cookies, CSP, no credential material in browser storage and hardened reverse-proxy/runtime configuration.

The public hostname or route is not a secret.

## Relationship with existing ARCA components

- `arca-primary` remains the single internal principal agent;
- Agent Gateway still controls external models by capability;
- Credential Vault/Broker still owns provider credentials;
- Machine Bridge/Direct Call/Mesh provide durable request execution;
- Human Review remains separate from execution;
- Creator Control Plane authenticates and authorizes the human operator; it does not bypass those layers.

## Non-goals in V0

V0 does not implement:

- a public hosted login service;
- raw shell access;
- direct writes to `main`;
- storage of a master password/private key;
- bypass of Human Review requirements;
- automatic privilege expansion;
- recovery-key based unrestricted control;
- provider-specific authentication.

## Implementation phases

1. **V0 (this foundation):** session/scopes/action policy, step-up gates and hash-chained audit tests.
2. **V1:** WebAuthn adapter + local/private HTTP API + minimal Creator Chat/Console PWA.
3. **V1.1:** reconnectable conversations/jobs by `requestId`, device/session management and revocation.
4. **V2:** signed audit events, optional hardware-key-only high-risk mode and independent remote deployment hardening.

## Security conclusion

The idea is viable and can be made substantially safer than a static "master key" or hidden URL. The critical rule is that the creator credential proves identity and unlocks policy-scoped authority; it must never become a universal plaintext secret that directly executes arbitrary code.
