# ARCA Node Manifest + Federation Introduction v0.1

## Purpose

This milestone gives an ARCA node a safe, self-describing way to introduce itself before federation enrollment.

The recipient must be able to answer from the introduction itself:
1. What is ARCA?
2. Which ARCA node is contacting me?
3. Why was I contacted?
4. What would accepting authorize?

Accepting an introduction only authorizes further federation evaluation. It does not authorize task execution, trust, admission, credential disclosure, or dispatch.

## Public node manifest

A deployable ARCA node SHOULD expose GET /.well-known/arca-node.json with application/json and format arca-node-manifest-v1.

The manifest contains ARCA description, node ID, Mesh Ed25519 public identity, public-key fingerprint, version, supported protocols, declared capabilities, trust model, response options, documentation references, and a SHA-256 manifest hash.

Fetching the manifest grants no trust.

## In-band explanation

The introduction itself contains a compact explanation of ARCA so that a machine agent, a human operator, or an access-gated system can understand the request without following another link.

## Trust invariants

Every valid v0.1 manifest declares:
- discoveryCreatesTrust = false
- capabilityGrantsPermission = false
- admissionRequiredBeforeDispatch = true
- arbitraryRemoteExecution = false
- consentRequiredForFederation = true

## Federation Introduction

Format: arca-federation-introduction-v1.

It contains a unique introduction ID, timestamps, sender node ID, identity ID and fingerprint, compact ARCA description, manifest hash/reference, discovery provenance, requested evaluation scopes, negative authority flags, and response options.

A valid v0.1 introduction MUST state:
- taskIncluded = false
- executionRequested = false
- trustGrantRequested = false
- admissionRequested = false
- authMaterialRequested = false

Changing any of these to true makes the introduction invalid.

## Response vocabulary

- accept-evaluation: continue discussing federation compatibility.
- decline: no further federation contact is requested.
- request-info: ask for more information.
- offer-endpoint: provide an official endpoint for federation evaluation.
- offer-auth-method: identify an owner-approved authentication/enrollment method.
- limit-scope: continue only under narrower scopes.

No response alone grants dispatch or execution authority.

## Signature model

The implementation reuses ARCA Mesh Ed25519 identity with two dedicated domains:
- arca.mesh.arca-node-manifest.v1
- arca.mesh.federation-introduction.v1

Domain separation prevents receipts or advertisements from being replayed as manifests or invitations.

The signature proves which key produced the message. It does not make that key trusted. Trust still requires explicit local enrollment/pinning.

## Human-readable rendering

The same validated object can be rendered for a human. The renderer repeats that no task, credentials, trust, admission, or execution are requested and shows node ID, public-key fingerprint, manifest hash/reference, requested scope, and accepted response vocabulary.

## Relationship to Federation V1

The new pre-enrollment flow is:

DISCOVERY
  -> INTRODUCTION
  -> REMOTE UNDERSTANDS ARCA
  -> REMOTE CONSENT / DECLINE / LIMIT
  -> ENROLLMENT
  -> TRUST PINNING
  -> VERIFICATION
  -> ADMISSION
  -> FEDERATION
  -> DISPATCH only if separately authorized

Existing Federation V1 remains authoritative for peer trust, transport binding, routing, and signed evidence.

## Network boundary

v0.1 does not send introductions to third parties. The validation workflow only proves construction, hashing, dedicated-domain signing, human rendering, verification, and rejection of authority escalation.

A future live-send milestone must define an allowed transport and require explicit authorization before contacting a remote owner or agent.
