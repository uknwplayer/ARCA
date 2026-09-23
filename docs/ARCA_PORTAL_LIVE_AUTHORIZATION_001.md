# ARCA — Portal Live Authorization 001

Status: **ONE-SHOT AUTHORIZATION ADAPTER / REVIEWED REVISION PINNED**.

This adapter exists only because the current ChatGPT GitHub connection cannot invoke
`workflow_dispatch` directly. It does not change the M4 probe implementation.

Trigger requirements are all mandatory:

- issue #97;
- issue state `open`;
- comment author `uknwplayer`;
- exact comment body `ARCA_PORTAL_LIVE_AUTHORIZATION_001_EXECUTE`.

The job checks out the already reviewed canonical revision:

`3e05951fa543f359451208cf410705a0dcfb34e1`

and supplies the already reviewed scope hash:

`4a2c6b3809f6b17ae5ca5e94c965ef02e148a6fe31e429e889c71f97d183b8a3`

The raw public document code is not committed. It must already exist in
`ARCA_PORTAL_DOCUMENT_CODE`. The probe itself remains responsible for exact
scope matching, custody preflight, one bounded GET, encrypted persistence and
sanitized proof.

If the document secret, API key, custody passphrase or private-vault settings
are absent/mismatched, preflight must fail before the Portal transport runs.

After the single authorized run is resolved, this adapter should be removed
or disabled and issue #97 closed.
