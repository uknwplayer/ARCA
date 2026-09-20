from dataclasses import dataclass
import hashlib,json
class CaseGenerationError(ValueError): pass
@dataclass(frozen=True)
class CaseCandidate:
 case_id:str;fingerprint:str;scope:str;red_flag_refs:tuple[str,...];provenance_refs:tuple[str,...];verification_questions:tuple[str,...];evidence_state:str="UNRESOLVED";visibility:str="PRIVATE_REVIEW"
def generate(*,scope,red_flag_refs,provenance_refs,verification_questions):
 if not scope.strip(): raise CaseGenerationError("scope required")
 if not red_flag_refs or not provenance_refs or not verification_questions: raise CaseGenerationError("red flags, provenance and verification required")
 seed=json.dumps([scope,sorted(red_flag_refs),sorted(provenance_refs)],separators=(",",":"),ensure_ascii=True)
 fp=hashlib.sha256(seed.encode()).hexdigest()
 return CaseCandidate("case-"+fp[:16],fp,scope,tuple(red_flag_refs),tuple(provenance_refs),tuple(verification_questions))
def validate(c):
 if c.evidence_state!="UNRESOLVED": raise CaseGenerationError("candidate must start unresolved")
 if c.visibility!="PRIVATE_REVIEW": raise CaseGenerationError("candidate must remain private review")
