import pytest
from runtime.red_flag_engine import *
def m(**kw):
 v=dict(match_id="m",typology_id="t",red_flag="synthetic flag",matched_trace="synthetic trace",provenance_refs=("s",),verification_questions=("verify?",));v.update(kw);return RedFlagMatch(**v)
def test_match(): assert len(evaluate([m()]))==1
def test_provenance_required():
 with pytest.raises(RedFlagError,match="provenance"): evaluate([m(provenance_refs=())])
def test_question_required():
 with pytest.raises(RedFlagError,match="question"): evaluate([m(verification_questions=())])
def test_contradictory_refs_preserved(): assert evaluate([m(contradictory_refs=("counter",))])[0].contradictory_refs==("counter",)
