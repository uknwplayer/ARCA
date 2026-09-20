from dataclasses import dataclass
class AdversarialVerificationError(ValueError): pass
@dataclass(frozen=True)
class Challenge:
 kind:str;description:str;provenance_refs:tuple[str,...]=();critical:bool=True;resolved:bool=False
@dataclass(frozen=True)
class VerificationDecision:
 outcome:str;challenges:tuple[Challenge,...]
ALLOWED={"HOLD_FOR_MORE_EVIDENCE","ADVANCE_TO_HUMAN_REVIEW","REJECT_LEAD"}
def decide(challenges,*,lead_refuted=False):
 cs=tuple(challenges)
 if lead_refuted:return VerificationDecision("REJECT_LEAD",cs)
 if any(c.critical and not c.resolved for c in cs):return VerificationDecision("HOLD_FOR_MORE_EVIDENCE",cs)
 return VerificationDecision("ADVANCE_TO_HUMAN_REVIEW",cs)
def validate(d):
 if d.outcome not in ALLOWED:raise AdversarialVerificationError("unsupported outcome")
 if d.outcome=="ADVANCE_TO_HUMAN_REVIEW" and any(c.critical and not c.resolved for c in d.challenges):raise AdversarialVerificationError("unresolved critical challenge")
