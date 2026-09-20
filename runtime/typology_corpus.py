from __future__ import annotations

import json
from pathlib import Path
from typing import Mapping


class TypologyCorpusError(ValueError):
    pass


def load_json(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_typology_corpus(corpus: Mapping[str, object], source_registry: Mapping[str, object]) -> None:
    if corpus.get("schema") != "arca.defensive-typology-corpus.v0.1":
        raise TypologyCorpusError("unsupported typology corpus schema")
    if source_registry.get("schema") != "arca.typology-source-registry.v0.1":
        raise TypologyCorpusError("unsupported typology source registry schema")

    registered_sources = {}
    for source in source_registry.get("sources", []):
        source_id = source.get("id", "").strip()
        if not source_id or source_id in registered_sources:
            raise TypologyCorpusError("source ids must be non-empty and unique")
        if not source.get("publisher", "").strip() or not source.get("title", "").strip():
            raise TypologyCorpusError("source publisher and title are required")
        url = source.get("canonical_public_url", "")
        if not (url.startswith("https://") or url.startswith("http://")):
            raise TypologyCorpusError("source requires public URL locator")
        if not source.get("retrieved_at", "").strip():
            raise TypologyCorpusError("source retrieval date is required")
        registered_sources[source_id] = source

    entries = corpus.get("entries", [])
    if not entries:
        raise TypologyCorpusError("typology corpus cannot be empty")

    seen = set()
    for entry in entries:
        entry_id = entry.get("id", "").strip()
        if not entry_id or entry_id in seen:
            raise TypologyCorpusError("typology ids must be non-empty and unique")
        seen.add(entry_id)

        for field in ("title", "scope"):
            if not entry.get(field, "").strip():
                raise TypologyCorpusError(f"typology requires {field}")

        for field in ("traces", "red_flags", "source_classes", "verification_questions", "sources"):
            values = entry.get(field, [])
            if not values or not all(isinstance(v, str) and v.strip() for v in values):
                raise TypologyCorpusError(f"typology requires non-empty {field}")

        if entry.get("match_is_finding") is not False:
            raise TypologyCorpusError("typology match must never be encoded as a finding")

        unknown_sources = set(entry["sources"]) - set(registered_sources)
        if unknown_sources:
            raise TypologyCorpusError("typology references unregistered source")

        # V0.1 requires enough defensive context to prevent orphan red flags.
        if len(entry["verification_questions"]) < len(entry["red_flags"]):
            raise TypologyCorpusError("every red flag requires a verification question")
        if len(entry["traces"]) < len(entry["red_flags"]):
            raise TypologyCorpusError("every red flag requires an observable trace")
