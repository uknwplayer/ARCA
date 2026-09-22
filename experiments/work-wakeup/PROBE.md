# ARCA Work Access Check V2

Status: armed liveness probe.

Current probe token:

`ARCA-WAKE-20260922-WORK-ACCESS-CHECK-V2-001`

Machine correlation (metadata only):

- endpointId: `chatgpt-work`
- requestId: `work-access-check-20260922-v2-001`
- taskRef: `liveness-only`
- eventId: none
- repository: `uknwplayer/ARCA`
- pullRequest: `90`

If a configured ChatGPT Work GitHub event-trigger observes this commit, acknowledge once on this PR with:

- `WORK-WAKEUP-ACK`
- the exact probe token
- the observed head commit SHA
- a short statement that activation came from the GitHub event-triggered Work task

Stop after the acknowledgement. Do not execute any older dispatch, merge, mutate `main`, change repository settings, expose secrets, run arbitrary shell, or infer additional authority.
