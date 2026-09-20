# Live ARCA Federation Introduction Delivery v0.1

## Purpose

This milestone performs the first bounded ARCA-to-remote introduction attempt for a previously discovered agent runtime.

It is not an A2A task and does not use JSON-RPC.

## Request

The delivery sends exactly one HTTPS POST to the exact authorized runtime endpoint.

Content type:

`application/vnd.arca.federation-introduction+json`

The body contains only:

- the ARCA Node Manifest;
- the Federation Introduction;
- a notice that the message contains no task and grants no authority.

The live validator uses a fresh pilot identity for this first transport proof. It must not be interpreted as a permanently enrolled ARCA node identity.

## Network controls

Before transmission:

- network is off by default in the reusable module;
- exact HTTPS origin authorization is required;
- credentials, query strings, and fragments are refused by target normalization;
- local-style hostnames are refused;
- DNS is resolved before contact;
- all returned addresses must be public;
- one validated public IP is pinned into the TLS request;
- the observed remote address must match the pinned address;
- TLS certificate validation remains enabled;
- redirects are never followed.

## Authority boundary

The request contains no A2A JSON-RPC method and no task.

Every result preserves:

```text
authenticationSent = false
jsonRpcSent = false
taskSent = false
recipientAcknowledged = false
protocolVerified = false
identityVerified = false
trustGranted = false
admissionGranted = false
dispatchAuthorized = false
executionAuthorized = false
```

An HTTP 2xx proves only that the HTTP endpoint accepted the request at transport level. It is not treated as recipient consent or protocol verification.

## Redirect and access-gate behavior

A 3xx response is classified with the same redirect and access-gate logic used by the runtime reachability probe.

If Cloudflare Access intercepts the request, the expected state is:

`access-gated-before-recipient`

The redirect is recorded in sanitized classified form and is not followed.

No access material is supplied and no gate is bypassed.

## Logging

The live workflow does not print or persist the raw delivery body.

It records:

- introduction ID;
- manifest hash;
- request body SHA-256;
- request byte count;
- HTTP status;
- DNS/pinned-address evidence;
- redirect/access-gate classification;
- delivery state.

## Manual authorization

The GitHub Actions workflow is manual and requires `confirm_send=true`.

Leaving the checkbox disabled causes the validator to fail before network contact.
