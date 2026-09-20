# Creator Reasoning Adapter V1

## Objective

Creator Reasoning Adapter V1 connects the authenticated local Creator Console to the provider-independent Reasoning Capability Contract without silently enabling external AI services.

The new path is:

```text
Creator Console
  -> Creator Control Plane / chat.send
  -> Creator Reasoning Adapter
  -> verified reasoning capability
  -> Secure Reasoning Transport Gate
  -> ReasoningProviderRegistry
  -> provider
  -> bounded reasoning result
  -> Creator Console
```

The existing Agent Gateway adapter remains available and unchanged. This is an explicit alternative integration path.

## Default privacy posture

Creator Chat is treated conservatively as a private communication.

Each message receives a fresh Privacy Classification with:

- `sourceType=user-provided`;
- `subjectType=mixed`;
- `privacyClass=restricted`;
- `privateCommunication=true`.

The adapter sends only:

- the Creator message as the reasoning instruction;
- `requestId`;
- a deterministic hashed `payloadId`;
- `channel=arca-creator-console`.

It does not send:

- `ARCA_HOME`;
- local filesystem paths;
- Creator session tokens;
- bootstrap codes;
- passkey material;
- Creator subject identifier.

The Secure Reasoning Transport Gate binds the exact outbound standardized request to this classification.

## Verified capability requirement

The adapter refuses to call a provider unless the Capability Registry has a current `reasoning` capability with status `verified`.

It also requires the current provider descriptor to match the Capability Passport on:

- provider/model;
- reasoning contract label;
- transport ID;
- transport hash.

A provider or transport change therefore invalidates the previous trust state rather than silently inheriting it.

## Local provider behavior

A verified local reasoning provider may be used from the normal authenticated Creator Chat session.

The adapter still preserves:

- `humanReviewRequired=true`;
- `coreMutationPerformed=false`;
- output privacy reclassification requirement.

Local reasoning does not imply Core authority.

## External provider behavior

External Creator reasoning is disabled by default.

A private external call requires all of the following:

1. `allowExternal=true`;
2. `allowPrivateExternalReasoning=true`;
3. `externalProviderIdentityVerified=true`;
4. a current verified `reasoning` Capability Passport;
5. a strong Creator session using WebAuthn/hardware-key;
6. a transport profile accepted by Secure Reasoning Transport Gate.

This means a local bootstrap session cannot send Creator private chat to an external provider.

The host-level identity assertion is intentionally separate from the reasoning capability verification. Future signed Mesh identity/attestation should replace this manual assertion.

## Repository-backed transport

Creator Chat is classified as restricted/private communication.

Therefore repository-backed reasoning is rejected by the Secure Reasoning Transport Gate even when every external opt-in flag is enabled.

This prevents the current GitHub-backed durable mailbox from becoming an accidental storage mechanism for private Creator conversations.

## Private-direct transport

A verified private-direct provider can process Creator Chat only after explicit host authorization and strong Creator authentication.

The transport must still satisfy the Secure Reasoning Transport Gate:

- TLS or stronger;
- no relay payload visibility;
- no durable payload persistence declared by the transport.

This policy does not make claims about provider-side retention beyond the ARCA transport contract. Provider terms/configuration remain a deployment concern.

## Workbench composition

The Workbench exports:

`createCreatorConsoleWithReasoningProvider(...)`

through:

`@arca/workbench/creator-reasoning`

The host supplies:

- `ReasoningProviderRegistry`;
- `CapabilityRegistry`;
- explicit reasoning adapter options.

The standalone `arca-creator` launcher remains unchanged and does not invent or auto-connect a provider.

## Security boundaries

Creator Reasoning Adapter V1 does not:

- auto-select a provider;
- auto-enable an external AI;
- treat registration as verification;
- bypass Secure Reasoning Transport Gate;
- expose private chat through GitHub mailbox;
- grant shell, Machine Bridge actions or Core mutation;
- publish model output;
- bypass Human Review;
- weaken local-only Creator Console networking.

## Next evolution

The next security dependency for distributed private reasoning is cryptographic Mesh identity plus an enforceable end-to-end encrypted envelope.

Until then:

- local reasoning is supported;
- explicitly verified private-direct reasoning is supported;
- repository-backed private reasoning is prohibited;
- opaque-relay private reasoning remains fail-closed.
