import pytest
from runtime.investigation_record import *
def rec(**kw):
 v=dict(record_id="r",case_id="c",revision=1,previous_digest=None,claim_refs=("claim",),source_locator_refs=("source",),red_flag_refs=("flag",),challenge_refs=("challenge",),review_events=("created",));v.update(kw);return InvestigationRecord(**v)
def test_private_record_valid_and_digest_deterministic(): r=rec();validate_record(r);assert r.digest()==r.digest()
def test_public_visibility_rejected():
 with pytest.raises(InvestigationRecordError,match="private"): validate_record(rec(visibility="PUBLIC"))
def test_public_repo_and_registry_are_invalid_case_backends():
 for b in ("PUBLIC_GITHUB_REPOSITORY","PRIVATE_REGISTRY_ARCHIVE"):
  with pytest.raises(InvestigationRecordError): validate_backend(b)
def test_revision_chain_required():
 with pytest.raises(InvestigationRecordError,match="chain"): validate_record(rec(revision=2))
