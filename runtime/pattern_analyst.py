from dataclasses import dataclass
import json
from pathlib import Path

class PatternAnalystError(ValueError): pass
@dataclass(frozen=True)
class PatternLead:
    lead_id:str; typology_id:str; matched_traces:tuple[str,...]; verification_questions:tuple[str,...]; provenance_refs:tuple[str,...]; evidence_state:str="UNRESOLVED"

class PatternAnalyst:
    def __init__(self,p):
        if p.get("schema")!="arca.pattern-analyst.v0.1": raise PatternAnalystError("unsupported schema")
        self.p=p
    @classmethod
    def load(cls,path): return cls(json.loads(Path(path).read_text()))
    def build_lead(self,*,lead_id,typology_id,matched_traces,verification_questions,provenance_refs):
        lead=PatternLead(lead_id,typology_id,tuple(matched_traces),tuple(verification_questions),tuple(provenance_refs))
        self.validate(lead); return lead
    def validate(self,x):
        if x.evidence_state!="UNRESOLVED": raise PatternAnalystError("pattern lead must remain unresolved")
        if not x.lead_id.strip() or not x.typology_id.strip(): raise PatternAnalystError("lead and typology ids required")
        if not x.matched_traces: raise PatternAnalystError("matched traces required")
        if not x.verification_questions: raise PatternAnalystError("verification questions required")
        if not x.provenance_refs: raise PatternAnalystError("provenance required")
