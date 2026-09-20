# ARCA Executor Mesh — Live Admission Proof 001

Status: VERIFIED / LAB_ADMITTED  
Source main SHA: `0b58bf4949cb2fb9e538e82dd5b4b85cadfb246a`

This proof records the first live execution of the public ARCA Executor Mesh on the canonical public repository.

## Linux

- executor: `github-arca-linux`
- request: `arca-linux-smoke-001`
- queue branch: `executor-queue`
- dispatch commit: `aefdd6b44220e17f5fa80a0c4361e750dbff5945`
- workflow run: `35517312302`
- conclusion: `success`
- request SHA-256: `c86814746690fd8e1d3e8d2bbe36c29d2888058da78bc2294138b59aca583b66`
- semantic result SHA-256: `e0af8c9dbbd6d2a335e2d2d58c48647ed48e38d3a02e53be1baa612810482b43`
- result file SHA-256: `a3dd370d0a105bf15186ee0a66ca84c27326eaa3459fb55fd1dfe5e9ca2b78d0`
- artifact ID: `10606874398`
- artifact digest: `sha256:d0238b49f89088f6bcb0ac21bab6d25e895ed328088dcc3e3e7046601d5bbed2`
- observed platform: `Linux-6.17.0-1022-azure-x86_64-with-glibc2.39`
- Python: `3.12.14`
- profile result: exit code 0; runtime/filesystem checks passed.

The downloaded artifact was independently decoded. The semantic `result_sha256` was recomputed over the canonical unsigned result payload and matched the claimed value.

## Windows

- executor: `github-arca-windows`
- request: `arca-windows-smoke-001`
- queue branch: `executor-queue`
- dispatch commit: `a50a3d2a3ece9b64047e4c5d1dd933cb5368a9ac`
- workflow run: `35517392251`
- conclusion: `success`
- request SHA-256: `a1164aff7d82ac85ff1945eda1d8a74df8432fea726efcc8d5b549069e06bdce`
- semantic result SHA-256: `2bb87be529a611d051acb1e6e9924c723eb60d1849d4664688748fa5f457275e`
- result file SHA-256: `c141e445afb4a38c89fbff5b1f8833ef79f1c569c6ad07aa53c882d724a405a2`
- artifact ID: `10606753323`
- artifact digest: `sha256:2c6939d79640aa42498bed72e4af5608cf129b13d680c1b4ad29198a6c321b23`
- observed platform: `Windows-2025Server-10.0.26100-SP0`
- Python: `3.12.10`
- profile result: exit code 0; runtime/filesystem checks passed.

The downloaded artifact was independently decoded. The semantic `result_sha256` was recomputed over the canonical unsigned result payload and matched the claimed value.

## Admission conclusion

Both executors demonstrated the declared bounded public execution path on the canonical ARCA public repository.

The evidence supports:

```text
github-arca-linux
  trust_state: VERIFIED
  admission_state: LAB_ADMITTED

github-arca-windows
  trust_state: VERIFIED
  admission_state: LAB_ADMITTED
```

This is **lab admission only**. It does not grant either runner:

- Core promotion authority;
- policy mutation authority;
- secret access;
- private-job eligibility;
- arbitrary shell authority;
- trust outside the capabilities actually proven.

The scheduler remains responsible for capability, privacy, secret, budget, availability and trust filtering before dispatch.
