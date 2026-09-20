from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable, Mapping


class CTGError(ValueError):
    pass


@dataclass(frozen=True)
class CTGNode:
    node_id: str
    kind: str
    label: str
    description: str
    case_specific: bool = False
    operational_evasion_detail: bool = False


@dataclass(frozen=True)
class CTGEdge:
    source: str
    target: str
    kind: str


@dataclass(frozen=True)
class CTGGraph:
    nodes: tuple[CTGNode, ...]
    edges: tuple[CTGEdge, ...]


class CorruptionTypologyGraphPolicy:
    def __init__(self, policy: Mapping[str, object]):
        if policy.get("schema") != "arca.corruption-typology-graph.v0.1":
            raise CTGError("unsupported CTG schema")
        self.policy = dict(policy)
        self.node_kinds = frozenset(policy.get("node_kinds", ()))
        self.edge_kinds = frozenset(policy.get("edge_kinds", ()))
        self.red_flag_requirements = frozenset(policy.get("red_flag_requirements", ()))

    @classmethod
    def load(cls, path: str | Path) -> "CorruptionTypologyGraphPolicy":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def validate(self, graph: CTGGraph, *, public_pattern: bool = True) -> None:
        if not graph.nodes:
            raise CTGError("CTG requires nodes")

        by_id: dict[str, CTGNode] = {}
        for node in graph.nodes:
            if not node.node_id.strip() or node.node_id in by_id:
                raise CTGError("CTG node ids must be non-empty and unique")
            if node.kind not in self.node_kinds:
                raise CTGError("unsupported CTG node kind")
            if not node.label.strip() or not node.description.strip():
                raise CTGError("CTG nodes require label and description")
            if public_pattern and node.case_specific:
                raise CTGError("case-specific nodes cannot enter public CTG patterns")
            if node.operational_evasion_detail:
                raise CTGError("operational evasion detail is outside CTG")
            by_id[node.node_id] = node

        adjacency: dict[str, set[str]] = {node_id: set() for node_id in by_id}
        for edge in graph.edges:
            if edge.kind not in self.edge_kinds:
                raise CTGError("unsupported CTG edge kind")
            if edge.source not in by_id or edge.target not in by_id:
                raise CTGError("CTG edge references unknown node")
            adjacency[edge.source].add(edge.target)
            adjacency[edge.target].add(edge.source)

        for node in graph.nodes:
            if node.kind != "RED_FLAG":
                continue
            neighbor_kinds = {by_id[n].kind for n in adjacency[node.node_id]}
            missing = self.red_flag_requirements - neighbor_kinds
            if missing:
                raise CTGError(
                    "red flag missing defensive verification links: "
                    + ",".join(sorted(missing))
                )
