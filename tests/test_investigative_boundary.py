from pathlib import Path

import pytest

from runtime.investigative_boundary import (
    InvestigativeAcquisitionRequest,
    InvestigativeBoundary,
    InvestigativeBoundaryError,
)


ROOT = Path(__file__).resolve().parents[1]
BOUNDARY = InvestigativeBoundary.load(ROOT / "config" / "investigative-boundary-v0.1.json")


def request(**overrides):
    values = {
        "source_class": "public_procurement_record",
        "access_method": "public_http",
        "public_access": True,
        "provenance": "https://public.example/record/1",
        "flags": frozenset(),
    }
    values.update(overrides)
    return InvestigativeAcquisitionRequest(**values)


def test_allows_public_provenanced_procurement_record():
    BOUNDARY.authorize(request())


def test_allows_user_supplied_material_as_input_without_claiming_public_access():
    BOUNDARY.authorize(request(
        source_class="user_supplied_material",
        access_method="user_supplied",
        public_access=False,
        provenance="user-upload:case-video-001",
    ))


@pytest.mark.parametrize("flag", sorted(BOUNDARY.forbidden_flags))
def test_rejects_every_machine_declared_forbidden_flag(flag):
    with pytest.raises(InvestigativeBoundaryError, match="forbidden acquisition flags"):
        BOUNDARY.authorize(request(flags=frozenset({flag})))


def test_rejects_private_autonomous_source():
    with pytest.raises(InvestigativeBoundaryError, match="public access"):
        BOUNDARY.authorize(request(public_access=False))


def test_rejects_unknown_source_class_fail_closed():
    with pytest.raises(InvestigativeBoundaryError, match="not allowlisted"):
        BOUNDARY.authorize(request(source_class="new_unreviewed_source"))


def test_rejects_unknown_access_method_fail_closed():
    with pytest.raises(InvestigativeBoundaryError, match="not allowlisted"):
        BOUNDARY.authorize(request(access_method="unreviewed_method"))


def test_requires_provenance():
    with pytest.raises(InvestigativeBoundaryError, match="provenance"):
        BOUNDARY.authorize(request(provenance=""))


def test_policy_forbids_raw_investigative_repository_storage():
    assert BOUNDARY.policy["requirements"]["raw_investigative_files_not_committed"] is True
    assert BOUNDARY.policy["requirements"]["persist_derived_knowledge_only"] is True
    with pytest.raises(InvestigativeBoundaryError, match="forbidden acquisition flags"):
        BOUNDARY.authorize(request(flags=frozenset({"raw_investigative_artifact_repository_storage"})))


def test_policy_requires_reproducible_source_locator():
    requirements = BOUNDARY.policy["requirements"]
    assert requirements["source_locator_required_for_persisted_derived_knowledge"] is True
    fields = set(requirements["source_locator_may_include"])
    assert {"canonical_public_url", "public_record_id", "retrieved_at", "content_sha256"} <= fields
