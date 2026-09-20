# Creator Sovereignty Gate V1

## Status

Normative governance and runtime guard for the consolidation phase of ARCA.

## Priority rule

Until the Creator explicitly replaces this policy with a later policy version:

**Only the Creator may authorize changes to ARCA source code.**

Agents, models, Work, Machine Bridge workers, email commands, schedulers and future autonomous components may:

- inspect code;
- run tests/checks;
- produce analysis;
- prepare a proposal or patch in an isolated surface;
- request Creator authorization.

They may not treat any of those activities as authorization to mutate canonical source code.

## Autonomy versus sovereignty

ARCA is intended to become increasingly autonomous. During consolidation, autonomy is operational, not sovereign.

The system may continue work, route jobs, recover state, perform bounded analysis and prepare changes. The decision to apply a source-code mutation remains outside agent authority.

Human Review in general is not equivalent to Creator authorization. A future multi-human review mechanism may recommend a change, but cannot replace the Creator authorization requirement while this V1 policy is active.

## Runtime enforcement

Machine Bridge `ActionRegistry` now assigns each action a mutation class:

- `none` — ordinary bounded action;
- `code` — source-code mutation.

A `code` action cannot execute unless the registry was constructed with a trusted `creatorAuthorizationVerifier`.

The verifier must return all of:

- `authorized: true`;
- `creatorVerified: true`;
- `singleUse: true`;
- a non-empty `authorizationId`.

Supplying an authorization-looking object inside a job is not sufficient. The action runtime asks a host-controlled verifier. Without that verifier, execution fails closed with `ARCA_CREATOR_CODE_AUTHORIZATION_REQUIRED`.

A negative or malformed verdict fails with `ARCA_CREATOR_CODE_AUTHORIZATION_REJECTED`.

The default/global Machine Bridge registry has no Creator verifier, so it cannot execute a code-mutation action merely because an agent registered or requested one.

## Intended root of trust

The future production verifier should be backed by the Creator Control Plane:

```text
Creator
 -> authenticated Creator session
 -> explicit concrete code-change authorization
 -> step-up for high-risk operation
 -> single-use authorization receipt
 -> exact operation / request / target binding
 -> ActionRegistry verifier
 -> one bounded code mutation
```

The authorization receipt should eventually bind at minimum:

- authorizationId;
- requestId / taskId;
- exact action;
- repository;
- target branch/ref;
- expected target SHA;
- patch/plan hash;
- issue time and expiry;
- single-use state.

A broad statement such as “continue”, a previous authorization, an agent-generated approval, or ordinary Human Review must not satisfy that verifier.

## Email command boundary

Email is allowed to become an asynchronous Creator interface, but email text must first become a durable command request.

For code mutation:

`email reply -> authenticated/correlated request -> Creator review/step-up -> single-use code authorization -> mutation`

Email must never become `reply -> shell`, `reply -> merge` or `reply -> arbitrary patch`.

## GitHub limitation in the current repository plan

The repository is private and the current GitHub plan does not expose repository rulesets for this repository. Therefore V1 cannot honestly claim server-side GitHub enforcement against every actor that already possesses unrestricted repository write credentials.

This runtime gate protects ARCA-controlled execution paths. Operationally, agent credentials must not receive unrestricted direct-main write authority.

A future GitHub plan/environment that supports protected rulesets should add a required Creator-owned approval/check as defense in depth.

## Change of sovereignty policy

No agent may silently relax this document or reinterpret “Creator” as “any authenticated human”.

Replacing this policy requires an explicit Creator decision and a new versioned governance artifact.
