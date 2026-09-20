# Live A2A Runtime Reachability v0.1

## Goal

Prove that an autonomously discovered A2A runtime is reachable over HTTPS without invoking an A2A RPC method, sending a task, authenticating, or granting trust.

This stage is intentionally weaker than protocol verification.

```text
Candidate Registry
  -> exact authorized HTTPS endpoint
  -> DNS resolution
  -> reject private / loopback / link-local / reserved addresses
  -> pin one public IP into TLS connection
  -> HEAD with zero-byte body
  -> observe HTTP response
  -> STOP
```

## Why HEAD

A2A RPC methods are sent using HTTP POST to the URL declared by the Agent Card. This validation deliberately does not send JSON-RPC.

A returned HTTP status, including 4xx such as 405, is sufficient to prove transport reachability. It does not prove A2A protocol behavior.

## SSRF / DNS rebinding boundary

Before network contact:

- endpoint must use HTTPS;
- endpoint origin must be explicitly authorized by the host;
- credentials, query strings, and fragments are refused;
- local-style hostnames are refused;
- DNS is resolved before the request;
- every returned address must be public;
- DNS result count is bounded;
- one validated address is pinned into the HTTPS request lookup;
- the observed remote address must match the pinned address;
- TLS certificate validation remains enabled.

## Request boundary

The runtime receives exactly one transport probe:

- method: `HEAD`;
- request body: 0 bytes;
- no `Authorization` header;
- no JSON-RPC payload;
- no A2A method;
- no task or message;
- redirects are not followed.

## Result semantics

A successful run may set:

```text
reachabilityState = reachable-http-response
runtimeContacted = true
httpResponseReceived = true
```

It MUST still preserve:

```text
protocolVerified = false
capabilitiesVerified = false
identityVerified = false
trustGranted = false
admissionGranted = false
dispatchAuthorized = false
```

A successful run proves only HTTPS transport reachability for the exact endpoint bound to the recorded candidate provenance.

## Redirect classification

Redirects remain non-following observations.

When a 3xx response includes `Location`, ARCA classifies it without opening a second connection:

- resolves relative references against the original endpoint;
- records whether the target is HTTPS;
- records same-origin versus cross-origin;
- records target origin and path;
- records whether query or fragment data exists;
- hashes query data instead of emitting it in clear text;
- does not persist the raw `Location` value;
- marks cross-origin targets as requiring explicit new origin authorization;
- never upgrades protocol, identity, capability, trust, admission, or dispatch state from a redirect.

`redirectFollowed` remains `false`.

## Access-gate classification

A cross-origin redirect can be classified as an access gate without following it.

For the Cloudflare Access pattern, ARCA requires both:

- target hostname ending in `.cloudflareaccess.com`;
- target path beginning with `/cdn-cgi/access/login/`.

The resulting state is:

```text
state = reachable-but-access-gated
provider = cloudflare-access
enrollmentRequired = true
publicCredentialDiscovered = false
authenticationAttempted = false
credentialPresented = false
redirectFollowed = false
```

ARCA does not invent, scrape, guess, reuse, or request credentials automatically. Future credentials are acceptable only when they are explicitly owner-issued/owner-approved or when the owner publishes a public A2A endpoint.

The runtime Agent Card's declared authentication scheme and the outer access gate are separate layers and must be verified separately.
