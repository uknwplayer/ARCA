# ARCA Publication Boundary V1

**Status:** implemented publication-preview boundary  
**Scope:** source repository export, not investigative-record publication  
**Authority:** Creator-only approval remains mandatory

## Purpose

The existing Privacy Classification + Publication Gate controls whether records/content may enter a public-output path.

Publication Boundary V1 controls a different object: **the ARCA source repository itself**.

It converts the private engineering repository into a clean preview tree that can later seed a separate public repository without carrying private Git history or operational state.

```text
private engineering repository
          |
          v
Publication Boundary V1
  allowlist + hard deny
  secret/private scan
  operational-state exclusion
          |
          v
clean preview tree
  + cryptographic manifest
          |
          v
Creator review/authorization
          |
          v
future public repository
```

V1 does **not** create a repository, change repository visibility, push a public branch, or publish anything.

## Fail-closed rule

The default action is `exclude`.

A path enters the preview only when it matches an explicit allow rule and is not rejected by:

1. an immutable hard-deny class;
2. the policy denylist;
3. the operational-workflow boundary;
4. secret-path detection;
5. content scanning;
6. known private-token fingerprints.

Deny wins over allow.

## Hard operational boundary

The following classes cannot be made public merely by broadening the JSON allowlist:

- `remote-jobs/**`;
- `remote-mesh/**`;
- `project-history/**`;
- `federation/**`;
- local runtime/output directories;
- Git metadata/history;
- secret/key file paths.

For GitHub workflows, only `.github/workflows/arca-ci.yml` is eligible in V1. Operational Machine Bridge, Mesh, federation, live-network and email workflows remain outside the public preview.

## Public source surface

V1 explicitly permits the source/product surface:

- Core/Agent/AIE/Workbench/Acquisition/PNCP packages;
- Machine Bridge source and specifications;
- schemas;
- scripts;
- test suites;
- public documentation;
- explicitly sanitized examples;
- package metadata;
- read-only CI;
- the Publication Boundary policy itself.

Future top-level files/directories do not enter automatically.

## Secret and private-data scan

Included text files are scanned for credential signatures including:

- GitHub token families;
- OpenAI-style secrets;
- Google API keys;
- AWS access keys;
- Slack tokens;
- PEM/private-key blocks.

The boundary also reuses the repository's one-way prohibited-token fingerprints used to prevent republication of previously excluded development-investigation identifiers. The fingerprints do not disclose the original values.

The intentional authorship attribution already permitted in the Machine Bridge Specification keeps its narrow per-file fingerprint exception.

V1 does not claim to discover every possible piece of personal data in arbitrary natural language. A clean scanner result is a technical control, not proof that every future file is legally publishable.

## Fresh-root history rule

`historyMode` is permanently `fresh-root-only` in V1.

The preview contains file bytes only. It does not contain `.git`, branches, commits, PR history or the historical operational graph of the private repository.

A future public repository should be initialized from this preview as a new Git root after Creator approval.

## Manifest

Every successful plan builds `arca-publication-manifest-v1` containing:

- source SHA;
- boundary version;
- policy hash;
- ordered file list;
- byte length and SHA-256 for every included file;
- deterministic `contentRootHash`;
- deterministic `manifestHash`;
- explicit flags that Git history was not included;
- explicit flags that Creator approval has not yet been recorded;
- explicit flags that no repository was created and no publication occurred.

`generatedAt` is metadata and is deliberately excluded from `manifestHash`, so the same source bytes/policy/source SHA reproduce the same manifest hash.

## Creator sovereignty

Publication Boundary V1 does not grant publication authority to an agent.

The generated preview is only a proposal artifact.

The transition:

```text
preview -> public repository
```

requires a separate explicit Creator decision tied to the concrete manifest/content root being approved.

An old approval, ordinary Human Review, agent consensus, CI success or an email command does not independently satisfy that authority requirement.

## Commands

Dry-run/check:

```bash
npm run publication:check
```

Generate an isolated preview:

```bash
npm run publication:preview
```

Default output:

```text
.arca-publication-preview/
  <clean repository tree>
  PUBLICATION_MANIFEST.json
  PUBLICATION_BOUNDARY_REPORT.json
```

The output directory is ignored by Git.

## CI

The normal ARCA repository check runs `publication:check`.

Pull-request and manual CI runs also generate and upload a short-lived `arca-publication-preview-<run-id>` artifact. This permits review of the exact clean tree before any public repository exists.

The artifact is a preview only. Uploading it to a private GitHub Actions run is not public publication.

## Current non-goals

V1 does not:

- change the visibility of `arca-core-v1-foundation`;
- create the future public repository;
- select an open-source license;
- rewrite private Git history;
- publish `arca-runtime`;
- publish Machine Bridge queues/results/mailboxes;
- copy repository secrets;
- authorize agents to merge or publish without the Creator.
