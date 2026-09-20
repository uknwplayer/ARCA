from pathlib import Path
import pytest
from runtime.pattern_analyst import PatternAnalyst,PatternLead,PatternAnalystError
ROOT=Path(__file__).resolve().parents[1]; A=PatternAnalyst.load(ROOT/"config"/"pattern-analyst-v0.1.json")
def test_builds_bounded_unresolved_lead():
    x=A.build_lead(lead_id="synthetic",typology_id="t",matched_traces=["trace"],verification_questions=["verify?"],provenance_refs=["source:1"]);assert x.evidence_state=="UNRESOLVED"
def test_cannot_promote_match_to_finding():
    x=PatternLead("l","t",("x",),("q",),("s",),"OFFICIALLY_CONFIRMED")
    with pytest.raises(PatternAnalystError,match="unresolved"): A.validate(x)
def test_provenance_required():
    with pytest.raises(PatternAnalystError,match="provenance"): A.build_lead(lead_id="l",typology_id="t",matched_traces=["x"],verification_questions=["q"],provenance_refs=[])
def test_no_guilt_probability_contract(): assert "guilt_probability" in A.p["forbidden"]
