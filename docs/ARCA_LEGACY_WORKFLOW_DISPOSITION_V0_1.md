# ARCA Legacy Workflow Disposition V0.1

Status: REVIEWED  
Date: 2026-09-20

All 18 workflow wrappers found only in the legacy private core now have an explicit destination. None is copied wholesale.

Three local validation wrappers are retired because their underlying tests already execute in canonical CI: federation-response validation, node-introduction validation and Mega Brain dispatch validation.

Six A2A public-network wrappers are retained as capability requirements but will be rebuilt behind a bounded public-network execution profile instead of restoring arbitrary workflow inputs directly.

Four Machine Bridge controller/worker wrappers are preserved as architectural input and must be reconciled with the current Executor Mesh control/provider model. Their old durable queue state is not reactivated.

Three signed federation operations are private operational functions: introduction delivery, A→B probe and B→A reconciliation. They require private identity/transport configuration and therefore do not belong in the public core workflow set.

The live provider-specific Gemini wrapper is rehomed to provider integration/operations. Status-email is rehomed to the notification/operations layer.

This disposition preserves the capabilities while removing duplicate control planes.

## Next consolidation gates

The legacy repository remains unfrozen while the current execution plane and private operational domains are wired. No old workflow receives trust, credentials, network scope or write authority through this document.
