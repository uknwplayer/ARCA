from pathlib import Path
import pytest
from runtime.public_data_layer import PublicDataLayer,PublicDataError
ROOT=Path(__file__).resolve().parents[1]
L=PublicDataLayer.load(ROOT/"config"/"investigative-boundary-v0.1.json",ROOT/"investigation"/"sources"/"public-data-sources-v0.1.json")
def test_all_seed_sources_plan_without_raw_persistence():
    for sid in L.sources:
        p=L.plan(sid);assert p.persist_raw is False;assert p.source_locator.startswith("http")
def test_unknown_source_fails_closed():
    with pytest.raises(PublicDataError,match="unknown"): L.plan("unknown")
def test_sources_are_public(): assert all(s.public_access for s in L.sources.values())

def test_pncp_is_registered_as_bounded_public_procurement_source():
    s=L.sources["br.pncp.public-api"]
    assert s.source_class=="public_procurement_record"
    assert s.access_method=="official_public_api"
    assert s.public_access is True
    p=L.plan("br.pncp.public-api")
    assert p.persist_raw is False
    assert p.source_locator.startswith("https://pncp.gov.br/")
