# ARCA repository.verify-ref V0.1

**Status:** bounded verification action  
**Execution host:** ChatGPT Work or another Execution Endpoint implementing the contract  
**GitHub Actions:** not required

## Purpose

`repository.verify-ref` gives ARCA one fixed read-only verification action for an exact pull-request head. It is not a generic shell endpoint.

Input is exactly:

```json
{
  "repository": "owner/repository",
  "pullRequest": 187,
  "expectedHeadSha": "40-hex-commit-sha"
}
```

No command, script, environment variable, path, URL or free-form instruction is accepted from the caller.

## Fixed command set

After resolving the PR and proving that its current head is exactly `expectedHeadSha`, the executor materializes that commit into an ephemeral detached workspace and may run only:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
```

The install phase disables package lifecycle scripts. `npm test` and `npm run check` intentionally execute repository code, so this action must be restricted to explicitly allowed repositories and exact approved SHAs. The execution environment must not expose repository write credentials or unrelated secrets to the child processes.

## Result evidence

The result records:

- repository, PR and expected/observed head SHA;
- Node/npm versions, with Node.js 22.18.0 or newer required;
- exact argv for each fixed command;
- exit code and SHA-256 of stdout/stderr for each command;
- detached-checkout assertion;
- repository-mutation assertion;
- arbitrary-command assertion.

The verifier rejects a changed head, reordered/tampered command set, missing log hashes, repository mutation or any report of arbitrary command execution.

## Security boundary

This action verifies code; it does not authorize code.

It may execute code contained in `npm test` and `npm run check`. Therefore it is not safe for arbitrary untrusted repositories merely because the command strings are fixed. The canonical Work controller must configure an explicit repository allowlist.

A successful result is bounded verification evidence. GitHub comment transport still does not cryptographically prove a separate Work identity.

The action cannot merge, push, modify `main`, change repository settings or accept natural-language shell commands.
