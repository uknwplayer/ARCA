from dataclasses import dataclass
import json
from pathlib import Path

class CaseLearningError(ValueError): pass

@dataclass(frozen=True)
class LearningRecord:
    case_id: str
    stage: str
    source_locator_count: int
    evidence_assessment_count: int
    ctg_validated: bool=False
    human_reviewed: bool=False

class CaseLearningPolicy:
    def __init__(self,p):
        if p.get("schema")!="arca.case-learning-pipeline.v0.1": raise CaseLearningError("unsupported schema")
        self.p=p; self.stages=frozenset(p["stages"])
    @classmethod
    def load(cls,path): return cls(json.loads(Path(path).read_text()))
    def validate(self,r):
        if r.stage not in self.stages: raise CaseLearningError("unsupported stage")
        if r.source_locator_count < 1: raise CaseLearningError("source locator required")
        if r.stage not in {"SOURCE_LOCATED","CLAIMS_EXTRACTED"} and r.evidence_assessment_count < 1:
            raise CaseLearningError("evidence assessment required")
        if r.stage in {"CORPUS_CANDIDATE","HUMAN_REVIEWED","ADMITTED"} and not r.ctg_validated:
            raise CaseLearningError("CTG validation required")
        if r.stage=="ADMITTED" and not r.human_reviewed:
            raise CaseLearningError("human review required for admission")
