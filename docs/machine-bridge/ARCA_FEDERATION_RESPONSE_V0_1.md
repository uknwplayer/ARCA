# ARCA Federation Response v0.1

## Purpose

This milestone completes the consent half of the ARCA introduction handshake.

A recipient can answer an ARCA Federation Introduction without that answer being treated as trust, admission, dispatch permission, or execution permission.

## Response format

`arca-federation-response-v1`

Supported decisions:

- `accept-evaluation`
- `decline`
- `request-info`
- `offer-endpoint`
- `offer-auth-method`
- `limit-scope`

v0.1 records the decision only. Transport details, endpoint negotiation, access methods, and enrollment remain separate later stages.

## Binding

Every response is bound to:

- the introduction ID;
- SHA-256 of the exact introduction object;
- responder node ID;
- optional responder Mesh identity;
- response SHA-256.

A responder identity is optional so a previously unknown participant can decline or express intent before adopting ARCA Mesh identity.

## Consent semantics

`evaluationConsent=true` only for:

- `accept-evaluation`
- `limit-scope`

Every valid response must preserve:

```text
trustGranted = false
admissionGranted = false
dispatchGranted = false
executionGranted = false
```

A response therefore changes only the evaluation state.

## Signed responses

When the responder already has an ARCA Mesh Ed25519 identity, the response can be signed in the dedicated domain:

`arca.mesh.federation-response.v1`

Signature validity is not equivalent to trust. Trust still requires explicit enrollment and key pinning.

## Flow

```text
DISCOVERY
  -> INTRODUCTION
  -> REMOTE UNDERSTANDS ARCA
  -> RESPONSE
       accept-evaluation
       decline
       request-info
       offer-endpoint
       offer-auth-method
       limit-scope
  -> only then, if appropriate:
       ENROLLMENT
       VERIFICATION
       ADMISSION
       FEDERATION
```

## Network boundary

This milestone performs no third-party network contact.

The validation workflow creates ephemeral local identities and verifies response creation, hashing, signing, introduction binding, and fail-closed authority invariants.
