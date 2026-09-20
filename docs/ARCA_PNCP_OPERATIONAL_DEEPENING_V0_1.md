# PNCP Operational Deepening V0.1

Recovered from the legacy ARCA 0.4 work and adapted to the current PNCP discovery V2 contract.

The operational layer is fail-closed for real network access and accepts only the allowlisted public PNCP GET transport. Successful responses enter the existing acquisition/custody path before AIE normalization. Repository persistence of raw responses is not part of this module.

The deepening scheduler deterministically deduplicates discovered procurement targets, applies per-run target/failure budgets, checkpoints derived progress outside the repository, and does not silently replay failed targets. Analytical output remains a review artifact: anomaly is not irregularity and human review remains required.

This capability does not authorize private-data acquisition, authentication bypass, repository storage of raw investigative material, or automatic adverse findings.
