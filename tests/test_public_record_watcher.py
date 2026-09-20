from pathlib import Path
import pytest
from runtime.public_record_watcher import *
ROOT=Path(__file__).resolve().parents[1];P=PublicRecordWatcherPolicy.load(ROOT/"config"/"public-record-watcher-v0.1.json")
def obs(**kw):
 v=dict(record_id="synthetic",category="FACTUAL_CLAIM_VERIFICATION",source_locator="https://example.invalid/post",retrieved_at="2026-09-20T18:00:00Z",context_locator="public-post:synthetic");v.update(kw);return WatchObservation(**v)
def test_neutral_review_observation(): P.validate(obs())
def test_unknown_category_rejected():
 with pytest.raises(PublicRecordWatcherError): P.validate(obs(category="VOTE_AGAINST"))
def test_human_review_cannot_be_bypassed():
 with pytest.raises(PublicRecordWatcherError,match="human review"): P.validate(obs(review_state="AUTO_PUBLISH"))
def test_political_influence_outputs_forbidden():
 assert {"vote_recommendation","politician_ranking","electability_assessment","election_prediction","political_persuasion"} <= set(P.p["forbidden"])
