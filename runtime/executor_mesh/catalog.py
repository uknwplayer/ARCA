from __future__ import annotations

import json
from pathlib import Path

from .model import ExecutorDescriptor
from .registry import ExecutorRegistry


def load_descriptor(path: str | Path) -> ExecutorDescriptor:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema") != "arca.executor-descriptor.v0.1":
        raise ValueError("unsupported executor descriptor schema")
    descriptor = ExecutorDescriptor(
        executor_id=data["executor_id"],
        provider_family=data["provider_family"],
        capabilities=frozenset(data.get("capabilities", [])),
        trust_state=data.get("trust_state", "DECLARED"),
        admission_state=data.get("admission_state", "CANDIDATE"),
        available=bool(data.get("available", True)),
        accepts_private=bool(data.get("accepts_private", False)),
        accepts_secrets=bool(data.get("accepts_secrets", False)),
        fixed_cost_microunits=int(data.get("fixed_cost_microunits", 0)),
        cost_per_second_microunits=int(data.get("cost_per_second_microunits", 0)),
        queue_seconds=int(data.get("queue_seconds", 0)),
        speed_factor=float(data.get("speed_factor", 1.0)),
        reliability=float(data.get("reliability", 1.0)),
        scarce_capabilities=frozenset(data.get("scarce_capabilities", [])),
        region=data.get("region"),
        metadata=data.get("metadata", {}),
    )
    descriptor.validate()
    return descriptor


def load_registry(root: str | Path) -> ExecutorRegistry:
    registry = ExecutorRegistry()
    for path in sorted(Path(root).glob("*.json")):
        registry.register(load_descriptor(path))
    return registry
