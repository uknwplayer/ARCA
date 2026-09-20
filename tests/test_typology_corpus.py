from copy import deepcopy
from pathlib import Path

import pytest

from runtime.typology_corpus import (
    TypologyCorpusError,
    load_json,
    validate_typology_corpus,
)


ROOT = Path(__file__).resolve().parents[1]
CORPUS = load_json(ROOT / "investigation" / "typologies" / "corpus-v0.1.json")
SOURCES = load_json(ROOT / "investigation" / "sources" / "typology-sources-v0.1.json")


def test_seed_corpus_is_valid_and_source_backed():
    validate_typology_corpus(CORPUS, SOURCES)
    assert len(CORPUS["entries"]) >= 3


def test_every_seed_typology_is_explicitly_not_a_finding():
    assert all(entry["match_is_finding"] is False for entry in CORPUS["entries"])


def test_every_source_is_locator_not_embedded_raw_artifact():
    for source in SOURCES["sources"]:
        assert source["canonical_public_url"].startswith("http")
        assert "raw_content" not in source
        assert "file_blob" not in source


def test_unknown_source_reference_fails_closed():
    corpus = deepcopy(CORPUS)
    corpus["entries"][0]["sources"] = ["unregistered.source"]
    with pytest.raises(TypologyCorpusError, match="unregistered source"):
        validate_typology_corpus(corpus, SOURCES)


def test_red_flag_without_verification_question_is_rejected():
    corpus = deepcopy(CORPUS)
    corpus["entries"][0]["verification_questions"] = []
    with pytest.raises(TypologyCorpusError, match="verification_questions"):
        validate_typology_corpus(corpus, SOURCES)


def test_red_flag_without_observable_trace_is_rejected():
    corpus = deepcopy(CORPUS)
    corpus["entries"][0]["traces"] = []
    with pytest.raises(TypologyCorpusError, match="traces"):
        validate_typology_corpus(corpus, SOURCES)


def test_match_cannot_be_promoted_to_finding_by_corpus():
    corpus = deepcopy(CORPUS)
    corpus["entries"][0]["match_is_finding"] = True
    with pytest.raises(TypologyCorpusError, match="never be encoded as a finding"):
        validate_typology_corpus(corpus, SOURCES)
