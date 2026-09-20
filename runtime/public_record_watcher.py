from dataclasses import dataclass
import json
from pathlib import Path

class PublicRecordWatcherError(ValueError): pass
@dataclass(frozen=True)
class WatchObservation:
    record_id:str; category:str; source_locator:str; retrieved_at:str; context_locator:str; review_state:str="HUMAN_REVIEW_REQUIRED"; content_sha256:str|None=None

class PublicRecordWatcherPolicy:
    def __init__(self,p):
        if p.get("schema")!="arca.public-record-watcher.v0.1": raise PublicRecordWatcherError("unsupported schema")
        self.p=p;self.categories=frozenset(p["review_categories"])
    @classmethod
    def load(cls,path): return cls(json.loads(Path(path).read_text()))
    def validate(self,o):
        if o.category not in self.categories: raise PublicRecordWatcherError("unsupported review category")
        if o.review_state!="HUMAN_REVIEW_REQUIRED": raise PublicRecordWatcherError("human review required")
        for v in (o.record_id,o.source_locator,o.retrieved_at,o.context_locator):
            if not v.strip(): raise PublicRecordWatcherError("provenance/context fields required")
        if not o.source_locator.startswith(("http://","https://","source:")): raise PublicRecordWatcherError("invalid source locator")
