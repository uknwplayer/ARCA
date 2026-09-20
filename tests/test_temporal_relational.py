import pytest
from runtime.temporal_relational import *
def e(i,t):return Event(i,t,"synthetic",("source:"+i,))
def test_timeline_is_deterministic(): assert [x.id for x in timeline([e("b","2026-01-02T00:00:00Z"),e("a","2026-01-01T00:00:00Z")])]==["a","b"]
def test_relation_requires_provenance():
 with pytest.raises(TemporalRelationError): validate_relation(Relation("a","b","linked","basis",()),{"a","b"})
def test_inference_is_explicit_review_state(): validate_relation(Relation("a","b","temporal-proximity","same window",("s",),"INFERRED_FOR_REVIEW"),{"a","b"})
def test_no_causation_status_exists(): assert "CAUSED_BY" not in ALLOWED_STATUS
