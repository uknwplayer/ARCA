# Worker Action Registry

The Worker Agent uses an explicit action registry. A job can request only a registered action; unknown actions are delegated rather than executed or failed.

An action declares required capabilities and receives a constrained context. The registry does not expose arbitrary shell evaluation.

Audit events are append-only JSON Lines records suitable for later chain-of-custody hashing/export.
