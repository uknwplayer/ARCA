from pathlib import Path
import pytest
from runtime.case_learning import CaseLearningPolicy,LearningRecord,CaseLearningError
ROOT=Path(__file__).resolve().parents[1]
P=CaseLearningPolicy.load(ROOT/"config"/"case-learning-pipeline-v0.1.json")
def rec(stage="SOURCE_LOCATED",**kw):
    v=dict(case_id="synthetic",stage=stage,source_locator_count=1,evidence_assessment_count=0,ctg_validated=False,human_reviewed=False);v.update(kw);return LearningRecord(**v)
def test_source_stage(): P.validate(rec())
def test_admission_requires_review():
    with pytest.raises(CaseLearningError,match="human review"): P.validate(rec("ADMITTED",evidence_assessment_count=1,ctg_validated=True))
def test_admitted_reviewed(): P.validate(rec("ADMITTED",evidence_assessment_count=1,ctg_validated=True,human_reviewed=True))
def test_candidate_requires_ctg():
    with pytest.raises(CaseLearningError,match="CTG"): P.validate(rec("CORPUS_CANDIDATE",evidence_assessment_count=1))
def test_policy_never_persists_raw_artifacts(): assert P.p["requirements"]["raw_artifact_persistence"] is False
