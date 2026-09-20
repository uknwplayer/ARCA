from runtime.adversarial_verification import *
def test_unresolved_critical_challenge_holds():
 d=decide([Challenge("PLAUSIBLE_ALTERNATIVE_EXPLANATION","synthetic")]);assert d.outcome=="HOLD_FOR_MORE_EVIDENCE"
def test_resolved_challenges_can_advance_only_to_human_review():
 d=decide([Challenge("MISSING_PROVENANCE","fixed",("s",),True,True)]);assert d.outcome=="ADVANCE_TO_HUMAN_REVIEW";validate(d)
def test_refuted_lead_is_rejected(): assert decide([],lead_refuted=True).outcome=="REJECT_LEAD"
def test_counter_evidence_is_preserved():
 c=Challenge("CONTRADICTORY_EVIDENCE","counter",("counter-source",));d=decide([c]);assert d.challenges[0].provenance_refs==("counter-source",)
