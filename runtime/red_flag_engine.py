from dataclasses import dataclass
class RedFlagError(ValueError): pass
@dataclass(frozen=True)
class RedFlagMatch:
 match_id:str;typology_id:str;red_flag:str;matched_trace:str;provenance_refs:tuple[str,...];verification_questions:tuple[str,...];contradictory_refs:tuple[str,...]=()
def validate_match(m):
 for v in (m.match_id,m.typology_id,m.red_flag,m.matched_trace):
  if not v.strip(): raise RedFlagError("match fields required")
 if not m.provenance_refs: raise RedFlagError("provenance required")
 if not m.verification_questions: raise RedFlagError("verification question required")
def evaluate(rule_matches):
 out=tuple(rule_matches)
 for m in out: validate_match(m)
 return out
