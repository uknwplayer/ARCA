# ARCA Status Email Channel v0.1

## Goal

Deliver a periodic repository-generated ARCA status report without depending on ChatGPT Work being available.

The GitHub Actions workflow is the producer. Gmail is transport only.

## Schedule

The initial workflow runs once per day at 12:00 UTC (09:00 BRT) and also supports manual `workflow_dispatch`.

Changing the cadence is a repository configuration change, not an AI-memory dependency.

## Report contents

The report currently includes:

- canonical `main` SHA;
- open pull requests;
- recent workflow state;
- current canonical checkpoint reference;
- explicit status of PR #141 / `WORK-WAKEUP-PROBE-V1`;
- a bounded attention hint;
- optional reply token for the future command channel.

The report is also stored as a short-lived Actions artifact and copied into the workflow summary.

## Gmail delivery

No Gmail credential is committed to the repository.

Repository configuration:

### Actions secrets

- `ARCA_EMAIL_USER` — Gmail sender address;
- `ARCA_EMAIL_APP_PASSWORD` — Gmail App Password, never the normal account password;
- `ARCA_EMAIL_COMMAND_KEY` — optional random secret (32+ bytes recommended) used only to derive report reply tokens.

### Actions variable

- `ARCA_EMAIL_TO` — report recipient address.

If Gmail delivery variables are absent, the workflow still generates the report and succeeds, but skips email delivery.

The ChatGPT Gmail plugin is independent from these repository credentials. Installing the plugin does not expose its OAuth token to GitHub Actions.

## Reply-to-command design

Replying to a status email can become an ARCA input channel, but v0.1 deliberately does not ingest or execute replies.

The safe design is:

```text
status email
  -> per-report HMAC reply token
  -> reply received
  -> sender + token + thread correlation
  -> bounded command parser
  -> durable Command Request / Human Review Queue
  -> policy/review
  -> continuation
```

A reply must never map directly to shell, merge, arbitrary workflow dispatch or unrestricted natural-language execution.

The first command receiver should therefore create an auditable request only. Existing Human Review Queue / Review-Gated Continuation can then decide whether a requested continuation is authorized.

## Why a token

Email `From:` alone is not sufficient authorization. The future receiver should require a token derived from a repository secret and the exact report identity.

The current report generator can include this token when `ARCA_EMAIL_COMMAND_KEY` is configured.

The token is not an execution credential. It is only one correlation/authentication factor for a future review-gated command intake.

## Security boundaries

- no OAuth token from ChatGPT is copied into GitHub;
- no normal Gmail password is used;
- report generation works even when mail delivery is disabled;
- repository secrets are never printed into the report;
- email replies cannot execute anything in v0.1;
- the Work wake-up probe remains independent and inert unless explicitly armed.
