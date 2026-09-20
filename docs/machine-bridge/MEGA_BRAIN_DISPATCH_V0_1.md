# Mega Brain Dispatch Adapter v0.1

## Purpose

This adapter is the ARCA Core execution boundary for Mega Brain v0.2 transport jobs.

It defines one closed Machine Bridge action:

`mega-brain.dispatch`

The action accepts only a structured `arca-mega-brain-task-v1` envelope and returns only a structured `arca-mega-brain-dispatch-result-v1` object.

## Disabled by default

The default Machine Bridge Action Registry does not register this action automatically.

A host must explicitly call:

```js
registerMegaBrainDispatchAction(registry,{executor})
```

and provide a concrete executor.

This prevents Mega Brain transport support from becoming an implicit remote-execution capability.

## Machine Bridge relationship

Mega Brain jobs use the existing V3 job contract:

```json
{
  "format": "arca-remote-job-v3",
  "protocolVersion": 3,
  "action": "mega-brain.dispatch",
  "requires": ["mega-brain-task", "...task capabilities..."],
  "params": {
    "task": {
      "format": "arca-mega-brain-task-v1"
    }
  }
}
```

Machine Bridge continues to own:

- protocol validation;
- worker capability checks;
- claims and leases;
- timeout handling;
- durable results;
- request/job correlation.

Mesh/Federation layers continue to own:

- peer routing;
- route receipts;
- signed identities;
- explicit trust;
- federation health;
- transport credential boundaries.

## Validation

The adapter rejects:

- unknown task/result fields;
- malformed IDs;
- oversized objective/text fields;
- duplicate claims/evidence IDs;
- mission/task/node mismatches;
- arbitrary action names hidden in follow-up objects;
- extra `truth` or authority fields.

Claims remain claims. The adapter does not promote a remote statement into truth.

## Executor contract

The configured executor receives:

```text
task
job
worker
signal
```

The executor may invoke a locally authorized agent/worker capability, but it must return the bounded dispatch-result contract.

The transport payload itself cannot select an arbitrary Machine Bridge action or shell command.

## Integration with ARCA Mega Brain

The matching Python adapter is deployed as a separate Mega Brain integration component and is intentionally not bound to an owner-specific repository in the public specification.

Mega Brain compiles internal Task objects into V3 jobs and decodes the terminal result back into internal Result objects.

Both sides require exact mission/task/node correlation.

## Current milestone boundary

This adapter proves protocol interoperability and the closed execution boundary in ARCA Core.

It does not by itself prove a live cross-host Mega Brain mission. A later live validation must provision at least one remote worker with:

- `mega-brain-task` capability;
- an explicitly registered Mega Brain executor;
- valid ARCA Mesh/Federation transport and identity configuration.
