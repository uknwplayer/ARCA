from dataclasses import dataclass
import json
from pathlib import Path
from runtime.investigative_boundary import InvestigativeBoundary,InvestigativeAcquisitionRequest

class PublicDataError(ValueError): pass
@dataclass(frozen=True)
class PublicSource:
    id:str; publisher:str; source_class:str; access_method:str; canonical_public_url:str; format:str; public_access:bool
@dataclass(frozen=True)
class AcquisitionPlan:
    source_id:str; source_locator:str; persist_raw:bool=False

class PublicDataLayer:
    def __init__(self,boundary,sources):
        self.boundary=boundary; self.sources={s["id"]:PublicSource(**s) for s in sources["sources"]}
    @classmethod
    def load(cls,boundary_path,sources_path):
        return cls(InvestigativeBoundary.load(boundary_path),json.loads(Path(sources_path).read_text()))
    def plan(self,source_id):
        if source_id not in self.sources: raise PublicDataError("unknown public source")
        s=self.sources[source_id]
        self.boundary.authorize(InvestigativeAcquisitionRequest(s.source_class,s.access_method,s.public_access,s.canonical_public_url))
        if not s.canonical_public_url.startswith(("https://","http://")): raise PublicDataError("public locator required")
        return AcquisitionPlan(s.id,s.canonical_public_url,False)
