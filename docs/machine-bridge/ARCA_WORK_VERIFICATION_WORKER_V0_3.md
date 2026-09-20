# ARCA Work Verification Worker V0.3

**Status:** bounded verification extension  
**Builds on:** Execution Endpoint V0.1 + Work Machine Bridge Worker V0.2  
**Action:** `repository.verify-ref`

## Goal

Use an event-triggered ChatGPT Work as a verification worker when GitHub-hosted Actions cannot allocate a runner, without turning Work into a generic shell or code-authority principal.

The action accepts only an exact repository, pull request number and expected 40-hex head SHA. The caller cannot supply shell commands.

## Runtime sequence

```text
Machine Bridge V3 job
        |
        v
repository.verify-ref
        |
        +--> repository allowlist
        +--> exact expectedHeadSha
        +--> signed Work dispatch envelope
        +--> isolated PR event wake
                         |
                         v
                  ChatGPT Work
                         |
                resolve exact PR head
                         |
               detached ephemeral tree
                         |
              fixed verification commands
                         |
                ARCA-WORK-RESULT-V1
                         |
              correlation + evidence check
```

## Fixed commands

Only this ordered command set is valid:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
```

There is no `command`, `script`, `args`, free-form shell or environment field in the action input.

## Why this is still code execution

The fixed command list does not make arbitrary pull requests safe. `npm test` and `npm run check` execute code from the target ref.

Therefore canonical dispatch requires an explicit repository allowlist and an exact expected head SHA. The Work execution environment should expose no repository-write credential or unrelated secret to child processes.

This is intended for Creator-approved ARCA refs, not arbitrary third-party contributions.

## Passing evidence

A completed verification must report:

- observed head equals expected head;
- detached workspace;
- no target repository mutation;
- Node/npm versions;
- exact argv for all three commands;
- integer exit codes;
- SHA-256 of stdout and stderr for each command;
- `allCommandsPassed:true`;
- `arbitraryCommandExecuted:false`;
- `repositoryMutationObserved:false`.

Any command mismatch or head movement fails closed.

## Governance

Passing verification is evidence, not merge permission.

The action cannot:

- merge or push;
- mutate `main`;
- change repository settings;
- access a generic Creator authorization channel;
- authorize a code mutation;
- execute a caller-provided shell command.

The existing rule remains:

`verification != authorization`.
