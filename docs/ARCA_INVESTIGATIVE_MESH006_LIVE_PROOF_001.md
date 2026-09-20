# ARCA Investigative Mesh006 — Live Proof 001

Status: **LIVE VERIFIED**

## Canonical control plane

- Repository: `uknwplayer/ARCA`
- Workflow: `ARCA Investigative Mesh006 Live Proof`
- Workflow run: `35539487516`
- Canonical commit: `8c5e0b5955e4d99bfadc6f5e82ef3bb027558f50`
- Mission ID: `investigative-mesh006-live-35539487516`
- Conclusion: `success`
- Mission state: `COMPLETED`
- Completion policy: `all_required`
- Accepted children: `4`
- Failed children: `0`
- Cross-domain overlap observed: `true`

## Bounded child executions

| Child | Task class | Executor | Satellite run | Result SHA-256 | State |
|---|---|---|---:|---|---|
| `normalize` | `PUBLIC_SOURCE_NORMALIZATION` | `github-satellite-linux` | [35539494939](https://github.com/uknwplayer/arca-execution-satellite/actions/runs/35539494939) | `b2708fb1bd379c007244d4b095beb32a0fa41f4752cd100558c41601564a1d3e` | `ACCEPTED` |
| `traces` | `ABSTRACT_TRACE_EXTRACTION` | `github-satellite-b-linux` | [35539495374](https://github.com/uknwplayer/arca-execution-satellite-b/actions/runs/35539495374) | `b73a132b57657d291c98d554f7de98f637550cd03df8ea85e82c60ec3ee5b87e` | `ACCEPTED` |
| `locators` | `SOURCE_LOCATOR_VERIFICATION` | `github-satellite-linux` | [35539495967](https://github.com/uknwplayer/arca-execution-satellite/actions/runs/35539495967) | `702ee75ebbbb0c3dffaa529058a3d3109ce8a374784d07af126706f8c131498a` | `ACCEPTED` |
| `typology` | `TYPOLOGY_MATCHING` | `github-satellite-b-linux` | [35539497490](https://github.com/uknwplayer/arca-execution-satellite-b/actions/runs/35539497490) | `ba2f006ead7af77824382abbb24314e900fe37e1db0f71b517c68a28a1582397` | `ACCEPTED` |

Two independently addressable execution domains participated:

- `uknwplayer/arca-execution-satellite` / `github-git-queue`;
- `uknwplayer/arca-execution-satellite-b` / `github-git-queue-b`.

## Integrity evidence

- Mission receipt schema: `arca.executor-mission-receipt.v0.1`
- Aggregate SHA-256: `fd112d974d78d24f065d682071f7f0bbcaa55383fee2d6ab9b6fc19895f239b5`
- Artifact ID: `10614102263`
- Artifact name: `investigative-mesh006-live-proof-35539487516`
- Artifact digest: `sha256:3bfdabeb9974ca55a3150e5538cbf2c60530d53f71445b3c8fd267653c1e0c70`
- Artifact retention: 30 days from the run.
- Canonical run: [35539487516](https://github.com/uknwplayer/ARCA/actions/runs/35539487516)

## Boundary result

The live gate carried only bounded public JSON inputs. The proof reports:

- `public_sanitized_only=true`;
- `raw_artifacts_in_payload=false`;
- the dispatch credential remained an Actions secret and was redacted from logs;
- no private investigative case record or raw evidence was sent to either satellite;
- typology matching remained analytical support and did not become an adverse finding.

## Conclusion

The Mesh006 investigative fan-out gate is satisfied end to end:

`canonical mission -> four bounded dispatches -> two satellite domains -> four verified ACCEPTED receipts -> deterministic aggregate receipt`

This proof demonstrates bounded public investigative orchestration. It does not grant either satellite trust promotion, private-data access, arbitrary execution authority, or authority to publish investigative conclusions.
