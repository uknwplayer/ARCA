import pytest
from runtime.autonomous_case_generation import *
def test_candidate_is_private_unresolved_and_deterministic():
 a=generate(scope="synthetic public procurement review",red_flag_refs=["r"],provenance_refs=["s"],verification_questions=["q"])
 b=generate(scope="synthetic public procurement review",red_flag_refs=["r"],provenance_refs=["s"],verification_questions=["q"])
 assert a.fingerprint==b.fingerprint;validate(a);assert a.visibility=="PRIVATE_REVIEW"
def test_missing_provenance_rejected():
 with pytest.raises(CaseGenerationError): generate(scope="x",red_flag_refs=["r"],provenance_refs=[],verification_questions=["q"])
def test_auto_promotion_rejected():
 c=generate(scope="x",red_flag_refs=["r"],provenance_refs=["s"],verification_questions=["q"])
 with pytest.raises(CaseGenerationError): validate(CaseCandidate(c.case_id,c.fingerprint,c.scope,c.red_flag_refs,c.provenance_refs,c.verification_questions,"OFFICIALLY_CONFIRMED",c.visibility))
