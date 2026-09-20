from pathlib import Path

import pytest

from runtime.corruption_typology_graph import (
    CTGEdge,
    CTGError,
    CTGGraph,
    CTGNode,
    CorruptionTypologyGraphPolicy,
)


ROOT = Path(__file__).resolve().parents[1]
POLICY = CorruptionTypologyGraphPolicy.load(
    ROOT / "config" / "corruption-typology-graph-v0.1.json"
)


def node(node_id, kind):
    return CTGNode(
        node_id=node_id,
        kind=kind,
        label=f"Synthetic {kind}",
        description="Synthetic defensive test node.",
    )


def valid_graph():
    nodes = (
        node("typology", "TYPOLOGY"),
        node("trace", "TRACE"),
        node("flag", "RED_FLAG"),
        node("source", "SOURCE_CLASS"),
        node("question", "VERIFICATION_QUESTION"),
    )
    edges = (
        CTGEdge("typology", "trace", "MAY_LEAVE_TRACE"),
        CTGEdge("trace", "flag", "MAY_INDICATE"),
        CTGEdge("flag", "source", "TESTABLE_WITH"),
        CTGEdge("flag", "question", "ASK"),
    )
    return CTGGraph(nodes, edges)


def test_valid_defensive_pattern():
    POLICY.validate(valid_graph())


@pytest.mark.parametrize("missing_kind", ["TRACE", "SOURCE_CLASS", "VERIFICATION_QUESTION"])
def test_red_flag_requires_trace_source_and_question(missing_kind):
    graph = valid_graph()
    nodes = tuple(n for n in graph.nodes if n.kind != missing_kind)
    ids = {n.node_id for n in nodes}
    edges = tuple(e for e in graph.edges if e.source in ids and e.target in ids)
    with pytest.raises(CTGError, match="red flag missing"):
        POLICY.validate(CTGGraph(nodes, edges))


def test_public_ctg_rejects_case_specific_named_content():
    graph = valid_graph()
    extra = CTGNode(
        node_id="case-target",
        kind="ACTOR_ROLE",
        label="Synthetic named target",
        description="Synthetic only.",
        case_specific=True,
    )
    with pytest.raises(CTGError, match="case-specific"):
        POLICY.validate(CTGGraph(graph.nodes + (extra,), graph.edges))


def test_ctg_rejects_operational_evasion_detail():
    graph = valid_graph()
    unsafe = CTGNode(
        node_id="unsafe",
        kind="TYPOLOGY",
        label="Unsafe procedural detail",
        description="Synthetic marker only.",
        operational_evasion_detail=True,
    )
    with pytest.raises(CTGError, match="operational evasion"):
        POLICY.validate(CTGGraph(graph.nodes + (unsafe,), graph.edges))


def test_unknown_node_kind_fails_closed():
    graph = valid_graph()
    unknown = CTGNode("unknown", "UNREVIEWED_KIND", "Unknown", "Synthetic.")
    with pytest.raises(CTGError, match="unsupported CTG node kind"):
        POLICY.validate(CTGGraph(graph.nodes + (unknown,), graph.edges))


def test_policy_preserves_red_flag_not_finding_rule():
    assert POLICY.policy["invariants"]["red_flag_is_not_finding"] is True
    assert POLICY.policy["invariants"]["evidence_taxonomy_required_for_real_case_claims"] is True
