from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

from runtime.investigative_boundary import InvestigativeBoundary,InvestigativeAcquisitionRequest
from runtime.evidence_taxonomy import EvidenceTaxonomy,EvidenceAssessment,SourceLocator
from runtime.corruption_typology_graph import CTGNode,CTGEdge,CTGGraph,CorruptionTypologyGraphPolicy
from runtime.typology_corpus import load_json,validate_typology_corpus
from runtime.case_learning import CaseLearningPolicy,LearningRecord
from runtime.pattern_analyst import PatternAnalyst
from runtime.public_data_layer import PublicDataLayer
from runtime.public_record_watcher import PublicRecordWatcherPolicy,WatchObservation
from runtime.temporal_relational import Event,Relation,timeline,validate_relation
from runtime.red_flag_engine import RedFlagMatch,evaluate
from runtime.autonomous_case_generation import generate,validate as validate_candidate
from runtime.investigative_mesh import InvestigativeChildSpec,build_public_mission
from runtime.adversarial_verification import Challenge,decide
from runtime.investigation_record import InvestigationRecord,validate_record,validate_backend,InvestigationRecordError

def main():
    boundary=InvestigativeBoundary.load(ROOT/"config"/"investigative-boundary-v0.1.json")
    boundary.authorize(InvestigativeAcquisitionRequest("public_procurement_record","public_http",True,"https://example.invalid/public-record"))

    taxonomy=EvidenceTaxonomy.load(ROOT/"config"/"evidence-taxonomy-v0.1.json")
    loc=SourceLocator("synthetic-public-register","2026-09-20T18:00:00Z",canonical_public_url="https://example.invalid/public-record",availability="AVAILABLE")
    taxonomy.validate(EvidenceAssessment("claim-1","Synthetic proposition.","UNRESOLVED",(loc,),"Synthetic rationale.","pilot","2026-09-20T18:01:00Z"))

    ctg=CorruptionTypologyGraphPolicy.load(ROOT/"config"/"corruption-typology-graph-v0.1.json")
    nodes=(CTGNode("t","TYPOLOGY","Synthetic typology","Defensive pilot."),CTGNode("tr","TRACE","Trace","Observable."),CTGNode("rf","RED_FLAG","Flag","Review lead."),CTGNode("s","SOURCE_CLASS","Source","Public source."),CTGNode("q","VERIFICATION_QUESTION","Question","Verify independently."))
    edges=(CTGEdge("t","tr","MAY_LEAVE_TRACE"),CTGEdge("tr","rf","MAY_INDICATE"),CTGEdge("rf","s","TESTABLE_WITH"),CTGEdge("rf","q","ASK"))
    ctg.validate(CTGGraph(nodes,edges))

    validate_typology_corpus(load_json(ROOT/"investigation"/"typologies"/"corpus-v0.1.json"),load_json(ROOT/"investigation"/"sources"/"typology-sources-v0.1.json"))

    analyst=PatternAnalyst.load(ROOT/"config"/"pattern-analyst-v0.1.json")
    lead=analyst.build_lead(lead_id="lead-1",typology_id="procurement.suspicious-bidding-patterns.v0.1",matched_traces=["trace-1"],verification_questions=["Can it be independently verified?"],provenance_refs=["source-1"])

    layer=PublicDataLayer.load(ROOT/"config"/"investigative-boundary-v0.1.json",ROOT/"investigation"/"sources"/"public-data-sources-v0.1.json")
    plan=layer.plan("br.tcu.webservices")
    assert plan.persist_raw is False

    watcher=PublicRecordWatcherPolicy.load(ROOT/"config"/"public-record-watcher-v0.1.json")
    watcher.validate(WatchObservation("watch-1","FACTUAL_CLAIM_VERIFICATION","https://example.invalid/publication","2026-09-20T18:02:00Z","public-context"))

    events=timeline([Event("e2","2026-09-20T18:04:00Z","synthetic",("source-2",)),Event("e1","2026-09-20T18:03:00Z","synthetic",("source-1",))])
    validate_relation(Relation("e1","e2","temporal-proximity","same synthetic window",("source-1","source-2"),"INFERRED_FOR_REVIEW"),{e.id for e in events})

    match=evaluate([RedFlagMatch("match-1",lead.typology_id,"synthetic review flag","trace-1",("source-1",),("Verify independently.",))])[0]
    candidate=generate(scope="synthetic public-interest pilot",red_flag_refs=[match.match_id],provenance_refs=list(match.provenance_refs),verification_questions=list(match.verification_questions))
    validate_candidate(candidate)

    mission=build_public_mission("investigative-pilot",[
      InvestigativeChildSpec("normalize","PUBLIC_SOURCE_NORMALIZATION"),
      InvestigativeChildSpec("trace","ABSTRACT_TRACE_EXTRACTION"),
      InvestigativeChildSpec("verify","SOURCE_LOCATOR_VERIFICATION"),
      InvestigativeChildSpec("match","TYPOLOGY_MATCHING"),
    ])
    assert len(mission.children)==4 and all(c.job.privacy=="public" and not c.job.secrets_required for c in mission.children)

    held=decide([Challenge("PLAUSIBLE_ALTERNATIVE_EXPLANATION","Synthetic alternative explanation.")])
    assert held.outcome=="HOLD_FOR_MORE_EVIDENCE"
    advanced=decide([Challenge("PLAUSIBLE_ALTERNATIVE_EXPLANATION","Reviewed.",("source-2",),True,True)])
    assert advanced.outcome=="ADVANCE_TO_HUMAN_REVIEW"

    record=InvestigationRecord("record-1",candidate.case_id,1,None,("claim-1",),("source-1",),(match.match_id,),("challenge-1",),("pilot-created",))
    validate_record(record)
    try:
        validate_backend("PUBLIC_GITHUB_REPOSITORY")
        raise AssertionError("public backend was not rejected")
    except InvestigationRecordError:
        pass

    learning=CaseLearningPolicy.load(ROOT/"config"/"case-learning-pipeline-v0.1.json")
    learning.validate(LearningRecord("synthetic-case","ADMITTED",1,1,True,True))

    roadmap=load_json(ROOT/"config"/"investigative-roadmap-v0.1.json")
    assert roadmap["roadmap_steps"]==16
    assert len(roadmap["components"])==16
    assert all(roadmap["validated_invariants"].values())
    assert roadmap["live_scope"]["live_real_world_investigation"]=="NOT_CLAIMED"

    print("ARCA investigative roadmap controlled pilot: PASS")
    print("raw_artifacts_persisted=false")
    print("case_visibility=PRIVATE_INVESTIGATION")
    print("mesh_children=4")
    print("adversarial_gate=ADVANCE_TO_HUMAN_REVIEW")
    print("record_digest="+record.digest())

if __name__=="__main__":
    main()
