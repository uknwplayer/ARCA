# ARCA Executor Mesh — Satellite Federation Proof 001

Status: integration candidate with live cross-repository evidence.

## Purpose

This proof demonstrates that the canonical public ARCA can treat another public repository as an independent execution domain rather than merely adding more runners to the same repository.

Execution domains:

```text
canonical-arca
  ├─ github-arca-linux
  └─ github-arca-windows

arca-execution-satellite
  ├─ github-satellite-linux
  └─ github-satellite-windows
```

The satellite remains an execution substrate. It does not receive policy, admission or Core-promotion authority.

## Cross-repository Linux proof

- target: `uknwplayer/arca-execution-satellite`
- request: `arca-mesh-satellite-linux-001`
- queue path: `queue/requests/arca-mesh-satellite-linux-001.json`
- dispatch commit: `282367be5fc9a510493b5c0416551cf1b7c1aec7`
- run: `35517780183`
- conclusion: success
- request SHA-256: `4f2332d12b20633039316342fc963c6572b5d0fdb7a72431496db76a1e137b01`
- semantic result SHA-256: `7f2ca5fd394f877ffff3c75507a720d5195703eb5e3e27c9c030a001a95a1d5a`
- result file SHA-256: `2b17b52e24943c24adf5cad857cebc737d8ab026887d4be3c6f6690d02f8b1cd`
- artifact ID: `10607601177`
- artifact digest: `sha256:6c8eb6df3009e5d424cbd23c91c69210d4dfc47582b591b06c437202541afd7c`

The downloaded result artifact was decoded and its semantic hash independently recomputed; it matched the claimed value.

## Cross-repository Windows proof

- target: `uknwplayer/arca-execution-satellite`
- request: `arca-mesh-satellite-windows-001`
- queue path: `queue/windows/requests/arca-mesh-satellite-windows-001.json`
- dispatch commit: `80d92d9f78edc0b42300265f3bb02c5dfad147b5`
- run: `35517808108`
- conclusion: success
- request SHA-256: `51734fdf7b2fecf13e5563974b16d7964d95885345b3087898592fb1326f5e77`
- semantic result SHA-256: `1263336f2d136d393209766dfdf1099c9757f192d16917ee1055f993b6a63565`
- result file SHA-256: `00b5da3bbcef201b9610fabbb8f87b405b639289cfb829a3867dae4d9bd1919b`
- artifact ID: `10607925580`
- artifact digest: `sha256:0961e898b4d94fb947d0f98fd656d2a18084db1fc1981cfb661c4a1bd4d11cff`

The downloaded result artifact was decoded and its semantic hash independently recomputed; it matched the claimed value.

## Routing model

Each executor now declares `network_hops`.

- canonical ARCA runners: 0 hops;
- satellite runners: 1 hop.

The scheduler applies a deterministic network-hop penalty after hard eligibility filtering. This makes a local equivalent executor preferable without preventing fallback.

Expected behavior:

```text
public Linux job
  ├─ local Linux healthy → github-arca-linux
  └─ local Linux unavailable → github-satellite-linux

public Windows job
  ├─ local Windows healthy → github-arca-windows
  └─ local Windows unavailable → github-satellite-windows
```

The satellite currently exposes only `smoke` and `python-unit` profiles. It is therefore not eligible for ARCA `node-test` or `node-check-public` jobs.

## Security boundary

Both satellite executors remain:

- public-only;
- secret-free;
- bounded-profile only;
- without arbitrary shell input;
- without Core mutation/promotion authority.

This creates redundancy across execution domains without transferring ARCA authority to the remote domain.
