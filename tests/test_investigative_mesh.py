import pytest
from runtime.investigative_mesh import *
def specs(): return [InvestigativeChildSpec("a","PUBLIC_SOURCE_NORMALIZATION"),InvestigativeChildSpec("b","TYPOLOGY_MATCHING"),InvestigativeChildSpec("c","SOURCE_LOCATOR_VERIFICATION"),InvestigativeChildSpec("d","ABSTRACT_TRACE_EXTRACTION")]
def test_four_child_public_mission_for_mesh006():
 m=build_public_mission("inv-synthetic",specs());assert len(m.children)==4;assert all(not c.job.secrets_required and c.job.privacy=="public" for c in m.children)
def test_case_sensitive_rejected():
 with pytest.raises(InvestigativeMeshError,match="sanitized"): build_public_mission("m",[InvestigativeChildSpec("a","TYPOLOGY_MATCHING",contains_case_sensitive_data=True)])
def test_raw_artifact_rejected():
 with pytest.raises(InvestigativeMeshError,match="raw artifact"): build_public_mission("m",[InvestigativeChildSpec("a","TYPOLOGY_MATCHING",contains_raw_artifact=True)])
def test_secret_job_rejected():
 with pytest.raises(InvestigativeMeshError,match="secret"): build_public_mission("m",[InvestigativeChildSpec("a","TYPOLOGY_MATCHING",secrets_required=True)])
